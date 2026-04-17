import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { YouTubeMusicDataSourcePlugin } from './index'
import type { PluginContext } from './plugin-types'

describe('YouTubeMusicDataSourcePlugin', () => {
  let plugin: YouTubeMusicDataSourcePlugin
  const mockFetch = vi.fn()
  const mockConfigGet = vi.fn()
  const mockLog = vi.fn()
  const mockContext = {
    manifest: {
      id: 'test',
      name: 'Test',
      version: '1.0.0',
      platforms: ['all'],
      main: 'dist/index.js',
      capabilities: { dataSource: true }
    },
    platform: 'desktop' as const,
    config: {
      get: mockConfigGet,
      set: vi.fn(),
      observe: vi.fn(() => ({ dispose: vi.fn() }))
    },
    log: mockLog,
    fetch: mockFetch
  } satisfies PluginContext

  beforeEach(() => {
    plugin = new YouTubeMusicDataSourcePlugin()
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

  it('activates with host fetch support', async () => {
    await plugin.activate(mockContext)

    expect(mockContext.log).toHaveBeenCalledWith(
      'info',
      'YouTube Music data source plugin activated'
    )
  })

  it('searches with the injected host fetch and returns parsed results', async () => {
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
        id: 'abc123',
        title: 'Test Song',
        artist: 'Test Artist',
        album: 'YouTube',
        coverUrl: 'cover.jpg',
        duration: 225,
        source: 'compass-plugin-youtube-music'
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
      plugin.resolveStream({
        id: 'abc123',
        source: { plugin: 'compass-plugin-youtube-music', externalId: 'abc123' }
      })
    ).resolves.toMatchObject({
      url: 'https://rr.youtube.com/videoplayback?audio=webm',
      format: 'webm',
      bitrate: 128000
    })
  })

  it('falls back to another playable candidate when the primary video is unavailable', async () => {
    await plugin.activate(mockContext)

    vi.spyOn(plugin as any, 'resolvePlayableStream')
      .mockRejectedValueOnce(new Error('primary not playable'))
      .mockResolvedValueOnce({
        url: 'https://rr.youtube.com/videoplayback?audio=fallback',
        format: 'webm',
        bitrate: 128000
      } as never)

    mockFetch
      .mockResolvedValueOnce({
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
      plugin.resolveStream({
        id: 'abc123',
        title: 'Blocked Song',
        artist: 'Test Artist',
        source: { plugin: 'compass-plugin-youtube-music', externalId: 'abc123' }
      })
    ).resolves.toMatchObject({
      url: 'https://rr.youtube.com/videoplayback?audio=fallback',
      format: 'webm',
      bitrate: 128000
    })
  })

  it('falls back to yt-dlp when player clients cannot resolve a stream', async () => {
    await plugin.activate(mockContext)

    vi.spyOn(plugin as any, 'resolveStreamWithYtDlp').mockResolvedValue({
      url: 'https://rr.youtube.com/videoplayback?audio=ytdlp',
      format: 'm4a',
      bitrate: 128000
    } as never)

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          playabilityStatus: { status: 'ERROR', reason: 'Video unavailable' }
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          playabilityStatus: { status: 'ERROR', reason: 'Video unavailable' }
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          playabilityStatus: { status: 'ERROR', reason: 'Video unavailable' }
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          playabilityStatus: { status: 'UNPLAYABLE', reason: 'Video unavailable' }
        })
      })

    await expect(
      plugin.resolveStream({
        id: 'blocked',
        title: 'Blocked Song',
        artist: 'Blocked Artist',
        source: { plugin: 'compass-plugin-youtube-music', externalId: 'blocked' }
      })
    ).resolves.toMatchObject({
      url: 'https://rr.youtube.com/videoplayback?audio=ytdlp',
      format: 'm4a',
      bitrate: 128000
    })
  })

  it('gets metadata from the player response with fallback behavior', async () => {
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
      plugin.getMetadata({
        id: 'abc123',
        source: { plugin: 'compass-plugin-youtube-music', externalId: 'abc123' }
      })
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

    await expect(
      plugin.getLyrics({
        id: 'abc123',
        source: { plugin: 'compass-plugin-youtube-music', externalId: 'abc123' }
      })
    ).resolves.toBeNull()
  })
})
