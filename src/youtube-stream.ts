import type { YouTubeAdaptiveFormat, YouTubePlayerResponse } from './youtube-types'

export function pickBestAudioFormat(
  formats: YouTubeAdaptiveFormat[],
  preferAudioOnly: boolean
): YouTubeAdaptiveFormat | null {
  const audioFormats = formats.filter(
    format => format.mimeType.startsWith('audio/') && !!format.url
  )

  if (audioFormats.length === 0) {
    return null
  }

  const sorted = [...audioFormats].sort((left, right) => {
    const leftIsWebm = left.mimeType.startsWith('audio/webm') ? 1 : 0
    const rightIsWebm = right.mimeType.startsWith('audio/webm') ? 1 : 0

    if (preferAudioOnly && leftIsWebm !== rightIsWebm) {
      return rightIsWebm - leftIsWebm
    }

    return right.bitrate - left.bitrate
  })
  return sorted[0] ?? null
}

export function toStreamInfo(
  response: YouTubePlayerResponse,
  preferAudioOnly: boolean
): any {
  const bestAudio = pickBestAudioFormat(
    response.streamingData?.adaptiveFormats ?? [],
    preferAudioOnly
  )

  if (bestAudio?.url) {
    const format = bestAudio.mimeType.startsWith('audio/webm') ? 'webm' : 'm4a'

    return {
      url: bestAudio.url,
      format,
      bitrate: bestAudio.bitrate,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        Origin: 'https://music.youtube.com',
        Referer: 'https://music.youtube.com/'
      }
    }
  }

  if (response.playabilityStatus?.status !== 'OK') {
    throw new Error(`Video not playable: ${response.playabilityStatus?.reason ?? 'unknown reason'}`)
  }

  throw new Error('No audio streams available for this video')
}

export function toTrackMetadata(
  response: YouTubePlayerResponse,
  fallbackTitle: string
): any {
  const videoDetails = response.videoDetails
  const microformat = response.microformat?.playerMicroformatRenderer
  const thumbnail =
    videoDetails?.thumbnail?.thumbnails?.[0]?.url ?? microformat?.thumbnail?.thumbnails?.[0]?.url

  return {
    title: videoDetails?.title ?? microformat?.title?.simpleText ?? fallbackTitle,
    artist: videoDetails?.author ?? microformat?.ownerChannelName,
    duration: Number(videoDetails?.lengthSeconds ?? microformat?.lengthSeconds ?? 0),
    coverUrl: thumbnail
  }
}
