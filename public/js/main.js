import CONFIG from "./config.js";
import eventBus from "./EventBus.js";

import ControlPanel from "./ui/ControlPanel.js";
import KeyboardShortcut from "./ui/KeyboardShortcut.js";
import sfxManager from "./ui/SfxManager.js";

import SuggestService from "./youtube/SuggestService.js";
import YouTubeSearch from "./youtube/YouTubeSearch.js";
import YouTubePlayer from "./youtube/YouTubePlayer.js";
import VideoQueue from "./youtube/VideoQueue.js";
import ThreeStage from "./stage/ThreeStage.js";
import AudioEngine from "./audio/AudioEngine.js";
import ScoreEngine from "./score/ScoreEngine.js";

class KaraokeApp {
  constructor() {
    this.controlPanel = new ControlPanel();
    this.keyboardShortcut = new KeyboardShortcut();

    this.suggestService = new SuggestService();
    this.youtubeSearch = new YouTubeSearch();
    this.youtubePlayer = new YouTubePlayer();
    this.videoQueue = new VideoQueue();
    this.threeStage = new ThreeStage();
    this.audioEngine = new AudioEngine();
    this.scoreEngine = new ScoreEngine();

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
    
    try {
      await this.threeStage.init();
    } catch (error) {
      console.error("[KaraokeApp] Không khởi tạo được sân khấu 3D:", error);

      eventBus.emit("app:toast", {
        message: "Không khởi tạo được sân khấu 3D.",
        type: "error"
      });
    }

    eventBus.emit("mic:status", {
      enabled: false,
      message: "Mic chưa bật",
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
      this.handleToggleMic();
    });

    eventBus.on("ui:calibrate-singer", ({ singerId }) => {
      this.handleCalibrateSinger(singerId);
    });

    eventBus.on("ui:clear-calibration", () => {
      this.handleClearCalibration();
    });

    eventBus.on("audio:data", (payload) => {
      this.handleAudioData(payload);
    });

    eventBus.on("youtube:state", (payload) => {
      this.handleYouTubeState(payload);
    });

    eventBus.on("score:start", (payload) => {
      this.handleScoreStart(payload);
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

    this.scoreEngine.cancel();

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

    // Tính điểm thật từ dữ liệu audio đã thu trong lúc hát.
    this.scoreEngine.finish();

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

    this.scoreEngine.cancel();

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

  async handleToggleMic() {
    try {
      await this.audioEngine.toggle();

      this.state.micEnabled = this.audioEngine.enabled;
    } catch (error) {
      console.error("[KaraokeApp] Không bật được microphone:", error);

      eventBus.emit("mic:status", {
        enabled: false,
        message: "Không bật được Mic",
        detail: error.message || "Hãy kiểm tra quyền microphone của trình duyệt."
      });

      eventBus.emit("app:toast", {
        message: "Không bật được microphone. Hãy kiểm tra quyền truy cập mic.",
        type: "error"
      });
    }
  }

  handleCalibrateSinger(singerId) {
    try {
      this.audioEngine.startCalibration(singerId);
    } catch (error) {
      console.error("[KaraokeApp] Calibration lỗi:", error);

      eventBus.emit("app:toast", {
        message: error.message || "Không thể calibration giọng.",
        type: "error"
      });
    }
  }

  handleClearCalibration() {
    try {
      this.audioEngine.clearSpeakerProfiles();

      eventBus.emit("audio:calibration-cleared");

      eventBus.emit("app:toast", {
        message: "Đã xóa dữ liệu calibration cũ.",
        type: "success"
      });

      // Tắt phản ứng avatar ngay sau khi xóa calib
      eventBus.emit("singer:active", {
        singerId: "singer1",
        active: false,
        rms: 0,
        pitch: 0
      });

      eventBus.emit("singer:active", {
        singerId: "singer2",
        active: false,
        rms: 0,
        pitch: 0
      });
    } catch (error) {
      console.error("[KaraokeApp] Không xóa được calibration:", error);

      eventBus.emit("app:toast", {
        message: "Không xóa được dữ liệu calibration.",
        type: "error"
      });
    }
  }

  handleAudioData(payload) {
    // Gửi dữ liệu mic cho ScoreEngine để chấm điểm ngầm.
    this.scoreEngine.addAudioFrame(payload);

    // Log debug gọn, không ảnh hưởng logic.
    if (payload.mode === "dual-channel") {
      const singer1 = payload.singers?.singer1;
      const singer2 = payload.singers?.singer2;

      if (singer1?.active || singer2?.active) {
        console.log("[Audio Dual]", {
          singer1: {
            active: singer1?.active,
            rms: Number(singer1?.rms || 0).toFixed(4),
            pitch: Math.round(singer1?.pitch || 0)
          },
          singer2: {
            active: singer2?.active,
            rms: Number(singer2?.rms || 0).toFixed(4),
            pitch: Math.round(singer2?.pitch || 0)
          }
        });
      }

      return;
    }

    if (!payload.active) {
      return;
    }

    console.log("[Audio Mixed]", {
      singerId: payload.singerId,
      rms: Number(payload.rms || 0).toFixed(4),
      pitch: Math.round(payload.pitch || 0),
      confidence: Number(payload.confidence || 0).toFixed(2),
      reason: payload.reason
    });
  }

  handleScoreStart(payload) {
    this.scoreEngine.start({
      videoId: payload.videoId || this.state.currentVideoId,
      title: payload.title || this.state.currentVideoTitle
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