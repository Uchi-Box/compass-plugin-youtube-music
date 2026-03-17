import type {
  DataSourcePlugin,
  DataSourceSearchResult,
  Lyrics,
  PluginContext,
  PluginInstance,
  PluginManifest,
  SearchOptions,
  StreamInfo,
  TrackMetadata,
  TrackReference
} from '@uchi-box/compass-plugin-sdk'
import { YouTubeClient } from './youtube-client'
import { parseYouTubeSearchResults } from './youtube-search'
import { toStreamInfo, toTrackMetadata } from './youtube-stream'
import type { YouTubeFetch, YouTubeMusicSettings } from './youtube-types'

const manifest: PluginManifest = {
  id: 'com.compass.youtube-music',
  name: 'YouTube Music',
  version: '0.1.0',
  description: 'Search and play music from YouTube Music',
  author: 'Compass Music Team',
  platforms: ['all'],
  main: 'dist/index.js',
  brandColor: '#dc322f',
  capabilities: {
    dataSource: true
  }
}

const DEFAULT_SETTINGS: YouTubeMusicSettings = {
  searchLimit: 20,
  preferAudioOnly: true
}

class YouTubeMusicDataSourcePlugin implements DataSourcePlugin, PluginInstance {
  readonly id = manifest.id
  readonly name = manifest.name

  private context?: PluginContext
  private settings: YouTubeMusicSettings = DEFAULT_SETTINGS
  private client = this.createClient(globalThis.fetch)

  async activate(context: PluginContext): Promise<void> {
    this.context = context
    this.refreshSettings()
    context.log('info', 'YouTube Music data source plugin activated')
  }

  async deactivate(): Promise<void> {
    this.context?.log('info', 'YouTube Music data source plugin deactivated')
  }

  async search(
    query: string,
    options?: SearchOptions
  ): Promise<DataSourceSearchResult[]> {
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

  async resolveStream(track: TrackReference): Promise<StreamInfo> {
    this.refreshSettings()
    const videoId = track.source.externalId || track.id
    if (!videoId) {
      throw new Error('No videoId provided in track')
    }

    try {
      const playerResponse = await this.client.fetchPlayer(videoId)
      return toStreamInfo(playerResponse, this.settings.preferAudioOnly)
    } catch (error) {
      this.context?.log('warn', 'Primary YouTube video failed, trying fallback:', error)
      const fallbackStream = await this.resolveStreamFromFallbackSearch(
        track,
        videoId
      )
      if (fallbackStream) {
        return fallbackStream
      }

      this.context?.log('error', 'Failed to resolve stream:', error)
      throw error
    }
  }

  async getMetadata(track: TrackReference): Promise<TrackMetadata> {
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

  async getLyrics(_track: TrackReference): Promise<Lyrics | null> {
    return null
  }

  private refreshSettings(): void {
    if (!this.context) return

    this.settings = {
      searchLimit: this.context.getSetting<number>('searchLimit') ?? 20,
      preferAudioOnly:
        this.context.getSetting<boolean>('preferAudioOnly') ?? true,
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

  private async resolveStreamFromFallbackSearch(
    track: TrackReference,
    excludedVideoId: string
  ): Promise<StreamInfo | null> {
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
        const playerResponse = await this.client.fetchPlayer(candidateVideoId)
        this.context?.log(
          'info',
          `Resolved fallback YouTube stream with candidate: ${candidateVideoId}`
        )
        return toStreamInfo(playerResponse, this.settings.preferAudioOnly)
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

export { manifest, plugin as instance, YouTubeMusicDataSourcePlugin }
export default plugin
