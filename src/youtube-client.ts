import { buildYouTubeSearchUrl } from './youtube-search'
import type { YouTubeFetch, YouTubePlayerResponse } from './youtube-types'

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

interface YouTubeClientOptions {
  fetch: YouTubeFetch
  region?: string
}

interface PlayerClientProfile {
  endpoint: string
  clientName: string
  clientVersion: string
  userAgent?: string
  extraHeaders?: Record<string, string>
  buildBody: (videoId: string, locale: { hl: string; gl: string }) => Record<string, unknown>
}

interface FetchPlayerOptions {
  requirePlayable?: boolean
}

function resolveLocale(region?: string): { hl: string; gl: string } {
  if (!region?.trim()) {
    return { hl: 'en', gl: 'US' }
  }

  const [language, country] = region.split(/[-_]/)
  return {
    hl: language?.trim() || 'en',
    gl: country?.trim().toUpperCase() || region.trim().toUpperCase()
  }
}

export class YouTubeClient {
  constructor(private readonly options: YouTubeClientOptions) {}

  async fetchSearchPage(query: string): Promise<string> {
    const response = await this.options.fetch(buildYouTubeSearchUrl(query), {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept-Language': 'en-US,en;q=0.9',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    })

    if (!response.ok) {
      throw new Error(`YouTube search failed: ${response.status}`)
    }

    return response.text()
  }

  async fetchPlayer(
    videoId: string,
    options: FetchPlayerOptions = {}
  ): Promise<YouTubePlayerResponse> {
    const locale = resolveLocale(this.options.region)
    let lastFailure: Error | null = null

    for (const profile of PLAYER_CLIENT_PROFILES) {
      const response = await this.options.fetch(profile.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': profile.userAgent ?? USER_AGENT,
          Origin: 'https://music.youtube.com',
          Referer: 'https://music.youtube.com/',
          ...profile.extraHeaders
        },
        body: JSON.stringify(profile.buildBody(videoId, locale))
      })

      if (!response.ok) {
        lastFailure = new Error(`${profile.clientName} player API failed: ${response.status}`)
        continue
      }

      const payload = (await response.json()) as YouTubePlayerResponse

      if (payload.streamingData?.adaptiveFormats?.some(format => !!format.url)) {
        return payload
      }

      if (
        !options.requirePlayable &&
        (payload.videoDetails || payload.microformat?.playerMicroformatRenderer)
      ) {
        return payload
      }

      if (!options.requirePlayable && payload.playabilityStatus?.status === 'OK') {
        return payload
      }

      lastFailure = new Error(
        `${profile.clientName} returned ${payload.playabilityStatus?.status ?? 'UNKNOWN'}: ${payload.playabilityStatus?.reason ?? 'unknown reason'}`
      )
    }

    throw lastFailure ?? new Error('YouTube player API failed for all clients')
  }
}

const PLAYER_CLIENT_PROFILES: PlayerClientProfile[] = [
  {
    endpoint: 'https://music.youtube.com/youtubei/v1/player?prettyPrint=false',
    clientName: 'WEB_REMIX',
    clientVersion: '1.20241106.01.00',
    buildBody: (videoId, locale) => ({
      videoId,
      context: {
        client: {
          clientName: 'WEB_REMIX',
          clientVersion: '1.20241106.01.00',
          hl: locale.hl,
          gl: locale.gl
        }
      }
    })
  },
  {
    endpoint: 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false',
    clientName: 'ANDROID',
    clientVersion: '19.44.38',
    userAgent: 'com.google.android.youtube/19.44.38 (Linux; U; Android 13) gzip',
    extraHeaders: {
      'X-Youtube-Client-Name': '3',
      'X-Youtube-Client-Version': '19.44.38'
    },
    buildBody: (videoId, locale) => ({
      videoId,
      contentCheckOk: true,
      racyCheckOk: true,
      context: {
        client: {
          clientName: 'ANDROID',
          clientVersion: '19.44.38',
          androidSdkVersion: 33,
          hl: locale.hl,
          gl: locale.gl
        }
      }
    })
  },
  {
    endpoint: 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false',
    clientName: 'IOS',
    clientVersion: '19.45.4',
    userAgent: 'com.google.ios.youtube/19.45.4 (iPhone16,2; U; CPU iOS 18_1 like Mac OS X)',
    extraHeaders: {
      'X-Youtube-Client-Name': '5',
      'X-Youtube-Client-Version': '19.45.4'
    },
    buildBody: (videoId, locale) => ({
      videoId,
      contentCheckOk: true,
      racyCheckOk: true,
      context: {
        client: {
          clientName: 'IOS',
          clientVersion: '19.45.4',
          deviceMake: 'Apple',
          deviceModel: 'iPhone16,2',
          osName: 'iPhone',
          osVersion: '18.1.0.22B83',
          platform: 'MOBILE',
          hl: locale.hl,
          gl: locale.gl
        }
      }
    })
  },
  {
    endpoint: 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false',
    clientName: 'WEB',
    clientVersion: '2.20250312.01.00',
    extraHeaders: {
      'X-Youtube-Client-Name': '1',
      'X-Youtube-Client-Version': '2.20250312.01.00'
    },
    buildBody: (videoId, locale) => ({
      videoId,
      context: {
        client: {
          clientName: 'WEB',
          clientVersion: '2.20250312.01.00',
          hl: locale.hl,
          gl: locale.gl
        }
      }
    })
  }
]
