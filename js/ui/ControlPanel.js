import CONFIG from "../config.js";
import eventBus from "../EventBus.js";
import sfxManager from "./SfxManager.js";

class ControlPanel {
  constructor() {
    this.elements = {};
    this.toastTimer = null;
    this.isCollapsed = false;
  }

  init() {
    this.cacheElements();
    this.bindEvents();
    this.bindBusEvents();

    this.showToast("Giao diện hệ thống đã sẵn sàng.");
  }

  cacheElements() {
    this.elements.controlPanel = document.querySelector("#control-panel");
    this.elements.btnCollapse = document.querySelector("#btn-collapse");
    this.elements.btnExpandPanel = document.querySelector("#btn-expand-panel");

    this.elements.searchInput = document.querySelector("#search-input");
    this.elements.btnSearch = document.querySelector("#btn-search");
    this.elements.suggestionList = document.querySelector("#suggestion-list");
    this.elements.searchResults = document.querySelector("#search-results");

    this.elements.btnPlayPause = document.querySelector("#btn-play-pause");
    this.elements.btnStop = document.querySelector("#btn-stop");

    this.elements.btnToggleMic = document.querySelector("#btn-toggle-mic");
    this.elements.micStatus = document.querySelector("#mic-status");
    this.elements.micDetail = document.querySelector("#mic-detail");

    this.elements.singer1Card = document.querySelector("#singer-1-card");
    this.elements.singer2Card = document.querySelector("#singer-2-card");
    this.elements.singer1Status = document.querySelector("#singer-1-status");
    this.elements.singer2Status = document.querySelector("#singer-2-status");

    this.elements.scoreModal = document.querySelector("#score-modal");
    this.elements.finalScoreValue = document.querySelector("#final-score-value");
    this.elements.scoreComment = document.querySelector("#score-comment");
    this.elements.pitchScore = document.querySelector("#pitch-score");
    this.elements.rhythmScore = document.querySelector("#rhythm-score");
    this.elements.energyScore = document.querySelector("#energy-score");
    this.elements.stabilityScore = document.querySelector("#stability-score");
    this.elements.btnCloseScore = document.querySelector("#btn-close-score");

    this.elements.toast = document.querySelector("#toast");
  }

  bindEvents() {
    this.elements.btnCollapse.addEventListener("click", () => {
      sfxManager.playClick();
      this.collapse();
    });

    this.elements.btnExpandPanel.addEventListener("click", () => {
      sfxManager.playOpen();
      this.expand();
    });

    this.elements.btnSearch.addEventListener("click", () => {
      this.submitSearch();
    });

    this.elements.searchInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        this.submitSearch();
      }
    });

    this.elements.searchInput.addEventListener("input", () => {
      const keyword = this.getSearchKeyword();

      eventBus.emit("ui:search-input", {
        keyword
      });
    });

    this.elements.btnPlayPause.addEventListener("click", () => {
      sfxManager.playClick();
      eventBus.emit("ui:toggle-play");
    });

    this.elements.btnStop.addEventListener("click", () => {
      sfxManager.playClick();
      eventBus.emit("ui:stop");
    });

    this.elements.btnToggleMic.addEventListener("click", () => {
      sfxManager.playClick();
      eventBus.emit("ui:toggle-mic");
    });

    this.elements.btnCloseScore.addEventListener("click", () => {
      sfxManager.playClick();
      this.hideScoreModal();
    });
  }

  bindBusEvents() {
    eventBus.on("app:toast", ({ message, type }) => {
      this.showToast(message, type);
    });

    eventBus.on("ui:collapse-panel", () => {
      this.collapse();
    });

    eventBus.on("ui:expand-panel", () => {
      this.expand();
    });

    eventBus.on("ui:submit-search", () => {
      this.submitSearch();
    });

    eventBus.on("mic:status", (payload) => {
      this.updateMicStatus(payload);
    });

    eventBus.on("singer:active", (payload) => {
      this.updateSingerStatus(payload);
    });

    eventBus.on("youtube:suggestions", (payload) => {
      this.renderSuggestions(payload.suggestions || []);
    });

    eventBus.on("youtube:search-results", (payload) => {
      this.renderSearchResults(payload.items || []);
    });

    eventBus.on("score:final", (payload) => {
      this.showScoreModal(payload);
    });
  }

  getSearchKeyword() {
    return this.elements.searchInput.value.trim();
  }

  submitSearch() {
    const keyword = this.getSearchKeyword();

    if (!keyword) {
      this.showToast("Bạn cần nhập tên bài hát trước khi tìm.", "warning");
      sfxManager.playError();
      return;
    }

    sfxManager.playClick();

    this.clearSuggestions();

    eventBus.emit("ui:search-submit", {
      keyword
    });
  }

  collapse() {
    this.isCollapsed = true;

    this.elements.controlPanel.classList.add("collapsed");
    this.elements.btnExpandPanel.classList.remove("hidden");
  }

  expand() {
    this.isCollapsed = false;

    this.elements.controlPanel.classList.remove("collapsed");
    this.elements.btnExpandPanel.classList.add("hidden");
  }

  updateMicStatus({ enabled, message, detail }) {
    if (enabled) {
      this.elements.micStatus.textContent = message || "Mic đang bật";
      this.elements.micStatus.classList.add("text-success");
      this.elements.micStatus.classList.remove("text-danger", "text-warning");

      this.elements.btnToggleMic.textContent = "Tắt Mic";
    } else {
      this.elements.micStatus.textContent = message || "Mic chưa bật";
      this.elements.micStatus.classList.remove("text-success");
      this.elements.micStatus.classList.add("text-warning");

      this.elements.btnToggleMic.textContent = "Bật Mic";
    }

    this.elements.micDetail.textContent = detail || "";
  }

  updateSingerStatus({ singerId, active, rms, pitch }) {
    const card =
      singerId === "singer1"
        ? this.elements.singer1Card
        : this.elements.singer2Card;

    const status =
      singerId === "singer1"
        ? this.elements.singer1Status
        : this.elements.singer2Status;

    if (!card || !status) {
      return;
    }

    if (active) {
      card.classList.add("active");

      const rmsText = Number.isFinite(rms) ? rms.toFixed(3) : "--";
      const pitchText = Number.isFinite(pitch) ? `${Math.round(pitch)} Hz` : "--";

      status.textContent = `Đang hát | RMS: ${rmsText} | Pitch: ${pitchText}`;
    } else {
      card.classList.remove("active");
      status.textContent = "Đang chờ giọng hát...";
    }
  }

  renderSuggestions(suggestions) {
    this.elements.suggestionList.innerHTML = "";

    if (!suggestions.length) {
      return;
    }

    const fragment = document.createDocumentFragment();

    suggestions.slice(0, 8).forEach((suggestion) => {
      const li = document.createElement("li");
      li.textContent = suggestion;

      li.addEventListener("click", () => {
        this.elements.searchInput.value = suggestion;
        this.clearSuggestions();

        eventBus.emit("ui:search-submit", {
          keyword: suggestion
        });
      });

      fragment.appendChild(li);
    });

    this.elements.suggestionList.appendChild(fragment);
  }

  clearSuggestions() {
    this.elements.suggestionList.innerHTML = "";
  }

  renderSearchResults(items) {
    this.elements.searchResults.innerHTML = "";

    if (!items.length) {
      this.elements.searchResults.innerHTML = `
        <div class="score-hidden-box">
          <strong>Không tìm thấy video phù hợp</strong>
          <p>Hãy thử từ khóa khác.</p>
        </div>
      `;
      return;
    }

    const fragment = document.createDocumentFragment();

    items.forEach((item) => {
      const button = document.createElement("article");
      button.className = "search-result-item";
      button.tabIndex = 0;

      button.innerHTML = `
        <img src="${this.escapeHtml(item.thumbnail)}" alt="">
        <div>
          <h4>${this.escapeHtml(item.title)}</h4>
          <p>${this.escapeHtml(item.channelTitle || "YouTube")}</p>
        </div>
      `;

      button.addEventListener("click", () => {
        sfxManager.playSuccess();

        eventBus.emit("youtube:select-video", {
          videoId: item.videoId,
          title: item.title
        });
      });

      button.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          button.click();
        }
      });

      fragment.appendChild(button);
    });

    this.elements.searchResults.appendChild(fragment);
  }

  showScoreModal(scoreData) {
    const {
      finalScore = 0,
      pitchScore = 0,
      rhythmScore = 0,
      energyScore = 0,
      stabilityScore = 0
    } = scoreData || {};

    this.elements.finalScoreValue.textContent = Math.round(finalScore);
    this.elements.pitchScore.textContent = Math.round(pitchScore);
    this.elements.rhythmScore.textContent = Math.round(rhythmScore);
    this.elements.energyScore.textContent = Math.round(energyScore);
    this.elements.stabilityScore.textContent = Math.round(stabilityScore);

    this.elements.scoreComment.textContent = this.getScoreComment(finalScore);
    this.elements.scoreModal.classList.remove("hidden");

    sfxManager.playSuccess();
  }

  hideScoreModal() {
    this.elements.scoreModal.classList.add("hidden");
  }

  getScoreComment(score) {
    if (score >= 90) {
      return "Xuất sắc! Màn trình diễn rất ấn tượng.";
    }

    if (score >= 75) {
      return "Rất tốt! Bạn hát khá ổn định.";
    }

    if (score >= 60) {
      return "Khá ổn! Có thể cải thiện thêm nhịp và cao độ.";
    }

    return "Bạn đã hoàn thành bài hát. Hãy thử lại để đạt điểm cao hơn.";
  }

  showToast(message, type = "info") {
    const toast = this.elements.toast;

    if (!toast) {
      return;
    }

    toast.textContent = message;
    toast.className = `toast`;

    if (type === "success") {
      toast.classList.add("text-success");
    }

    if (type === "warning") {
      toast.classList.add("text-warning");
    }

    if (type === "error") {
      toast.classList.add("text-danger");
    }

    window.clearTimeout(this.toastTimer);

    this.toastTimer = window.setTimeout(() => {
      toast.classList.add("hidden");
    }, CONFIG.ui.toastDurationMs);
  }

  escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
}

export default ControlPanel;