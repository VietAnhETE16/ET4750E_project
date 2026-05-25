import CONFIG from "../config.js";

class VoiceActivityDetector {
  constructor() {
    this.minRms = CONFIG.audio.minRmsForVoice;
    this.silenceTimeoutMs = CONFIG.audio.silenceTimeoutMs;

    this.lastVoiceTime = 0;
    this.active = false;
  }

  update(rms) {
    const now = performance.now();

    if (rms >= this.minRms) {
      this.lastVoiceTime = now;
      this.active = true;

      return true;
    }

    if (now - this.lastVoiceTime > this.silenceTimeoutMs) {
      this.active = false;
    }

    return this.active;
  }

  reset() {
    this.lastVoiceTime = 0;
    this.active = false;
  }
}

export default VoiceActivityDetector;