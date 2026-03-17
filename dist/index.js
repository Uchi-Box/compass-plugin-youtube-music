import { execFile as execFile2 } from "node:child_process";
import { promisify } from "node:util";
// src/youtube-search.ts
function buildYouTubeSearchUrl(query) {
  const searchQuery = `${query} music`;
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}&sp=EgIQAQ%253D%253D`;
}
function parseDurationSeconds(duration) {
  if (!duration) return 0;
  const parts = duration.split(":").map((part) => parseInt(part, 10) || 0);
  if (parts.length === 2) {
    return (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
  }
  if (parts.length === 3) {
    return (parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0);
  }
  return 0;
}
function getVideoTitle(video) {
  return video.title?.runs?.[0]?.text ?? "Unknown";
}
function getVideoArtist(video) {
  return video.ownerText?.runs?.[0]?.text ?? video.shortBylineText?.runs?.[0]?.text ?? "Unknown Artist";
}
function getVideoCover(video) {
  return video.thumbnail?.thumbnails?.[0]?.url ?? "";
}
function getVideoDuration(video) {
  const durationText = video.lengthText?.simpleText ?? video.lengthText?.accessibility?.accessibilityData?.label ?? "";
  return parseDurationSeconds(durationText);
}
function parseYouTubeSearchResults(html, options) {
  const results = [];
  try {
    const match = html.match(/var ytInitialData = ({.+?});/s);
    if (!match?.[1]) {
      options.onWarn?.("Could not find ytInitialData in response");
      return [];
    }
    const data = JSON.parse(match[1]);
    const sections = data.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents ?? [];
    for (const section of sections) {
      const items = section.itemSectionRenderer?.contents ?? [];
      for (const item of items) {
        if (results.length >= options.limit) break;
        const video = item.videoRenderer;
        if (!video?.videoId || video.unplayableText) continue;
        results.push({
          id: video.videoId,
          title: getVideoTitle(video),
          artist: getVideoArtist(video),
          album: "YouTube",
          coverUrl: getVideoCover(video),
          duration: getVideoDuration(video),
          source: options.source
        });
      }
      if (results.length >= options.limit) break;
    }
  } catch (error) {
    options.onError?.("Failed to parse YouTube results:", error);
  }
  return results;
}
var execFileAsync = promisify(execFile2);

// src/youtube-client.ts
var USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
function resolveLocale(region) {
  if (!region?.trim()) {
    return { hl: "en", gl: "US" };
  }
  const [language, country] = region.split(/[-_]/);
  return {
    hl: language?.trim() || "en",
    gl: country?.trim().toUpperCase() || region.trim().toUpperCase()
  };
}
var YouTubeClient = class {
  constructor(options) {
    this.options = options;
  }
  async fetchSearchPage(query) {
    const response = await this.options.fetch(buildYouTubeSearchUrl(query), {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept-Language": "en-US,en;q=0.9",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      }
    });
    if (!response.ok) {
      throw new Error(`YouTube search failed: ${response.status}`);
    }
    return response.text();
  }
  async fetchPlayer(videoId, options = {}) {
    const locale = resolveLocale(this.options.region);
    let lastFailure = null;
    for (const profile of PLAYER_CLIENT_PROFILES) {
      const response = await this.options.fetch(profile.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": profile.userAgent ?? USER_AGENT,
          Origin: "https://music.youtube.com",
          Referer: "https://music.youtube.com/",
          ...profile.extraHeaders
        },
        body: JSON.stringify(profile.buildBody(videoId, locale))
      });
      if (!response.ok) {
        lastFailure = new Error(`${profile.clientName} player API failed: ${response.status}`);
        continue;
      }
      const payload = await response.json();
      if (payload.streamingData?.adaptiveFormats?.some((format) => !!format.url)) {
        return payload;
      }
      if (!options.requirePlayable && (payload.videoDetails || payload.microformat?.playerMicroformatRenderer)) {
        return payload;
      }
      if (!options.requirePlayable && payload.playabilityStatus?.status === "OK") {
        return payload;
      }
      lastFailure = new Error(
        `${profile.clientName} returned ${payload.playabilityStatus?.status ?? "UNKNOWN"}: ${payload.playabilityStatus?.reason ?? "unknown reason"}`
      );
    }
    throw lastFailure ?? new Error("YouTube player API failed for all clients");
  }
};
var PLAYER_CLIENT_PROFILES = [
  {
    endpoint: "https://music.youtube.com/youtubei/v1/player?prettyPrint=false",
    clientName: "WEB_REMIX",
    clientVersion: "1.20241106.01.00",
    buildBody: (videoId, locale) => ({
      videoId,
      context: {
        client: {
          clientName: "WEB_REMIX",
          clientVersion: "1.20241106.01.00",
          hl: locale.hl,
          gl: locale.gl
        }
      }
    })
  },
  {
    endpoint: "https://www.youtube.com/youtubei/v1/player?prettyPrint=false",
    clientName: "ANDROID",
    clientVersion: "19.44.38",
    userAgent: "com.google.android.youtube/19.44.38 (Linux; U; Android 13) gzip",
    extraHeaders: {
      "X-Youtube-Client-Name": "3",
      "X-Youtube-Client-Version": "19.44.38"
    },
    buildBody: (videoId, locale) => ({
      videoId,
      contentCheckOk: true,
      racyCheckOk: true,
      context: {
        client: {
          clientName: "ANDROID",
          clientVersion: "19.44.38",
          androidSdkVersion: 33,
          hl: locale.hl,
          gl: locale.gl
        }
      }
    })
  },
  {
    endpoint: "https://www.youtube.com/youtubei/v1/player?prettyPrint=false",
    clientName: "TVHTML5_SIMPLY_EMBEDDED_PLAYER",
    clientVersion: "2.0",
    extraHeaders: {
      "X-Youtube-Client-Name": "85",
      "X-Youtube-Client-Version": "2.0"
    },
    buildBody: (videoId, locale) => ({
      videoId,
      contentCheckOk: true,
      racyCheckOk: true,
      context: {
        client: {
          clientName: "TVHTML5_SIMPLY_EMBEDDED_PLAYER",
          clientVersion: "2.0",
          hl: locale.hl,
          gl: locale.gl
        },
        thirdParty: {
          embedUrl: "https://www.youtube.com/"
        }
      }
    })
  }
];

// src/youtube-stream.ts
function pickBestAudioFormat(formats, preferAudioOnly) {
  const audioFormats = formats.filter(
    (format) => format.mimeType.startsWith("audio/") && !!format.url
  );
  if (audioFormats.length === 0) {
    return null;
  }
  return [...audioFormats].sort((left, right) => {
    const leftIsWebm = left.mimeType.startsWith("audio/webm") ? 1 : 0;
    const rightIsWebm = right.mimeType.startsWith("audio/webm") ? 1 : 0;
    if (preferAudioOnly && leftIsWebm !== rightIsWebm) {
      return rightIsWebm - leftIsWebm;
    }
    return right.bitrate - left.bitrate;
  })[0];
}
function toStreamInfo(response, preferAudioOnly) {
  const bestAudio = pickBestAudioFormat(
    response.streamingData?.adaptiveFormats ?? [],
    preferAudioOnly
  );
  if (bestAudio?.url) {
    const format = bestAudio.mimeType.startsWith("audio/webm") ? "webm" : "m4a";
    return {
      url: bestAudio.url,
      format,
      bitrate: bestAudio.bitrate,
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        Origin: "https://music.youtube.com",
        Referer: "https://music.youtube.com/"
      }
    };
  }
  if (response.playabilityStatus?.status !== "OK") {
    throw new Error(
      `Video not playable: ${response.playabilityStatus?.reason ?? "unknown reason"}`
    );
  }
  throw new Error("No audio streams available for this video");
}
function toTrackMetadata(response, fallbackTitle) {
  const videoDetails = response.videoDetails;
  const microformat = response.microformat?.playerMicroformatRenderer;
  const thumbnail = videoDetails?.thumbnail?.thumbnails?.[0]?.url ?? microformat?.thumbnail?.thumbnails?.[0]?.url;
  return {
    title: videoDetails?.title ?? microformat?.title?.simpleText ?? fallbackTitle,
    artist: videoDetails?.author ?? microformat?.ownerChannelName,
    duration: Number(
      videoDetails?.lengthSeconds ?? microformat?.lengthSeconds ?? 0
    ),
    coverUrl: thumbnail
  };
}

// src/index.ts
var manifest = {
  id: "com.compass.youtube-music",
  name: "YouTube Music",
  version: "0.1.0",
  description: "Search and play music from YouTube Music",
  author: "Compass Music Team",
  platforms: ["all"],
  main: "dist/index.js",
  brandColor: "#dc322f",
  capabilities: {
    dataSource: true
  }
};
var DEFAULT_SETTINGS = {
  searchLimit: 20,
  preferAudioOnly: true
};
var YouTubeMusicDataSourcePlugin = class {
  id = manifest.id;
  name = manifest.name;
  context;
  settings = DEFAULT_SETTINGS;
  client = this.createClient(globalThis.fetch);
  async activate(context) {
    this.context = context;
    this.refreshSettings();
    context.log("info", "YouTube Music data source plugin activated");
  }
  async deactivate() {
    this.context?.log("info", "YouTube Music data source plugin deactivated");
  }
  async search(query, options) {
    this.refreshSettings();
    const limit = options?.limit ?? this.settings.searchLimit;
    try {
      const html = await this.client.fetchSearchPage(query);
      return parseYouTubeSearchResults(html, {
        limit,
        source: this.id,
        onWarn: (message) => this.context?.log("warn", message),
        onError: (message, error) => this.context?.log("error", message, error)
      });
    } catch (error) {
      if (error instanceof Error) {
        this.context?.log("error", "Search failed:", error.message);
      } else {
        this.context?.log("error", "Search failed:", error);
      }
      return [];
    }
  }
  async resolveStream(track) {
    this.refreshSettings();
    const videoId = track.source.externalId || track.id;
    if (!videoId) {
      throw new Error("No videoId provided in track");
    }
    try {
      return await this.resolvePlayableStream(videoId);
    } catch (error) {
      this.context?.log("warn", "Primary YouTube video failed, trying fallback:", error);
      const fallbackStream = await this.resolveStreamFromFallbackSearch(track, videoId);
      if (fallbackStream) {
        return fallbackStream;
      }
      this.context?.log("error", "Failed to resolve stream:", error);
      throw error;
    }
  }
  async getMetadata(track) {
    this.refreshSettings();
    const videoId = track.source.externalId || track.id;
    try {
      const playerResponse = await this.client.fetchPlayer(videoId);
      return toTrackMetadata(playerResponse, track.id);
    } catch (error) {
      this.context?.log("error", "Failed to get metadata:", error);
      return { title: track.id };
    }
  }
  async getLyrics(_track) {
    return null;
  }
  refreshSettings() {
    if (!this.context) return;
    this.settings = {
      searchLimit: this.context.getSetting("searchLimit") ?? 20,
      preferAudioOnly: this.context.getSetting("preferAudioOnly") ?? true,
      region: this.context.getSetting("region")
    };
    this.client = this.createClient(this.context.fetch ?? globalThis.fetch);
  }
  createClient(fetchImpl) {
    return new YouTubeClient({
      fetch: fetchImpl,
      region: this.settings.region
    });
  }
  async resolvePlayableStream(videoId) {
    try {
      const playerResponse = await this.client.fetchPlayer(videoId, {
        requirePlayable: true
      });
      return toStreamInfo(playerResponse, this.settings.preferAudioOnly);
    } catch (error) {
      this.context?.log("warn", `Player API failed for ${videoId}, trying yt-dlp`, error);
      return this.resolveStreamWithYtDlp(videoId);
    }
  }
  async resolveStreamWithYtDlp(videoId) {
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const candidates = ["/opt/homebrew/bin/yt-dlp", "yt-dlp"];
    let lastError = null;
    for (const command of candidates) {
      try {
        const { stdout } = await execFileAsync(
          command,
          [
            "--dump-single-json",
            "--no-playlist",
            "--no-warnings",
            "--skip-download",
            "-f",
            "ba[protocol!=m3u8]/ba/bestaudio",
            videoUrl
          ],
          {
            timeout: 2e4,
            maxBuffer: 8 * 1024 * 1024
          }
        );
        const payload = JSON.parse(stdout);
        if (!payload.url) {
          throw new Error(`yt-dlp did not return a playable URL for ${videoId}`);
        }
        return {
          url: payload.url,
          format: payload.ext === "webm" ? "webm" : "m4a",
          bitrate: payload.abr ? Math.round(payload.abr * 1e3) : void 0,
          headers: payload.http_headers
        };
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError instanceof Error ? lastError : new Error(`yt-dlp failed to resolve stream for ${videoId}`);
  }
  async resolveStreamFromFallbackSearch(track, excludedVideoId) {
    const fallbackQuery = [track.title, track.artist].filter(Boolean).join(" ").trim();
    if (!fallbackQuery) {
      return null;
    }
    const candidates = await this.search(fallbackQuery, { limit: 5 });
    for (const candidate of candidates) {
      const candidateVideoId = candidate.id;
      if (!candidateVideoId || candidateVideoId === excludedVideoId) {
        continue;
      }
      try {
        const stream = await this.resolvePlayableStream(candidateVideoId);
        this.context?.log("info", `Resolved fallback YouTube stream with candidate: ${candidateVideoId}`);
        return stream;
      } catch (error) {
        this.context?.log("warn", `Fallback YouTube candidate not playable: ${candidateVideoId}`, error);
      }
    }
    return null;
  }
};
var plugin = new YouTubeMusicDataSourcePlugin();
var index_default = plugin;
export {
  YouTubeMusicDataSourcePlugin,
  index_default as default,
  plugin as instance,
  manifest
};
//# sourceMappingURL=index.js.map
