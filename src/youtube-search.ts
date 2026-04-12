import type {
  ParsedSearchResult,
  SearchParseOptions,
  YouTubeSearchInitialData,
  YouTubeVideoRenderer
} from './youtube-types'

export function buildYouTubeSearchUrl(query: string): string {
  const searchQuery = `${query} music`
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}&sp=EgIQAQ%253D%253D`
}

export function parseDurationSeconds(duration: string): number {
  if (!duration) return 0

  const parts = duration.split(':').map(part => parseInt(part, 10) || 0)
  if (parts.length === 2) {
    return (parts[0] ?? 0) * 60 + (parts[1] ?? 0)
  }
  if (parts.length === 3) {
    return (parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0)
  }
  return 0
}

function getVideoTitle(video: YouTubeVideoRenderer): string {
  return video.title?.runs?.[0]?.text ?? 'Unknown'
}

function getVideoArtist(video: YouTubeVideoRenderer): string {
  return (
    video.ownerText?.runs?.[0]?.text ?? video.shortBylineText?.runs?.[0]?.text ?? 'Unknown Artist'
  )
}

function getVideoCover(video: YouTubeVideoRenderer): string {
  return video.thumbnail?.thumbnails?.[0]?.url ?? ''
}

function getVideoDuration(video: YouTubeVideoRenderer): number {
  const durationText =
    video.lengthText?.simpleText ?? video.lengthText?.accessibility?.accessibilityData?.label ?? ''
  return parseDurationSeconds(durationText)
}

export function parseYouTubeSearchResults(
  html: string,
  options: SearchParseOptions
): ParsedSearchResult[] {
  const results: ParsedSearchResult[] = []

  try {
    const match = html.match(/var ytInitialData = ({.+?});/s)
    if (!match?.[1]) {
      options.onWarn?.('Could not find ytInitialData in response')
      return []
    }

    const data = JSON.parse(match[1]) as YouTubeSearchInitialData
    const sections =
      data.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer
        ?.contents ?? []

    for (const section of sections) {
      const items = section.itemSectionRenderer?.contents ?? []
      for (const item of items) {
        if (results.length >= options.limit) break

        const video = item.videoRenderer
        if (!video?.videoId || video.unplayableText) continue

        results.push({
          id: video.videoId,
          title: getVideoTitle(video),
          artist: getVideoArtist(video),
          album: 'YouTube',
          coverUrl: getVideoCover(video),
          duration: getVideoDuration(video),
          source: options.source
        })
      }

      if (results.length >= options.limit) break
    }
  } catch (error) {
    options.onError?.('Failed to parse YouTube results:', error)
  }

  return results
}
