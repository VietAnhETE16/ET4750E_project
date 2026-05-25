import CONFIG from "../config.js";

class PitchDetector {
  constructor() {
    this.minPitch = CONFIG.audio.minPitch;
    this.maxPitch = CONFIG.audio.maxPitch;
  }

  detectPitch(buffer, sampleRate) {
    if (!buffer || !buffer.length || !sampleRate) {
      return 0;
    }

    const rms = this.calculateRms(buffer);

    if (rms < CONFIG.audio.minRmsForVoice) {
      return 0;
    }

    const trimmedBuffer = this.trimSilence(buffer);

    if (trimmedBuffer.length < 32) {
      return 0;
    }

    return this.autoCorrelate(trimmedBuffer, sampleRate);
  }

  calculateRms(buffer) {
    let sum = 0;

    for (let i = 0; i < buffer.length; i += 1) {
      sum += buffer[i] * buffer[i];
    }

    return Math.sqrt(sum / buffer.length);
  }

  trimSilence(buffer) {
    const threshold = CONFIG.audio.minRmsForVoice * 0.55;

    let start = 0;
    let end = buffer.length - 1;

    while (start < buffer.length && Math.abs(buffer[start]) < threshold) {
      start += 1;
    }

    while (end > start && Math.abs(buffer[end]) < threshold) {
      end -= 1;
    }

    return buffer.slice(start, end + 1);
  }

  autoCorrelate(buffer, sampleRate) {
    const size = buffer.length;

    const minLag = Math.floor(sampleRate / this.maxPitch);
    const maxLag = Math.floor(sampleRate / this.minPitch);

    let bestLag = -1;
    let bestCorrelation = 0;

    for (let lag = minLag; lag <= maxLag; lag += 1) {
      let correlation = 0;

      for (let i = 0; i < size - lag; i += 1) {
        correlation += buffer[i] * buffer[i + lag];
      }

      correlation = correlation / (size - lag);

      if (correlation > bestCorrelation) {
        bestCorrelation = correlation;
        bestLag = lag;
      }
    }

    if (bestLag === -1 || bestCorrelation < 0.002) {
      return 0;
    }

    const pitch = sampleRate / bestLag;

    if (pitch < this.minPitch || pitch > this.maxPitch) {
      return 0;
    }

    return pitch;
  }
}

export default PitchDetector;