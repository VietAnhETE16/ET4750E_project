import CONFIG from "../config.js";

class PitchDetector {
  constructor() {
    this.minPitch = CONFIG.audio.minPitch || 70;
    this.maxPitch = CONFIG.audio.maxPitch || 900;
    this.confidenceThreshold = CONFIG.audio.pitchConfidenceThreshold || 0.22;

    this.lastConfidence = 0;
    this.lastPitch = 0;
  }

  detectPitch(inputBuffer, sampleRate) {
    this.lastConfidence = 0;
    this.lastPitch = 0;

    if (!inputBuffer || !inputBuffer.length || !sampleRate) {
      return 0;
    }

    const rms = this.calculateRms(inputBuffer);
    const minRms = CONFIG.audio.pitchMinRms ?? CONFIG.audio.minRmsForVoice;

    if (rms < minRms) {
      return 0;
    }

    const buffer = this.prepareBuffer(inputBuffer);

    if (!buffer) {
      return 0;
    }

    const result = this.autoCorrelate(buffer, sampleRate);

    this.lastConfidence = result.confidence;
    this.lastPitch = result.pitch;

    if (result.confidence < this.confidenceThreshold) {
      return 0;
    }

    return result.pitch;
  }

  calculateRms(buffer) {
    let sum = 0;

    for (let i = 0; i < buffer.length; i += 1) {
      sum += buffer[i] * buffer[i];
    }

    return Math.sqrt(sum / buffer.length);
  }

  prepareBuffer(inputBuffer) {
    const length = inputBuffer.length;

    let mean = 0;

    for (let i = 0; i < length; i += 1) {
      mean += inputBuffer[i];
    }

    mean /= length;

    let maxAbs = 0;
    const buffer = new Float32Array(length);

    for (let i = 0; i < length; i += 1) {
      const value = inputBuffer[i] - mean;

      const windowValue =
        0.5 * (1 - Math.cos((2 * Math.PI * i) / (length - 1)));

      buffer[i] = value * windowValue;

      const abs = Math.abs(buffer[i]);

      if (abs > maxAbs) {
        maxAbs = abs;
      }
    }

    if (maxAbs < 0.0008) {
      return null;
    }

    for (let i = 0; i < length; i += 1) {
      buffer[i] /= maxAbs;
    }

    return buffer;
  }

  autoCorrelate(buffer, sampleRate) {
    const size = buffer.length;

    const minLag = Math.floor(sampleRate / this.maxPitch);
    const maxLag = Math.floor(sampleRate / this.minPitch);

    let bestLag = -1;
    let bestCorrelation = 0;

    for (let lag = minLag; lag <= maxLag; lag += 1) {
      let correlation = 0;
      let energyA = 0;
      let energyB = 0;

      for (let i = 0; i < size - lag; i += 1) {
        const a = buffer[i];
        const b = buffer[i + lag];

        correlation += a * b;
        energyA += a * a;
        energyB += b * b;
      }

      const denominator = Math.sqrt(energyA * energyB);

      if (denominator <= 0) {
        continue;
      }

      const normalizedCorrelation = correlation / denominator;

      if (normalizedCorrelation > bestCorrelation) {
        bestCorrelation = normalizedCorrelation;
        bestLag = lag;
      }
    }

    if (bestLag === -1) {
      return {
        pitch: 0,
        confidence: 0
      };
    }

    const refinedLag = this.refineLag(buffer, bestLag);
    const pitch = sampleRate / refinedLag;

    if (
      !Number.isFinite(pitch) ||
      pitch < this.minPitch ||
      pitch > this.maxPitch
    ) {
      return {
        pitch: 0,
        confidence: 0
      };
    }

    return {
      pitch,
      confidence: bestCorrelation
    };
  }

  refineLag(buffer, lag) {
    const previous = this.correlationAtLag(buffer, lag - 1);
    const current = this.correlationAtLag(buffer, lag);
    const next = this.correlationAtLag(buffer, lag + 1);

    const denominator = previous - 2 * current + next;

    if (Math.abs(denominator) < 0.000001) {
      return lag;
    }

    const offset = 0.5 * (previous - next) / denominator;

    return lag + Math.max(-1, Math.min(1, offset));
  }

  correlationAtLag(buffer, lag) {
    if (lag <= 0 || lag >= buffer.length) {
      return 0;
    }

    let correlation = 0;

    for (let i = 0; i < buffer.length - lag; i += 1) {
      correlation += buffer[i] * buffer[i + lag];
    }

    return correlation;
  }
}

export default PitchDetector;