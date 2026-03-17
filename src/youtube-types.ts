import type { DataSourceSearchResult } from '@uchi-box/compass-plugin-sdk'

export interface YouTubeMusicSettings {
  searchLimit: number
  preferAudioOnly: boolean
  region?: string
}

export type YouTubeFetch = (
  url: string,
  options?: RequestInit
) => Promise<Response>

export interface YouTubeVideoRenderer {
  videoId?: string
  unplayableText?: unknown
  title?: { runs?: Array<{ text?: string }> }
  ownerText?: { runs?: Array<{ text?: string }> }
  shortBylineText?: { runs?: Array<{ text?: string }> }
  thumbnail?: { thumbnails?: Array<{ url?: string }> }
  lengthText?: {
    simpleText?: string
    accessibility?: { accessibilityData?: { label?: string } }
  }
}

export interface YouTubeSearchInitialData {
  contents?: {
    twoColumnSearchResultsRenderer?: {
      primaryContents?: {
        sectionListRenderer?: {
          contents?: Array<{
            itemSectionRenderer?: {
              contents?: Array<{ videoRenderer?: YouTubeVideoRenderer }>
            }
          }>
        }
      }
    }
  }
}

export interface YouTubeAdaptiveFormat {
  mimeType: string
  url?: string
  bitrate: number
  audioQuality?: string
}

export interface YouTubePlayerResponse {
  streamingData?: {
    adaptiveFormats?: YouTubeAdaptiveFormat[]
  }
  playabilityStatus?: {
    status: string
    reason?: string
  }
  videoDetails?: {
    title?: string
    author?: string
    lengthSeconds?: string
    thumbnail?: {
      thumbnails?: Array<{ url?: string }>
    }
  }
  microformat?: {
    playerMicroformatRenderer?: {
      title?: { simpleText?: string }
      ownerChannelName?: string
      lengthSeconds?: string
      thumbnail?: {
        thumbnails?: Array<{ url?: string }>
      }
    }
  }
  responseContext?: {
    visitorData?: string
  }
}

export interface SearchParseOptions {
  limit: number
  source: string
  onWarn?: (message: string) => void
  onError?: (message: string, error: unknown) => void
}

export interface ParsedSearchResult extends DataSourceSearchResult {}
