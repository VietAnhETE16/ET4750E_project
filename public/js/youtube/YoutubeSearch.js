class YouTubeSearch {
  constructor() {
    this.cache = new Map();
    this.abortController = null;
  }

  async searchVideos(keyword) {
    const query = String(keyword || "").trim();

    if (!query) {
      return [];
    }

    if (this.cache.has(query)) {
      return this.cache.get(query);
    }

    this.cancelPreviousRequest();

    this.abortController = new AbortController();

    const url = new URL("/api/youtube/search", window.location.origin);
    url.searchParams.set("q", query);

    const response = await fetch(url.toString(), {
      method: "GET",
      signal: this.abortController.signal
    });

    if (!response.ok) {
      const data = await response.json().catch(() => null);

      throw new Error(
        data?.error || `Không tìm kiếm được YouTube. HTTP ${response.status}`
      );
    }

    const data = await response.json();

    const items = data.items || [];

    this.cache.set(query, items);

    return items;
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