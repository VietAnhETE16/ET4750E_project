import CONFIG from "./config.js";
import eventBus from "./EventBus.js";

import ControlPanel from "./ui/ControlPanel.js";
import KeyboardShortcut from "./ui/KeyboardShortcut.js";
import sfxManager from "./ui/SfxManager.js";

class KaraokeApp {
  constructor() {
    this.controlPanel = new ControlPanel();
    this.keyboardShortcut = new KeyboardShortcut();

    this.state = {
      micEnabled: false,
      isPlaying: false
    };
  }

  init() {
    this.printBanner();

    sfxManager.init();

    this.controlPanel.init();
    this.keyboardShortcut.init();

    this.bindTemporaryEvents();

    eventBus.emit("mic:status", {
      enabled: false,
      message: "Mic chưa bật",
      detail: "Phần xử lý micro sẽ được thêm ở Phần 4."
    });

    eventBus.emit("app:toast", {
      message: "Phần 1 đã sẵn sàng: UI + Control Panel.",
      type: "success"
    });
  }

  bindTemporaryEvents() {
    eventBus.on("ui:search-submit", ({ keyword }) => {
      console.log("[Search Submit]", keyword);

      eventBus.emit("app:toast", {
        message: `Tìm kiếm "${keyword}" sẽ được xử lý ở Phần 2.`,
        type: "info"
      });

      eventBus.emit("youtube:search-results", {
        items: this.getDemoSearchResults(keyword)
      });
    });

    eventBus.on("ui:search-input", ({ keyword }) => {
      if (!keyword) {
        eventBus.emit("youtube:suggestions", {
          suggestions: []
        });

        return;
      }

      eventBus.emit("youtube:suggestions", {
        suggestions: [
          `${keyword} karaoke`,
          `${keyword} beat chuẩn`,
          `${keyword} karaoke tone nữ`,
          `${keyword} karaoke tone nam`
        ]
      });
    });

    eventBus.on("youtube:select-video", ({ title }) => {
      eventBus.emit("app:toast", {
        message: `Đã chọn: ${title}. Player thật sẽ được thêm ở Phần 2.`,
        type: "success"
      });
    });

    eventBus.on("ui:toggle-play", () => {
      this.state.isPlaying = !this.state.isPlaying;

      eventBus.emit("app:toast", {
        message: this.state.isPlaying ? "Play demo." : "Pause demo.",
        type: "info"
      });
    });

    eventBus.on("ui:stop", () => {
      this.state.isPlaying = false;

      eventBus.emit("app:toast", {
        message: "Stop demo.",
        type: "info"
      });

      this.showDemoScore();
    });

    eventBus.on("ui:toggle-mic", () => {
      this.state.micEnabled = !this.state.micEnabled;

      eventBus.emit("mic:status", {
        enabled: this.state.micEnabled,
        message: this.state.micEnabled ? "Mic demo đang bật" : "Mic đã tắt",
        detail: this.state.micEnabled
          ? "AudioEngine thật sẽ được thêm ở Phần 4."
          : "Nhấn Bật Mic để cấp quyền micro."
      });

      eventBus.emit("singer:active", {
        singerId: this.state.micEnabled ? "singer1" : "singer2",
        active: this.state.micEnabled,
        rms: this.state.micEnabled ? 0.08 : 0,
        pitch: this.state.micEnabled ? 220 : 0
      });

      if (!this.state.micEnabled) {
        eventBus.emit("singer:active", {
          singerId: "singer1",
          active: false
        });

        eventBus.emit("singer:active", {
          singerId: "singer2",
          active: false
        });
      }
    });
  }

  getDemoSearchResults(keyword) {
    const encodedKeyword = encodeURIComponent(keyword);

    return [
      {
        videoId: "demo-1",
        title: `${keyword} - Karaoke Demo 1`,
        channelTitle: "Karaoke 3D Demo",
        thumbnail: `https://placehold.co/320x180/0f172a/38bdf8?text=${encodedKeyword}+1`
      },
      {
        videoId: "demo-2",
        title: `${keyword} - Beat Chuẩn Demo 2`,
        channelTitle: "Online Karaoke",
        thumbnail: `https://placehold.co/320x180/111827/c084fc?text=${encodedKeyword}+2`
      },
      {
        videoId: "demo-3",
        title: `${keyword} - Tone Nam/Nữ Demo 3`,
        channelTitle: "Music Stage",
        thumbnail: `https://placehold.co/320x180/020617/4ade80?text=${encodedKeyword}+3`
      }
    ];
  }

  showDemoScore() {
    eventBus.emit("score:final", {
      finalScore: 86,
      pitchScore: 82,
      rhythmScore: 88,
      energyScore: 90,
      stabilityScore: 84
    });
  }

  printBanner() {
    console.log(`
%c${CONFIG.appName}
%cFrontend: HTML5, CSS3, Vanilla JavaScript
3D: Three.js
Audio: Web Audio API
YouTube: IFrame API + Data API v3
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