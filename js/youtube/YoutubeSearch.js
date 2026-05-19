import CONFIG from "../config.js";

class YouTubeSearch {
  constructor() {
    this.cache = new Map();
    this.abortController = null;
  }

  async searchVideos(keyword) {
    const query = this.normalizeKeyword(keyword);

    if (!query) {
      return [];
    }

    if (!this.hasValidApiKey()) {
      throw new Error(
        "Bạn chưa điền YouTube Data API key trong file js/config.js."
      );
    }

    if (this.cache.has(query)) {
      return this.cache.get(query);
    }

    this.cancelPreviousRequest();

    this.abortController = new AbortController();

    const url = this.buildSearchUrl(query);

    const response = await fetch(url.toString(), {
      method: "GET",
      signal: this.abortController.signal
    });

    if (!response.ok) {
      const errorText = await response.text();

      throw new Error(
        `YouTube Data API lỗi HTTP ${response.status}: ${errorText}`
      );
    }

    const data = await response.json();

    const items = this.mapSearchItems(data.items || []);

    this.cache.set(query, items);

    return items;
  }

  normalizeKeyword(keyword) {
    const raw = String(keyword || "").trim();

    if (!raw) {
      return "";
    }

    const lower = raw.toLowerCase();

    if (lower.includes("karaoke") || lower.includes("beat")) {
      return raw;
    }

    return `${raw} karaoke`;
  }

  hasValidApiKey() {
    const key = CONFIG.youtube.apiKey;

    return (
      typeof key === "string" &&
      key.trim() !== "" &&
      key !== "YOUR_YOUTUBE_DATA_API_KEY_HERE"
    );
  }

  buildSearchUrl(query) {
    const url = new URL("https://www.googleapis.com/youtube/v3/search");

    url.searchParams.set("key", CONFIG.youtube.apiKey);
    url.searchParams.set("part", "snippet");
    url.searchParams.set("q", query);
    url.searchParams.set("type", "video");
    url.searchParams.set("videoEmbeddable", "true");
    url.searchParams.set("safeSearch", "moderate");
    url.searchParams.set("maxResults", String(CONFIG.youtube.maxResults || 8));

    if (CONFIG.youtube.regionCode) {
      url.searchParams.set("regionCode", CONFIG.youtube.regionCode);
    }

    if (CONFIG.youtube.relevanceLanguage) {
      url.searchParams.set(
        "relevanceLanguage",
        CONFIG.youtube.relevanceLanguage
      );
    }

    return url;
  }

  mapSearchItems(items) {
    return items
      .map((item) => {
        const videoId = item?.id?.videoId;
        const snippet = item?.snippet || {};

        if (!videoId) {
          return null;
        }

        const thumbnail =
          snippet.thumbnails?.medium?.url ||
          snippet.thumbnails?.default?.url ||
          "";

        return {
          videoId,
          title: this.decodeHtml(snippet.title || "Không có tiêu đề"),
          channelTitle: this.decodeHtml(snippet.channelTitle || "YouTube"),
          description: this.decodeHtml(snippet.description || ""),
          thumbnail,
          publishedAt: snippet.publishedAt || ""
        };
      })
      .filter(Boolean);
  }

  decodeHtml(value) {
    const textarea = document.createElement("textarea");
    textarea.innerHTML = String(value || "");

    return textarea.value;
  }

  cancelPreviousRequest() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  clearCache() {
    this.cache.clear();
  }
}

export default YouTubeSearch;