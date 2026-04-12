import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { YouTubeClient } from './youtube-client'
import { parseYouTubeSearchResults } from './youtube-search'
import { toStreamInfo, toTrackMetadata } from './youtube-stream'
import type { YouTubeFetch, YouTubeMusicSettings } from './youtube-types'
import { resolveYtDlpPath } from './yt-dlp-binary'

const execFileAsync = promisify(execFile)

const PLUGIN_ID = 'compass-plugin-youtube-music'

const DEFAULT_SETTINGS: YouTubeMusicSettings = {
  searchLimit: 20,
  preferAudioOnly: true
}

class YouTubeMusicDataSourcePlugin {
  readonly id = PLUGIN_ID
  readonly name = 'YouTube Music'

  private context?: any
  private settings: YouTubeMusicSettings = DEFAULT_SETTINGS
  private client = this.createClient(globalThis.fetch)

  async activate(context: any): Promise<void> {
    this.context = context
    this.refreshSettings()
    context.log('info', 'YouTube Music data source plugin activated')
  }

  async deactivate(): Promise<void> {
    this.context?.log('info', 'YouTube Music data source plugin deactivated')
  }

  async search(query: string, options?: any): Promise<any[]> {
    this.refreshSettings()
    const limit = options?.limit ?? this.settings.searchLimit

    try {
      const html = await this.client.fetchSearchPage(query)
      return parseYouTubeSearchResults(html, {
        limit,
        source: this.id,
        onWarn: message => this.context?.log('warn', message),
        onError: (message, error) => this.context?.log('error', message, error)
      })
    } catch (error) {
      if (error instanceof Error) {
        this.context?.log('error', 'Search failed:', error.message)
      } else {
        this.context?.log('error', 'Search failed:', error)
      }
      return []
    }
  }

  async resolveStream(track: any): Promise<any> {
    this.refreshSettings()
    const videoId = track.source.externalId || track.id
    if (!videoId) {
      throw new Error('No videoId provided in track')
    }

    try {
      return await this.resolvePlayableStream(videoId)
    } catch (error) {
      this.context?.log('warn', 'Primary YouTube video failed, trying fallback:', error)
      const fallbackStream = await this.resolveStreamFromFallbackSearch(track, videoId)
      if (fallbackStream) {
        return fallbackStream
      }

      this.context?.log('error', 'Failed to resolve stream:', error)
      throw error
    }
  }

  async getMetadata(track: any): Promise<any> {
    this.refreshSettings()
    const videoId = track.source.externalId || track.id

    try {
      const playerResponse = await this.client.fetchPlayer(videoId)
      return toTrackMetadata(playerResponse, track.id)
    } catch (error) {
      this.context?.log('error', 'Failed to get metadata:', error)
      return { title: track.id }
    }
  }

  async getLyrics(_track: any): Promise<any> {
    return null
  }

  private refreshSettings(): void {
    if (!this.context) return

    this.settings = {
      searchLimit: this.context.getSetting<number>('searchLimit') ?? 20,
      preferAudioOnly: this.context.getSetting<boolean>('preferAudioOnly') ?? true,
      region: this.context.getSetting<string>('region')
    }
    this.client = this.createClient(this.context.fetch ?? globalThis.fetch)
  }

  private createClient(fetchImpl: YouTubeFetch): YouTubeClient {
    return new YouTubeClient({
      fetch: fetchImpl,
      region: this.settings.region
    })
  }

  private async resolvePlayableStream(videoId: string): Promise<StreamInfo> {
    try {
      const playerResponse = await this.client.fetchPlayer(videoId, {
        requirePlayable: true
      })
      return toStreamInfo(playerResponse, this.settings.preferAudioOnly)
    } catch (error) {
      this.context?.log('warn', `Player API failed for ${videoId}, trying yt-dlp`, error)
      return this.resolveStreamWithYtDlp(videoId)
    }
  }

  private async resolveStreamWithYtDlp(videoId: string): Promise<StreamInfo> {
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`
    const fetchImpl = this.context?.fetch ?? globalThis.fetch

    const command = await resolveYtDlpPath(fetchImpl)
    const { stdout } = await execFileAsync(
      command,
      [
        '--dump-single-json',
        '--no-playlist',
        '--no-warnings',
        '--skip-download',
        '-f',
        'ba[protocol!=m3u8]/ba/bestaudio',
        videoUrl
      ],
      {
        timeout: 20_000,
        maxBuffer: 8 * 1024 * 1024
      }
    )
    const payload = JSON.parse(stdout) as {
      url?: string
      ext?: string
      abr?: number
      http_headers?: Record<string, string>
    }

    if (!payload.url) {
      throw new Error(`yt-dlp did not return a playable URL for ${videoId}`)
    }

    return {
      url: payload.url,
      format: payload.ext === 'webm' ? 'webm' : 'm4a',
      bitrate: payload.abr ? Math.round(payload.abr * 1000) : undefined,
      headers: payload.http_headers
    }
  }

  private async resolveStreamFromFallbackSearch(
    track: any,
    excludedVideoId: string
  ): Promise<any> {
    const fallbackQuery = [track.title, track.artist].filter(Boolean).join(' ').trim()
    if (!fallbackQuery) {
      return null
    }

    const candidates = await this.search(fallbackQuery, { limit: 5 })
    for (const candidate of candidates) {
      const candidateVideoId = candidate.id
      if (!candidateVideoId || candidateVideoId === excludedVideoId) {
        continue
      }

      try {
        const stream = await this.resolvePlayableStream(candidateVideoId)
        this.context?.log(
          'info',
          `Resolved fallback YouTube stream with candidate: ${candidateVideoId}`
        )
        return stream
      } catch (error) {
        this.context?.log(
          'warn',
          `Fallback YouTube candidate not playable: ${candidateVideoId}`,
          error
        )
      }
    }

    return null
  }
}

const plugin = new YouTubeMusicDataSourcePlugin()

export { YouTubeMusicDataSourcePlugin }
export default plugin
