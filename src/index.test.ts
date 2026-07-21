import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { YouTubeMusicPlugin } from './index'

describe('YouTubeMusicPlugin', () => {
  let plugin: YouTubeMusicPlugin
  const mockFetch = vi.fn()
  const mockConfigGet = vi.fn()
  const mockLog = vi.fn()
  // biome-ignore lint/suspicious/noExplicitAny: test mock context
  const mockContext: any = {
    manifest: {
      name: 'compass-plugin-youtube-music',
      version: '1.0.0',
      main: 'dist/index.js',
      compass: { type: 'plugin' }
    },
    platform: 'desktop' as const,
    subscriptions: [],
    config: {
      get: mockConfigGet,
      set: vi.fn(),
      observe: vi.fn(() => ({ dispose: vi.fn() }))
    },
    net: { fetch: mockFetch },
    sources: { register: vi.fn(() => ({ dispose: vi.fn() })) },
    log: mockLog
  }

  beforeEach(() => {
    plugin = new YouTubeMusicPlugin()
    mockContext.subscriptions = []
    vi.clearAllMocks()
    mockConfigGet.mockImplementation((key: string) => {
      if (key === 'searchLimit') return 20
      if (key === 'preferAudioOnly') return true
      if (key === 'region') return 'zh-CN'
      return undefined
    })
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  it('activates and registers the "youtube-music" source', async () => {
    await plugin.activate(mockContext)

    expect(mockContext.log).toHaveBeenCalledWith(
      'info',
      'YouTube Music source plugin activated'
    )
    expect(mockContext.sources.register).toHaveBeenCalledTimes(1)
    expect(mockContext.sources.register.mock.calls[0][0]).toBe('youtube-music')
    expect(mockContext.subscriptions.length).toBeGreaterThan(0)
  })

  it('searches with the injected host fetch and returns results with a TrackRef', async () => {
    await plugin.activate(mockContext)

    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () =>
        Promise.resolve(`
          var ytInitialData = ${JSON.stringify({
            contents: {
              twoColumnSearchResultsRenderer: {
                primaryContents: {
                  sectionListRenderer: {
                    contents: [
                      {
                        itemSectionRenderer: {
                          contents: [
                            {
                              videoRenderer: {
                                videoId: 'abc123',
                                title: { runs: [{ text: 'Test Song' }] },
                                ownerText: { runs: [{ text: 'Test Artist' }] },
                                thumbnail: { thumbnails: [{ url: 'cover.jpg' }] },
                                lengthText: { simpleText: '3:45' }
                              }
                            }
                          ]
                        }
                      }
                    ]
                  }
                }
              }
            }
          })};
        `)
    })

    await expect(plugin.search('test query')).resolves.toEqual([
      {
        ref: { source: 'youtube-music', id: 'abc123' },
        title: 'Test Song',
        artist: 'Test Artist',
        album: 'YouTube',
        coverUrl: 'cover.jpg',
        duration: 225
      }
    ])
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('resolves a stream through the player api', async () => {
    await plugin.activate(mockContext)

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        playabilityStatus: { status: 'OK' },
        streamingData: {
          adaptiveFormats: [
            {
              mimeType: 'audio/webm; codecs="opus"',
              url: 'https://rr.youtube.com/videoplayback?audio=webm',
              bitrate: 128000
            }
          ]
        }
      })
    })

    await expect(
      plugin.resolveStream({ source: 'youtube-music', id: 'abc123' })
    ).resolves.toMatchObject({
      url: 'https://rr.youtube.com/videoplayback?audio=webm',
      format: 'webm',
      bitrate: 128000
    })
  })

  it('falls back to another playable candidate when the primary video is unavailable', async () => {
    await plugin.activate(mockContext)

    // biome-ignore lint/suspicious/noExplicitAny: spying on a private method
    vi.spyOn(plugin as any, 'resolvePlayableStream')
      .mockRejectedValueOnce(new Error('primary not playable'))
      .mockResolvedValueOnce({
        url: 'https://rr.youtube.com/videoplayback?audio=fallback',
        format: 'webm',
        bitrate: 128000
      } as never)

    // getMetadata (used to derive the fallback query) → player response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        videoDetails: {
          title: 'Blocked Song',
          author: 'Test Artist',
          lengthSeconds: '200',
          thumbnail: { thumbnails: [{ url: 'cover.jpg' }] }
        }
      })
    })

    // fallback search → returns a different candidate
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () =>
        Promise.resolve(`
          var ytInitialData = ${JSON.stringify({
            contents: {
              twoColumnSearchResultsRenderer: {
                primaryContents: {
                  sectionListRenderer: {
                    contents: [
                      {
                        itemSectionRenderer: {
                          contents: [
                            {
                              videoRenderer: {
                                videoId: 'abc123',
                                title: { runs: [{ text: 'Blocked Song' }] }
                              }
                            },
                            {
                              videoRenderer: {
                                videoId: 'fallback123',
                                title: { runs: [{ text: 'Fallback Song' }] },
                                ownerText: { runs: [{ text: 'Test Artist' }] },
                                thumbnail: { thumbnails: [{ url: 'cover.jpg' }] },
                                lengthText: { simpleText: '3:45' }
                              }
                            }
                          ]
                        }
                      }
                    ]
                  }
                }
              }
            }
          })};
        `)
    })

    await expect(
      plugin.resolveStream({ source: 'youtube-music', id: 'abc123' })
    ).resolves.toMatchObject({
      url: 'https://rr.youtube.com/videoplayback?audio=fallback',
      format: 'webm',
      bitrate: 128000
    })
  })

  it('gets metadata from the player response', async () => {
    await plugin.activate(mockContext)

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        videoDetails: {
          title: 'Metadata Song',
          author: 'Metadata Artist',
          lengthSeconds: '123',
          thumbnail: { thumbnails: [{ url: 'meta.jpg' }] }
        }
      })
    })

    await expect(
      plugin.getMetadata({ source: 'youtube-music', id: 'abc123' })
    ).resolves.toEqual({
      title: 'Metadata Song',
      artist: 'Metadata Artist',
      duration: 123,
      coverUrl: 'meta.jpg'
    })
  })

  it('refreshes settings from context before requests', async () => {
    await plugin.activate(mockContext)

    mockConfigGet.mockImplementation((key: string) => {
      if (key === 'searchLimit') return 1
      if (key === 'preferAudioOnly') return false
      if (key === 'region') return 'ja-JP'
      return undefined
    })

    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () =>
        Promise.resolve(`
          var ytInitialData = ${JSON.stringify({
            contents: {
              twoColumnSearchResultsRenderer: {
                primaryContents: {
                  sectionListRenderer: {
                    contents: [
                      {
                        itemSectionRenderer: {
                          contents: [
                            {
                              videoRenderer: {
                                videoId: 'first',
                                title: { runs: [{ text: 'First Song' }] }
                              }
                            },
                            {
                              videoRenderer: {
                                videoId: 'second',
                                title: { runs: [{ text: 'Second Song' }] }
                              }
                            }
                          ]
                        }
                      }
                    ]
                  }
                }
              }
            }
          })};
        `)
    })

    await expect(plugin.search('test query')).resolves.toHaveLength(1)
  })

  it('returns null for lyrics', async () => {
    await plugin.activate(mockContext)
    await expect(plugin.getLyrics()).resolves.toBeNull()
  })
})
