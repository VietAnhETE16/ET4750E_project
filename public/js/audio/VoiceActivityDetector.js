import CONFIG from "../config.js";

class VoiceActivityDetector {
  constructor() {
    this.minRms = CONFIG.audio.minRmsForVoice;
    this.silenceTimeoutMs = CONFIG.audio.silenceTimeoutMs;

    this.voiceStartFrames = CONFIG.audio.voiceStartFrames || 3;
    this.maxCrestFactor = CONFIG.audio.maxCrestFactor || 18;

    this.lastVoiceTime = 0;
    this.active = false;
    this.voiceFrameCount = 0;
  }

  update(input) {
    const now = performance.now();

    const data = typeof input === "number"
      ? {
          rms: input,
          crestFactor: 0,
          zeroCrossingRate: 0
        }
      : input || {};

    const rms = Number(data.rms || 0);
    const crestFactor = Number(data.crestFactor || 0);
    const zeroCrossingRate = Number(data.zeroCrossingRate || 0);

    const minZcr = CONFIG.audio.minZeroCrossingRate ?? 0.01;
    const maxZcr = CONFIG.audio.maxZeroCrossingRate ?? 0.38;

    const hasEnoughRms = rms >= this.minRms;
    const isImpulseNoise = crestFactor > 0 && crestFactor > this.maxCrestFactor;

    const zcrLooksOk =
      zeroCrossingRate === 0 ||
      (zeroCrossingRate >= minZcr && zeroCrossingRate <= maxZcr);

    const isVoiceCandidate = hasEnoughRms && !isImpulseNoise && zcrLooksOk;

    if (isVoiceCandidate) {
      this.voiceFrameCount += 1;
    } else {
      this.voiceFrameCount = Math.max(0, this.voiceFrameCount - 1);
    }

    if (this.voiceFrameCount >= this.voiceStartFrames) {
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
    this.voiceFrameCount = 0;
  }
}

export default VoiceActivityDetector;
