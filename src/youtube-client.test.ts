import { describe, expect, it, vi } from 'vitest'
import { YouTubeClient } from './youtube-client'

describe('youtube-client', () => {
  it('uses the injected fetch implementation for search', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('<html></html>')
    })

    const client = new YouTubeClient({ fetch: fetchImpl })
    await client.fetchSearchPage('test')

    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining('youtube.com/results'),
      expect.objectContaining({
        headers: expect.objectContaining({
          'User-Agent': expect.any(String)
        })
      })
    )
  })

  it('sends locale-aware player requests', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ playabilityStatus: { status: 'OK' } })
    })

    const client = new YouTubeClient({ fetch: fetchImpl, region: 'zh-CN' })
    await client.fetchPlayer('video-1')

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://music.youtube.com/youtubei/v1/player?prettyPrint=false',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          videoId: 'video-1',
          context: {
            client: {
              clientName: 'WEB_REMIX',
              clientVersion: '1.20241106.01.00',
              hl: 'zh',
              gl: 'CN'
            }
          }
        })
      })
    )
  })

  it('falls back to alternate player clients when WEB_REMIX is unavailable', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            playabilityStatus: {
              status: 'ERROR',
              reason: 'Video unavailable'
            }
          })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            playabilityStatus: { status: 'OK' },
            streamingData: {
              adaptiveFormats: [
                {
                  mimeType: 'audio/webm; codecs="opus"',
                  url: 'https://rr.youtube.com/videoplayback?audio=android',
                  bitrate: 128000
                }
              ]
            }
          })
      })

    const client = new YouTubeClient({ fetch: fetchImpl, region: 'zh-CN' })

    await expect(client.fetchPlayer('video-2')).resolves.toMatchObject({
      playabilityStatus: { status: 'OK' }
    })

    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      'https://www.youtube.com/youtubei/v1/player?prettyPrint=false',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'X-Youtube-Client-Name': '3',
          'X-Youtube-Client-Version': '19.44.38'
        }),
        body: JSON.stringify({
          videoId: 'video-2',
          contentCheckOk: true,
          racyCheckOk: true,
          context: {
            client: {
              clientName: 'ANDROID',
              clientVersion: '19.44.38',
              androidSdkVersion: 33,
              hl: 'zh',
              gl: 'CN'
            }
          }
        })
      })
    )
  })
})
