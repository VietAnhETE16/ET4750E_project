class SuggestService {
  constructor() {
    this.cache = new Map();
  }

  async getSuggestions(keyword) {
    const query = String(keyword || "").trim();

    if (!query) {
      return [];
    }

    if (this.cache.has(query)) {
      return this.cache.get(query);
    }

    const suggestions = this.getFallbackSuggestions(query);

    this.cache.set(query, suggestions);

    return suggestions;
  }

  getFallbackSuggestions(query) {
    return [
      `${query} karaoke`,
      `${query} karaoke tone nam`,
      `${query} karaoke tone nữ`,
      `${query} beat chuẩn`,
      `${query} instrumental`,
      `${query} lyrics`
    ];
  }

  clearCache() {
    this.cache.clear();
  }
}

export default SuggestService;