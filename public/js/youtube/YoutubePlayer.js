import CONFIG from "../config.js";
import eventBus from "../EventBus.js";

class YouTubePlayer {
  constructor() {
    this.player = null;

    this.isApiReady = false;
    this.isPlayerReady = false;

    this.currentVideoId = "";
    this.currentTitle = "";

    this.pendingVideo = null;

    this.placeholderElement = null;
  }

  async init() {
    this.placeholderElement = document.querySelector("#youtube-placeholder");

    await this.loadIframeApi();

    this.isApiReady = true;

    this.createPlayer();
  }

  loadIframeApi() {
    if (window.YT && window.YT.Player) {
      return Promise.resolve();
    }

    if (window.__youtubeIframeApiPromise) {
      return window.__youtubeIframeApiPromise;
    }

    window.__youtubeIframeApiPromise = new Promise((resolve, reject) => {
      window.onYouTubeIframeAPIReady = () => {
        resolve();
      };

      const oldScript = document.querySelector(
        'script[src="https://www.youtube.com/iframe_api"]'
      );

      if (oldScript) {
        return;
      }

      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;

      script.onerror = () => {
        reject(new Error("Không tải được YouTube IFrame API."));
      };

      document.head.appendChild(script);
    });

    return window.__youtubeIframeApiPromise;
  }

  createPlayer() {
    const origin =
      window.location.origin && window.location.origin !== "null"
        ? window.location.origin
        : undefined;

    this.player = new window.YT.Player("youtube-player", {
      width: "100%",
      height: "100%",
      videoId: "",
      playerVars: {
        ...CONFIG.youtube.playerVars,

        autoplay: 1,

        // Nếu muốn ẩn control YouTube thì đổi thành 0.
        // Giai đoạn test nên để 1 để dễ kiểm tra video có hiện thật không.
        controls: 1,

        rel: 0,
        modestbranding: 1,
        playsinline: 1,
        origin
      },
      events: {
        onReady: () => this.handleReady(),
        onStateChange: (event) => this.handleStateChange(event),
        onError: (event) => this.handleError(event)
      }
    });
  }

  handleReady() {
    this.isPlayerReady = true;
    this.forceShowIframe();

    eventBus.emit("youtube:ready", {
      ready: true
    });

    eventBus.emit("app:toast", {
      message: "YouTube Player đã sẵn sàng.",
      type: "success"
    });

    if (this.pendingVideo) {
      const { videoId, title } = this.pendingVideo;
      this.pendingVideo = null;
      this.loadVideo(videoId, title);
    }
  }

  loadVideo(videoId, title = "") {
    if (!videoId) {
      eventBus.emit("app:toast", {
        message: "Thiếu videoId YouTube.",
        type: "error"
      });

      return;
    }

    this.currentVideoId = videoId;
    this.currentTitle = title;

    if (!this.isPlayerReady || !this.player) {
      this.pendingVideo = {
        videoId,
        title
      };

      eventBus.emit("app:toast", {
        message: "Player đang khởi tạo, video sẽ phát ngay khi sẵn sàng.",
        type: "warning"
      });

      return;
    }

    this.hidePlaceholder();
    this.forceShowIframe();

    this.player.loadVideoById({
      videoId,
      startSeconds: 0,
      suggestedQuality: "large"
    });

    // Gọi play thêm một lần để chắc chắn phát ngay sau thao tác click của người dùng
    window.setTimeout(() => {
      try {
        this.player.playVideo();
      } catch (error) {
        console.warn("[YouTubePlayer] Không thể gọi playVideo:", error);
      }
    }, 250);

    eventBus.emit("youtube:video-loaded", {
      videoId,
      title
    });
  }

  stopVideo() {
    if (!this.isPlayerReady || !this.player) {
      return;
    }

    this.player.stopVideo();
    this.showPlaceholder();

    eventBus.emit("youtube:state", {
      state: "stopped",
      title: this.currentTitle
    });
  }

  handleStateChange(event) {
    const state = event.data;

    if (!window.YT || !window.YT.PlayerState) {
      return;
    }

    switch (state) {
      case window.YT.PlayerState.ENDED:
        eventBus.emit("youtube:state", {
          state: "ended",
          title: this.currentTitle
        });

        eventBus.emit("youtube:ended", {
          videoId: this.currentVideoId,
          title: this.currentTitle
        });
        break;

      case window.YT.PlayerState.PLAYING:
        this.hidePlaceholder();
        this.forceShowIframe();

        eventBus.emit("youtube:state", {
          state: "playing",
          title: this.currentTitle
        });

        eventBus.emit("score:start", {
          videoId: this.currentVideoId,
          title: this.currentTitle
        });
        break;

      case window.YT.PlayerState.BUFFERING:
        this.forceShowIframe();

        eventBus.emit("youtube:state", {
          state: "buffering",
          title: this.currentTitle
        });
        break;

      case window.YT.PlayerState.PAUSED:
        eventBus.emit("youtube:state", {
          state: "paused",
          title: this.currentTitle
        });
        break;

      default:
        break;
    }
  }

  handleError(event) {
    const errorCode = event.data;
    const message = this.getErrorMessage(errorCode);

    eventBus.emit("youtube:error", {
      code: errorCode,
      message,
      videoId: this.currentVideoId,
      title: this.currentTitle
    });

    eventBus.emit("app:toast", {
      message,
      type: "error"
    });

    if (errorCode === 101 || errorCode === 150) {
      eventBus.emit("ui:expand-panel");
    }
  }

  getErrorMessage(errorCode) {
    switch (errorCode) {
      case 2:
        return "Video ID không hợp lệ.";

      case 5:
        return "Trình phát HTML5 không thể phát video này.";

      case 100:
        return "Video không tồn tại, đã bị xóa hoặc đang ở chế độ riêng tư.";

      case 101:
      case 150:
        return "Video này không cho phép nhúng. Hãy chọn video khác.";

      case 153:
        return "YouTube yêu cầu HTTP Referer hoặc thông tin client.";

      default:
        return `Không thể phát video YouTube. Mã lỗi: ${errorCode}`;
    }
  }

  forceShowIframe() {
    const iframe = this.player?.getIframe?.();

    if (!iframe) {
      return;
    }

    iframe.style.display = "block";
    iframe.style.width = "100%";
    iframe.style.height = "100%";
    iframe.style.opacity = "1";
    iframe.style.visibility = "visible";
    iframe.style.border = "0";
    iframe.style.background = "#000";
  }

  getCurrentTime() {
    if (!this.isPlayerReady || !this.player) {
      return 0;
    }

    return this.player.getCurrentTime() || 0;
  }

  getDuration() {
    if (!this.isPlayerReady || !this.player) {
      return 0;
    }

    return this.player.getDuration() || 0;
  }

  hidePlaceholder() {
    if (this.placeholderElement) {
      this.placeholderElement.classList.add("hidden");
    }
  }

  showPlaceholder() {
    if (this.placeholderElement) {
      this.placeholderElement.classList.remove("hidden");
    }
  }
}

export default YouTubePlayer;