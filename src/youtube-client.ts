import type { YouTubeFetch, YouTubePlayerResponse } from './youtube-types'
import { buildYouTubeSearchUrl } from './youtube-search'

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

interface YouTubeClientOptions {
  fetch: YouTubeFetch
  region?: string
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

  async fetchPlayer(videoId: string): Promise<YouTubePlayerResponse> {
    const locale = resolveLocale(this.options.region)
    const response = await this.options.fetch(
      'https://music.youtube.com/youtubei/v1/player?prettyPrint=false',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': USER_AGENT,
          Origin: 'https://music.youtube.com',
          Referer: 'https://music.youtube.com/'
        },
        body: JSON.stringify({
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
      }
    )

    if (!response.ok) {
      throw new Error(`YouTube player API failed: ${response.status}`)
    }

    return response.json() as Promise<YouTubePlayerResponse>
  }
}
