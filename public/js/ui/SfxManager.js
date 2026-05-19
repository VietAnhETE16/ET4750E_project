import CONFIG from "../config.js";

class SfxManager {
  constructor() {
    this.enabled = CONFIG.sfx.enabled;
    this.volume = CONFIG.sfx.volume;
    this.audioContext = null;
  }

  init() {
    if (this.audioContext) {
      return;
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;

    if (!AudioContextClass) {
      console.warn("[SfxManager] Trình duyệt không hỗ trợ Web Audio API.");
      return;
    }

    this.audioContext = new AudioContextClass();
  }

  async ensureRunning() {
    if (!this.audioContext) {
      this.init();
    }

    if (!this.audioContext) {
      return;
    }

    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
  }

  setVolume(volume) {
    this.volume = Math.min(1, Math.max(0, Number(volume) || 0));
  }

  async playClick() {
    await this.playTone({
      frequency: 720,
      duration: 0.045,
      type: "sine",
      gain: 0.04
    });
  }

  async playOpen() {
    await this.playTone({
      frequency: 520,
      duration: 0.08,
      type: "triangle",
      gain: 0.045
    });
  }

  async playSuccess() {
    await this.playSequence([
      { frequency: 620, duration: 0.06 },
      { frequency: 840, duration: 0.08 }
    ]);
  }

  async playError() {
    await this.playSequence([
      { frequency: 220, duration: 0.08 },
      { frequency: 160, duration: 0.12 }
    ]);
  }

  async playSequence(notes) {
    if (!this.enabled) {
      return;
    }

    for (const note of notes) {
      await this.playTone({
        frequency: note.frequency,
        duration: note.duration,
        type: note.type || "sine",
        gain: note.gain || 0.045
      });

      await this.wait(30);
    }
  }

  async playTone({ frequency, duration, type = "sine", gain = 0.04 }) {
    if (!this.enabled) {
      return;
    }

    await this.ensureRunning();

    if (!this.audioContext) {
      return;
    }

    const now = this.audioContext.currentTime;

    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);

    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(gain * this.volume, now + 0.006);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  }

  wait(ms) {
    return new Promise((resolve) => {
      window.setTimeout(resolve, ms);
    });
  }
}

const sfxManager = new SfxManager();

export default sfxManager;