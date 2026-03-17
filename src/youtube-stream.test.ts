import { describe, expect, it } from 'vitest'
import {
  pickBestAudioFormat,
  toStreamInfo,
  toTrackMetadata
} from './youtube-stream'

describe('youtube-stream', () => {
  it('prefers webm audio when configured', () => {
    const format = pickBestAudioFormat(
      [
        {
          mimeType: 'audio/mp4; codecs="mp4a.40.2"',
          url: 'https://example.com/aac',
          bitrate: 192000
        },
        {
          mimeType: 'audio/webm; codecs="opus"',
          url: 'https://example.com/opus',
          bitrate: 128000
        }
      ],
      true
    )

    expect(format?.url).toBe('https://example.com/opus')
  })

  it('builds stream info from a playable player response', () => {
    expect(
      toStreamInfo(
        {
          playabilityStatus: { status: 'OK' },
          streamingData: {
            adaptiveFormats: [
              {
                mimeType: 'audio/webm; codecs="opus"',
                url: 'https://example.com/opus',
                bitrate: 128000
              }
            ]
          }
        },
        true
      )
    ).toMatchObject({
      url: 'https://example.com/opus',
      format: 'webm',
      bitrate: 128000
    })
  })

  it('throws when no audio stream is available', () => {
    expect(() =>
      toStreamInfo(
        {
          playabilityStatus: { status: 'OK' },
          streamingData: {
            adaptiveFormats: []
          }
        },
        true
      )
    ).toThrow('No audio streams available for this video')
  })

  it('uses available audio even when playability status is not OK', () => {
    expect(
      toStreamInfo(
        {
          playabilityStatus: {
            status: 'ERROR',
            reason: 'Video unavailable'
          },
          streamingData: {
            adaptiveFormats: [
              {
                mimeType: 'audio/mp4; codecs="mp4a.40.2"',
                url: 'https://example.com/aac',
                bitrate: 96000
              }
            ]
          }
        },
        true
      )
    ).toMatchObject({
      url: 'https://example.com/aac',
      format: 'm4a',
      bitrate: 96000
    })
  })

  it('extracts metadata from player response with fallback title', () => {
    expect(
      toTrackMetadata(
        {
          videoDetails: {
            title: 'Song Title',
            author: 'Artist Name',
            lengthSeconds: '245',
            thumbnail: { thumbnails: [{ url: 'cover.jpg' }] }
          }
        },
        'fallback-id'
      )
    ).toEqual({
      title: 'Song Title',
      artist: 'Artist Name',
      duration: 245,
      coverUrl: 'cover.jpg'
    })
  })
})
