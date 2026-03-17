import { describe, expect, it, vi } from 'vitest'
import {
  buildYouTubeSearchUrl,
  parseDurationSeconds,
  parseYouTubeSearchResults
} from './youtube-search'

describe('youtube-search', () => {
  it('builds a search url with the music suffix', () => {
    expect(decodeURIComponent(buildYouTubeSearchUrl('hello'))).toContain(
      'hello music'
    )
  })

  it('parses search results and skips invalid entries', () => {
    const html = `
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
                            videoId: 'playable',
                            title: { runs: [{ text: 'Playable Song' }] },
                            ownerText: { runs: [{ text: 'Artist' }] },
                            thumbnail: { thumbnails: [{ url: 'cover.jpg' }] },
                            lengthText: { simpleText: '3:45' }
                          }
                        },
                        {
                          videoRenderer: {
                            videoId: 'blocked',
                            unplayableText: { simpleText: 'Blocked' }
                          }
                        },
                        {
                          videoRenderer: {
                            title: { runs: [{ text: 'Missing ID' }] }
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
    `

    expect(
      parseYouTubeSearchResults(html, {
        limit: 10,
        source: 'com.compass.youtube-music'
      })
    ).toEqual([
      {
        id: 'playable',
        title: 'Playable Song',
        artist: 'Artist',
        album: 'YouTube',
        coverUrl: 'cover.jpg',
        duration: 225,
        source: 'com.compass.youtube-music'
      }
    ])
  })

  it('warns when ytInitialData is missing', () => {
    const onWarn = vi.fn()

    expect(
      parseYouTubeSearchResults('<html></html>', {
        limit: 10,
        source: 'com.compass.youtube-music',
        onWarn
      })
    ).toEqual([])
    expect(onWarn).toHaveBeenCalledWith('Could not find ytInitialData in response')
  })

  it('logs parsing errors and returns empty results', () => {
    const onError = vi.fn()

    expect(
      parseYouTubeSearchResults('var ytInitialData = { invalid json };', {
        limit: 10,
        source: 'com.compass.youtube-music',
        onError
      })
    ).toEqual([])
    expect(onError).toHaveBeenCalledWith(
      'Failed to parse YouTube results:',
      expect.anything()
    )
  })

  it('parses duration strings robustly', () => {
    expect(parseDurationSeconds('3:45')).toBe(225)
    expect(parseDurationSeconds('1:23:45')).toBe(5025)
    expect(parseDurationSeconds('')).toBe(0)
    expect(parseDurationSeconds('N/A')).toBe(0)
  })
})
