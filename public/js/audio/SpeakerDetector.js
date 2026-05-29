import CONFIG from "../config.js";

class SpeakerDetector {
  constructor() {
    this.storageKey = "karaoke3d_mfcc_speaker_profiles";

    this.profiles = {
      singer1: null,
      singer2: null
    };

    this.calibration = {
      active: false,
      singerId: null,
      samples: [],
      lastAcceptedAt: 0
    };

    this.decision = {
      pendingSingerId: null,
      count: 0,
      stableSingerId: null
    };

    this.loadProfiles();
  }

  startCalibration(singerId) {
    if (!["singer1", "singer2"].includes(singerId)) {
      throw new Error(`Singer ID không hợp lệ: ${singerId}`);
    }

    this.calibration.active = true;
    this.calibration.singerId = singerId;
    this.calibration.samples = [];
    this.calibration.lastAcceptedAt = 0;

    this.resetDecision();
  }

  cancelCalibration() {
    this.calibration.active = false;
    this.calibration.singerId = null;
    this.calibration.samples = [];
    this.calibration.lastAcceptedAt = 0;
  }

  isCalibrating() {
    return this.calibration.active;
  }

  getCalibrationSingerId() {
    return this.calibration.singerId;
  }

  hasBothProfiles() {
    return Boolean(
      Array.isArray(this.profiles.singer1?.mfccMean) &&
      Array.isArray(this.profiles.singer2?.mfccMean)
    );
  }

  processSample({
    active,
    rms,
    mfcc,
    crestFactor = 0,
    zeroCrossingRate = 0
  }) {
    if (!this.calibration.active) {
      return {
        calibrationActive: false,
        completed: false,
        progress: 0
      };
    }

    const speechCheck = this.isSpeechLike({
      active,
      rms,
      mfcc,
      crestFactor,
      zeroCrossingRate
    });

    if (!speechCheck.ok) {
      return {
        calibrationActive: true,
        completed: false,
        singerId: this.calibration.singerId,
        progress: this.getCalibrationProgress(),
        accepted: false,
        reason: speechCheck.reason
      };
    }

    const now = performance.now();
    const sampleEveryMs = CONFIG.mfcc?.sampleEveryMs ?? 80;

    if (now - this.calibration.lastAcceptedAt < sampleEveryMs) {
      return {
        calibrationActive: true,
        completed: false,
        singerId: this.calibration.singerId,
        progress: this.getCalibrationProgress(),
        accepted: false,
        reason: "sample-throttled"
      };
    }

    this.calibration.lastAcceptedAt = now;

    this.calibration.samples.push({
      mfcc,
      rms
    });

    const progress = this.getCalibrationProgress();
    const targetSamples = this.getCalibrationTargetSamples();

    if (this.calibration.samples.length >= targetSamples) {
      const profile = this.createProfile(this.calibration.samples);

      this.profiles[this.calibration.singerId] = profile;
      this.saveProfiles();

      const completedSingerId = this.calibration.singerId;

      this.cancelCalibration();

      return {
        calibrationActive: false,
        completed: true,
        singerId: completedSingerId,
        profile,
        progress: 1,
        accepted: true,
        reason: "completed"
      };
    }

    return {
      calibrationActive: true,
      completed: false,
      singerId: this.calibration.singerId,
      progress,
      accepted: true,
      reason: "accepted"
    };
  }

  classify({
    active,
    rms,
    mfcc,
    crestFactor = 0,
    zeroCrossingRate = 0
  }) {
    if (!active) {
      this.resetDecision();

      return {
        singerId: null,
        confidence: 0,
        reason: "no-voice"
      };
    }

    if (!this.hasBothProfiles()) {
      return {
        singerId: null,
        confidence: 0,
        reason: "not-enough-profiles"
      };
    }

    const speechCheck = this.isSpeechLike({
      active,
      rms,
      mfcc,
      crestFactor,
      zeroCrossingRate
    });

    if (!speechCheck.ok) {
      this.resetDecision();

      return {
        singerId: null,
        confidence: 0,
        reason: speechCheck.reason
      };
    }

    const distance1 = this.calculateMfccDistance(this.profiles.singer1, mfcc);
    const distance2 = this.calculateMfccDistance(this.profiles.singer2, mfcc);

    const bestDistance = Math.min(distance1, distance2);
    const worstDistance = Math.max(distance1, distance2);
    const candidateSingerId = distance1 <= distance2 ? "singer1" : "singer2";

    const maxDistance = CONFIG.mfcc?.maxDistance ?? 9.5;

    if (bestDistance > maxDistance) {
      this.resetDecision();

      return {
        singerId: null,
        confidence: 0,
        reason: "too-far-from-profiles",
        distances: {
          singer1: distance1,
          singer2: distance2
        }
      };
    }

    const relativeMargin = Math.abs(distance1 - distance2) / (worstDistance + 0.0001);
    const decisionMargin = CONFIG.mfcc?.decisionMargin ?? 0.08;

    if (relativeMargin < decisionMargin) {
      return {
        singerId: this.decision.stableSingerId,
        confidence: Math.min(0.45, relativeMargin * 2),
        reason: this.decision.stableSingerId ? "holding-previous-speaker" : "uncertain-speaker",
        distances: {
          singer1: distance1,
          singer2: distance2
        }
      };
    }

    const stableSingerId = this.updateDecision(candidateSingerId);

    if (!stableSingerId) {
      return {
        singerId: null,
        confidence: 0.35,
        reason: "smoothing",
        distances: {
          singer1: distance1,
          singer2: distance2
        }
      };
    }

    return {
      singerId: stableSingerId,
      confidence: Math.min(1, Math.max(0, relativeMargin * 3)),
      reason: "mfcc-profile",
      distances: {
        singer1: distance1,
        singer2: distance2
      }
    };
  }

  isSpeechLike({ active, rms, mfcc, crestFactor = 0, zeroCrossingRate = 0 }) {
    const minRms = CONFIG.audio.minRmsForVoice;
    const maxCrestFactor = CONFIG.audio.maxCrestFactor || 18;
    const minZcr = CONFIG.audio.minZeroCrossingRate ?? 0.01;
    const maxZcr = CONFIG.audio.maxZeroCrossingRate ?? 0.38;

    if (!active) {
      return {
        ok: false,
        reason: "not-active"
      };
    }

    if (!rms || rms < minRms) {
      return {
        ok: false,
        reason: "low-rms"
      };
    }

    if (crestFactor > 0 && crestFactor > maxCrestFactor) {
      return {
        ok: false,
        reason: "impulse-noise"
      };
    }

    if (
      zeroCrossingRate > 0 &&
      (zeroCrossingRate < minZcr || zeroCrossingRate > maxZcr)
    ) {
      return {
        ok: false,
        reason: "zcr-noise"
      };
    }

    if (!Array.isArray(mfcc) || !mfcc.length) {
      return {
        ok: false,
        reason: "no-mfcc"
      };
    }

    if (mfcc.some((value) => !Number.isFinite(value))) {
      return {
        ok: false,
        reason: "invalid-mfcc"
      };
    }

    return {
      ok: true,
      reason: "speech-like"
    };
  }

  updateDecision(candidateSingerId) {
    const smoothingFrames = CONFIG.mfcc?.smoothingFrames ?? 4;

    if (this.decision.pendingSingerId === candidateSingerId) {
      this.decision.count += 1;
    } else {
      this.decision.pendingSingerId = candidateSingerId;
      this.decision.count = 1;
    }

    if (this.decision.count >= smoothingFrames) {
      this.decision.stableSingerId = candidateSingerId;
    }

    return this.decision.stableSingerId;
  }

  resetDecision() {
    this.decision.pendingSingerId = null;
    this.decision.count = 0;
    this.decision.stableSingerId = null;
  }

  calculateMfccDistance(profile, mfcc) {
    if (!profile || !Array.isArray(profile.mfccMean)) {
      return Number.POSITIVE_INFINITY;
    }

    const mean = profile.mfccMean;
    const std = profile.mfccStd || [];
    const stdFloor = CONFIG.mfcc?.stdFloor ?? 3.5;

    const c0Weight = CONFIG.mfcc?.c0Weight ?? 0.35;
    const defaultWeight = 1;

    const length = Math.min(mean.length, mfcc.length);
    let weightedSum = 0;
    let weightTotal = 0;

    for (let i = 0; i < length; i += 1) {
      const weight = i === 0 ? c0Weight : defaultWeight;
      const denominator = Math.max(std[i] || stdFloor, stdFloor);
      const diff = (mfcc[i] - mean[i]) / denominator;

      weightedSum += weight * diff * diff;
      weightTotal += weight;
    }

    if (weightTotal <= 0) {
      return Number.POSITIVE_INFINITY;
    }

    return Math.sqrt(weightedSum / weightTotal);
  }

  createProfile(samples) {
    const mfccSamples = samples.map((sample) => sample.mfcc);
    const rmsValues = samples.map((sample) => sample.rms);

    return {
      type: "mfcc-profile",
      mfccMean: this.meanVector(mfccSamples),
      mfccStd: this.stdVector(mfccSamples),
      rmsMean: this.mean(rmsValues),
      rmsMin: Math.min(...rmsValues),
      rmsMax: Math.max(...rmsValues),
      sampleCount: samples.length,
      createdAt: new Date().toISOString()
    };
  }

  meanVector(vectors) {
    if (!vectors.length) {
      return [];
    }

    const length = vectors[0].length;
    const result = new Array(length).fill(0);

    vectors.forEach((vector) => {
      for (let i = 0; i < length; i += 1) {
        result[i] += vector[i];
      }
    });

    return result.map((value) => value / vectors.length);
  }

  stdVector(vectors) {
    if (vectors.length < 2) {
      return vectors[0]?.map(() => 1) || [];
    }

    const mean = this.meanVector(vectors);
    const length = mean.length;
    const variance = new Array(length).fill(0);

    vectors.forEach((vector) => {
      for (let i = 0; i < length; i += 1) {
        variance[i] += (vector[i] - mean[i]) ** 2;
      }
    });

    return variance.map((value) => Math.sqrt(value / vectors.length));
  }

  mean(values) {
    if (!values.length) {
      return 0;
    }

    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  getCalibrationTargetSamples() {
    return CONFIG.mfcc?.calibrationTargetSamples || CONFIG.audio.calibrationTargetSamples || 90;
  }

  getCalibrationProgress() {
    return Math.min(
      1,
      this.calibration.samples.length / this.getCalibrationTargetSamples()
    );
  }

  getProfiles() {
    return {
      singer1: this.profiles.singer1,
      singer2: this.profiles.singer2
    };
  }

  saveProfiles() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.profiles));
    } catch (error) {
      console.warn("[SpeakerDetector] Không lưu được MFCC speaker profiles:", error);
    }
  }

  loadProfiles() {
    try {
      const raw = localStorage.getItem(this.storageKey);

      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw);

      this.profiles.singer1 = parsed.singer1 || null;
      this.profiles.singer2 = parsed.singer2 || null;
    } catch (error) {
      console.warn("[SpeakerDetector] Không đọc được MFCC speaker profiles:", error);
    }
  }

  clearProfiles() {
    this.profiles.singer1 = null;
    this.profiles.singer2 = null;

    this.cancelCalibration();
    this.resetDecision();

    localStorage.removeItem(this.storageKey);

    // Xóa cả profile cũ nếu trước đó bạn dùng bản pitch.
    localStorage.removeItem("karaoke3d_speaker_profiles");
  }
}

export default SpeakerDetector;
