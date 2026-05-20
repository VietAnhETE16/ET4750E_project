import CONFIG from "./config.js";
import eventBus from "./EventBus.js";

import ControlPanel from "./ui/ControlPanel.js";
import KeyboardShortcut from "./ui/KeyboardShortcut.js";
import sfxManager from "./ui/SfxManager.js";

import SuggestService from "./youtube/SuggestService.js";
import YouTubeSearch from "./youtube/YouTubeSearch.js";
import YouTubePlayer from "./youtube/YouTubePlayer.js";
import VideoQueue from "./youtube/VideoQueue.js";

class KaraokeApp {
  constructor() {
    this.controlPanel = new ControlPanel();
    this.keyboardShortcut = new KeyboardShortcut();

    this.suggestService = new SuggestService();
    this.youtubeSearch = new YouTubeSearch();
    this.youtubePlayer = new YouTubePlayer();
    this.videoQueue = new VideoQueue();

    this.state = {
      micEnabled: false,
      isSearching: false,
      currentVideoId: null,
      currentVideoTitle: "",
      playerState: "idle",
      lastSuggestionTimer: null,
      autoNextTimer: null
    };
  }

  async init() {
    this.printBanner();

    sfxManager.init();

    this.controlPanel.init();
    this.keyboardShortcut.init();

    this.bindEvents();
    this.emitQueueChanged();

    eventBus.emit("mic:status", {
      enabled: false,
      message: "Mic chưa bật",
      detail: "Phần xử lý micro sẽ được thêm ở Phần 4."
    });

    try {
      await this.youtubePlayer.init();
    } catch (error) {
      console.error("[KaraokeApp] Không khởi tạo được YouTube Player:", error);

      eventBus.emit("app:toast", {
        message: "Không tải được YouTube Player API.",
        type: "error"
      });
    }

    eventBus.emit("app:toast", {
      message: "Hệ thống đã sẵn sàng: tìm bài, phát video và dùng hàng chờ.",
      type: "success"
    });
  }

  bindEvents() {
    eventBus.on("ui:search-input", ({ keyword }) => {
      this.handleSuggestInput(keyword);
    });

    eventBus.on("ui:search-submit", ({ keyword }) => {
      this.handleSearchSubmit(keyword);
    });

    eventBus.on("youtube:select-video", (payload) => {
      this.handleSelectVideo(payload);
    });

    eventBus.on("ui:skip", () => {
      this.handleSkipVideo();
    });

    eventBus.on("ui:toggle-mic", () => {
      this.handleTemporaryMicToggle();
    });

    eventBus.on("youtube:state", (payload) => {
      this.handleYouTubeState(payload);
    });

    eventBus.on("youtube:ended", (payload) => {
      this.handleVideoEnded(payload);
    });

    eventBus.on("youtube:error", (payload) => {
      this.handleYouTubeError(payload);
    });

    eventBus.on("queue:clear", () => {
      this.handleClearQueue();
    });

    eventBus.on("queue:remove", ({ index }) => {
      this.handleRemoveQueueItem(index);
    });
  }

  handleSuggestInput(keyword) {
    window.clearTimeout(this.state.lastSuggestionTimer);

    const query = String(keyword || "").trim();

    if (!query) {
      eventBus.emit("youtube:suggestions", {
        suggestions: []
      });

      return;
    }

    this.state.lastSuggestionTimer = window.setTimeout(async () => {
      try {
        const suggestions = await this.suggestService.getSuggestions(query);

        eventBus.emit("youtube:suggestions", {
          suggestions
        });
      } catch (error) {
        if (error.name === "AbortError") {
          return;
        }

        console.warn("[KaraokeApp] Lỗi gợi ý tìm kiếm:", error);

        eventBus.emit("youtube:suggestions", {
          suggestions: []
        });
      }
    }, CONFIG.ui.suggestionDebounceMs);
  }

  async handleSearchSubmit(keyword) {
    const query = String(keyword || "").trim();

    if (!query) {
      eventBus.emit("app:toast", {
        message: "Bạn cần nhập tên bài hát trước khi tìm.",
        type: "warning"
      });

      return;
    }

    if (this.state.isSearching) {
      return;
    }

    this.state.isSearching = true;

    eventBus.emit("app:toast", {
      message: `Đang tìm "${query}" trên YouTube...`,
      type: "info"
    });

    try {
      const items = await this.youtubeSearch.searchVideos(query);

      eventBus.emit("youtube:search-results", {
        items
      });

      if (!items.length) {
        eventBus.emit("app:toast", {
          message: "Không tìm thấy video phù hợp.",
          type: "warning"
        });
      } else {
        eventBus.emit("app:toast", {
          message: `Tìm thấy ${items.length} video. Bấm để phát hoặc thêm vào hàng chờ.`,
          type: "success"
        });
      }
    } catch (error) {
      if (error.name === "AbortError") {
        return;
      }

      console.error("[KaraokeApp] Lỗi tìm kiếm YouTube:", error);

      eventBus.emit("youtube:search-results", {
        items: []
      });

      eventBus.emit("app:toast", {
        message: error.message || "Không tìm kiếm được video YouTube.",
        type: "error"
      });
    } finally {
      this.state.isSearching = false;
    }
  }

  handleSelectVideo(video) {
    if (!video || !video.videoId) {
      eventBus.emit("app:toast", {
        message: "Không tìm thấy videoId của kết quả đã chọn.",
        type: "error"
      });

      return;
    }

    if (this.isVideoCurrentlyActive()) {
      this.videoQueue.enqueue(video);
      this.emitQueueChanged();

      eventBus.emit("app:toast", {
        message: `Đã thêm vào hàng chờ: ${video.title}`,
        type: "success"
      });

      return;
    }

    this.playVideoNow(video);
  }

  playVideoNow(video) {
    this.clearAutoNextTimer();

    this.state.currentVideoId = video.videoId;
    this.state.currentVideoTitle = video.title;
    this.state.playerState = "loading";

    this.youtubePlayer.loadVideo(video.videoId, video.title);

    eventBus.emit("app:toast", {
      message: `Đang phát video: ${video.title}`,
      type: "success"
    });

    eventBus.emit("ui:collapse-panel");
  }

  isVideoCurrentlyActive() {
    if (!this.state.currentVideoId) {
      return false;
    }

    const inactiveStates = new Set([
      "idle",
      "ended",
      "stopped",
      "error"
    ]);

    return !inactiveStates.has(this.state.playerState);
  }

  handleSkipVideo() {
    this.clearAutoNextTimer();

    eventBus.emit("score:hide");

    if (this.videoQueue.hasNext()) {
      const skippedTitle = this.state.currentVideoTitle || "bài hiện tại";
      const nextVideo = this.videoQueue.dequeue();

      this.emitQueueChanged();

      eventBus.emit("app:toast", {
        message: `Đã bỏ qua "${skippedTitle}". Đang chuyển sang: ${nextVideo.title}`,
        type: "info"
      });

      this.playVideoNow(nextVideo);
      return;
    }

    this.youtubePlayer.stopVideo();

    this.state.currentVideoId = null;
    this.state.currentVideoTitle = "";
    this.state.playerState = "stopped";

    eventBus.emit("app:toast", {
      message: "Đã bỏ qua bài hiện tại. Không còn bài nào trong hàng chờ.",
      type: "info"
    });

    eventBus.emit("ui:expand-panel");
  }  

  handleYouTubeState({ state, title }) {
    this.state.playerState = state || this.state.playerState;

    switch (state) {
      case "playing":
        eventBus.emit("app:toast", {
          message: title ? `Đang phát: ${title}` : "Đang phát video.",
          type: "info"
        });
        break;

      case "paused":
        console.log("[YouTube] Video đang tạm dừng.");
        break;

      case "buffering":
        console.log("[YouTube] Đang tải dữ liệu video...");
        break;

      case "ended":
        console.log("[YouTube] Video đã kết thúc.");
        break;

      case "stopped":
        console.log("[YouTube] Video đã dừng.");
        break;

      default:
        break;
    }
  }

  handleVideoEnded() {
    this.state.playerState = "ended";

    eventBus.emit("app:toast", {
      message: "Bài hát đã kết thúc. Đang hiển thị điểm.",
      type: "success"
    });

    eventBus.emit("score:final", {
      finalScore: 86,
      pitchScore: 82,
      rhythmScore: 88,
      energyScore: 90,
      stabilityScore: 84
    });

    if (CONFIG.queue?.autoPlayNext && this.videoQueue.hasNext()) {
      const delay = CONFIG.queue.autoNextDelayMs ?? 3500;

      eventBus.emit("app:toast", {
        message: `Sẽ tự động phát bài tiếp theo sau ${Math.round(delay / 1000)} giây.`,
        type: "info"
      });

      this.clearAutoNextTimer();

      this.state.autoNextTimer = window.setTimeout(() => {
        eventBus.emit("score:hide");
        this.playNextFromQueue();
      }, delay);
    } else {
      eventBus.emit("ui:expand-panel");
    }
  }

  handleYouTubeError(payload) {
    console.warn("[YouTube Error]", payload);

    this.state.playerState = "error";

    if (this.videoQueue.hasNext()) {
      eventBus.emit("app:toast", {
        message: "Video lỗi. Đang chuyển sang bài tiếp theo trong hàng chờ.",
        type: "warning"
      });

      window.setTimeout(() => {
        this.playNextFromQueue();
      }, 800);
    } else {
      eventBus.emit("ui:expand-panel");
    }
  }

  playNextFromQueue() {
    const nextVideo = this.videoQueue.dequeue();

    this.emitQueueChanged();

    if (!nextVideo) {
      this.state.currentVideoId = null;
      this.state.currentVideoTitle = "";
      this.state.playerState = "idle";

      eventBus.emit("ui:expand-panel");

      return;
    }

    this.playVideoNow(nextVideo);
  }

  handleClearQueue() {
    this.videoQueue.clear();
    this.emitQueueChanged();

    eventBus.emit("app:toast", {
      message: "Đã xóa toàn bộ hàng chờ.",
      type: "info"
    });
  }

  handleRemoveQueueItem(index) {
    const removed = this.videoQueue.removeAt(index);
    this.emitQueueChanged();

    if (removed) {
      eventBus.emit("app:toast", {
        message: `Đã xóa khỏi hàng chờ: ${removed.title}`,
        type: "info"
      });
    }
  }

  emitQueueChanged() {
    eventBus.emit("queue:changed", {
      items: this.videoQueue.getItems(),
      count: this.videoQueue.size()
    });
  }

  clearAutoNextTimer() {
    if (this.state.autoNextTimer) {
      window.clearTimeout(this.state.autoNextTimer);
      this.state.autoNextTimer = null;
    }
  }

  handleTemporaryMicToggle() {
    this.state.micEnabled = !this.state.micEnabled;

    eventBus.emit("mic:status", {
      enabled: this.state.micEnabled,
      message: this.state.micEnabled ? "Mic demo đang bật" : "Mic đã tắt",
      detail: this.state.micEnabled
        ? "AudioEngine thật sẽ được thêm ở Phần 4."
        : "Nhấn Bật Mic để cấp quyền micro."
    });

    eventBus.emit("singer:active", {
      singerId: "singer1",
      active: this.state.micEnabled,
      rms: this.state.micEnabled ? 0.08 : 0,
      pitch: this.state.micEnabled ? 220 : 0
    });

    eventBus.emit("singer:active", {
      singerId: "singer2",
      active: false,
      rms: 0,
      pitch: 0
    });
  }

  printBanner() {
    console.log(
      `
%c${CONFIG.appName}
%cFrontend: HTML5, CSS3, Vanilla JavaScript
3D: Three.js
Audio: Web Audio API
YouTube: IFrame API + Data API v3
Queue: Enabled
`,
      "color:#38bdf8;font-size:18px;font-weight:bold;",
      "color:#94a3b8;font-size:12px;"
    );
  }
}

window.addEventListener("DOMContentLoaded", () => {
  const app = new KaraokeApp();

  app.init();

  window.karaokeApp = app;
});