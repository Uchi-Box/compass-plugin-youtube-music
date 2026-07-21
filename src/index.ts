import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type {
  PluginContext,
  SearchOptions,
  SourceProvider,
  SourceSearchResult,
  StreamInfo,
  TrackMetadata,
  TrackRef
} from './compass-plugin-api'
import { YouTubeClient } from './youtube-client'
import { parseYouTubeSearchResults } from './youtube-search'
import { toStreamInfo, toTrackMetadata } from './youtube-stream'
import type { YouTubeFetch, YouTubeMusicSettings } from './youtube-types'
import { resolveYtDlpPath } from './yt-dlp-binary'

const execFileAsync = promisify(execFile)

/** Source id — matches `contributes.sources[].id` in package.json. */
const SOURCE_ID = 'youtube-music'

const DEFAULT_SETTINGS: YouTubeMusicSettings = {
  searchLimit: 20,
  preferAudioOnly: true
}

class YouTubeMusicPlugin {
  private context?: PluginContext
  private settings: YouTubeMusicSettings = DEFAULT_SETTINGS
  private client = this.createClient(globalThis.fetch)

  async activate(context: PluginContext): Promise<void> {
    this.context = context
    this.refreshSettings()

    // Register the music source (capability `sources`)
    const provider: SourceProvider = {
      search: (q, opts) => this.search(q, opts),
      resolveStream: ref => this.resolveStream(ref),
      getMetadata: ref => this.getMetadata(ref),
      getLyrics: () => this.getLyrics()
    }
    if (!context.sources) throw new Error('YouTube Music plugin requires the `sources` capability')
    context.subscriptions.push(context.sources.register(SOURCE_ID, provider))

    context.log('info', 'YouTube Music source plugin activated')
  }

  async deactivate(): Promise<void> {
    this.context?.log('info', 'YouTube Music source plugin deactivated')
  }

  async search(query: string, options?: SearchOptions): Promise<SourceSearchResult[]> {
    this.refreshSettings()
    const limit = options?.limit ?? this.settings.searchLimit

    try {
      const html = await this.client.fetchSearchPage(query)
      const parsed = parseYouTubeSearchResults(html, {
        limit,
        source: SOURCE_ID,
        onWarn: message => this.context?.log('warn', message),
        onError: (message, error) => this.context?.log('error', message, error)
      })
      return parsed.map(
        (r: { id: string; title: string; artist: string; album?: string; coverUrl?: string; duration?: number }): SourceSearchResult => ({
          ref: { source: SOURCE_ID, id: r.id },
          title: r.title,
          artist: r.artist,
          album: r.album,
          coverUrl: r.coverUrl,
          duration: r.duration
        })
      )
    } catch (error) {
      if (error instanceof Error) {
        this.context?.log('error', 'Search failed:', error.message)
      } else {
        this.context?.log('error', 'Search failed:', error)
      }
      return []
    }
  }

  async resolveStream(ref: TrackRef): Promise<StreamInfo> {
    this.refreshSettings()
    const videoId = ref?.id
    if (!videoId) {
      throw new Error('No videoId provided in track ref')
    }

    try {
      return await this.resolvePlayableStream(videoId)
    } catch (error) {
      this.context?.log('warn', 'Primary YouTube video failed, trying fallback:', error)
      const fallbackStream = await this.resolveStreamFromFallbackSearch(videoId)
      if (fallbackStream) {
        return fallbackStream
      }

      this.context?.log('error', 'Failed to resolve stream:', error)
      throw error
    }
  }

  async getMetadata(ref: TrackRef): Promise<TrackMetadata | null> {
    this.refreshSettings()
    const videoId = ref?.id
    if (!videoId) return null

    try {
      const playerResponse = await this.client.fetchPlayer(videoId)
      return toTrackMetadata(playerResponse, videoId)
    } catch (error) {
      this.context?.log('error', 'Failed to get metadata:', error)
      return null
    }
  }

  async getLyrics(): Promise<null> {
    return null
  }

  private refreshSettings(): void {
    if (!this.context) return

    this.settings = {
      searchLimit: this.context.config.get<number>('searchLimit') ?? 20,
      preferAudioOnly: this.context.config.get<boolean>('preferAudioOnly') ?? true,
      region: this.context.config.get<string>('region')
    }
    this.client = this.createClient(this.context.net?.fetch ?? globalThis.fetch)
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
    const fetchImpl = this.context?.net?.fetch ?? globalThis.fetch

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
    excludedVideoId: string
  ): Promise<StreamInfo | null> {
    // Re-search using the excluded video's metadata as the query.
    let fallbackQuery = ''
    try {
      const meta = await this.getMetadata({ source: SOURCE_ID, id: excludedVideoId })
      fallbackQuery = [meta?.title, meta?.artist].filter(Boolean).join(' ').trim()
    } catch {
      /* metadata unavailable — no fallback query */
    }
    if (!fallbackQuery) {
      return null
    }

    const candidates = await this.search(fallbackQuery, { limit: 5 })
    for (const candidate of candidates) {
      const candidateVideoId = candidate.ref.id
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

const plugin = new YouTubeMusicPlugin()

export { YouTubeMusicPlugin }
export default plugin
