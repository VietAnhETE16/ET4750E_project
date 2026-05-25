import CONFIG from "../config.js";

class SpeakerDetector {
  constructor() {
    this.storageKey = "karaoke3d_speaker_profiles";

    this.profiles = {
      singer1: null,
      singer2: null
    };

    this.calibration = {
      active: false,
      singerId: null,
      samples: []
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
  }

  cancelCalibration() {
    this.calibration.active = false;
    this.calibration.singerId = null;
    this.calibration.samples = [];
  }

  processSample({ active, rms, pitch }) {
    if (!this.calibration.active) {
      return {
        calibrationActive: false,
        completed: false,
        progress: 0
      };
    }

    if (!active || !pitch || pitch <= 0 || rms < CONFIG.audio.minRmsForVoice) {
      return {
        calibrationActive: true,
        completed: false,
        singerId: this.calibration.singerId,
        progress: this.getCalibrationProgress()
      };
    }

    this.calibration.samples.push({
      pitch,
      rms
    });

    const progress = this.getCalibrationProgress();

    if (this.calibration.samples.length >= CONFIG.audio.calibrationTargetSamples) {
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
        progress: 1
      };
    }

    return {
      calibrationActive: true,
      completed: false,
      singerId: this.calibration.singerId,
      progress
    };
  }

  classify({ active, rms, pitch }) {
    if (!active || !pitch || pitch <= 0) {
      return {
        singerId: null,
        confidence: 0,
        reason: "no-voice"
      };
    }

    const hasSinger1 = Boolean(this.profiles.singer1);
    const hasSinger2 = Boolean(this.profiles.singer2);

    if (hasSinger1 && hasSinger2) {
      return this.classifyByProfiles({ rms, pitch });
    }

    return this.classifyFallback({ rms, pitch });
  }

  classifyByProfiles({ rms, pitch }) {
    const d1 = this.calculateDistance(this.profiles.singer1, { rms, pitch });
    const d2 = this.calculateDistance(this.profiles.singer2, { rms, pitch });

    const singerId = d1 <= d2 ? "singer1" : "singer2";
    const best = Math.min(d1, d2);
    const worst = Math.max(d1, d2);

    const confidence = worst === 0 ? 1 : Math.min(1, Math.max(0, 1 - best / (worst + 0.0001)));

    return {
      singerId,
      confidence,
      reason: "profile",
      distances: {
        singer1: d1,
        singer2: d2
      }
    };
  }

  classifyFallback({ rms, pitch }) {
    const singerId = pitch < 260 ? "singer1" : "singer2";

    return {
      singerId,
      confidence: 0.45,
      reason: "fallback-pitch"
    };
  }

  calculateDistance(profile, sample) {
    if (!profile) {
      return Number.POSITIVE_INFINITY;
    }

    const pitchDistance = Math.abs(
      Math.log((sample.pitch + 1) / (profile.pitchMean + 1))
    );

    const rmsDistance = Math.abs(sample.rms - profile.rmsMean);

    return pitchDistance * 2.2 + rmsDistance * 3.5;
  }

  createProfile(samples) {
    const pitches = samples.map((sample) => sample.pitch);
    const rmsValues = samples.map((sample) => sample.rms);

    return {
      pitchMean: this.mean(pitches),
      pitchMin: Math.min(...pitches),
      pitchMax: Math.max(...pitches),

      rmsMean: this.mean(rmsValues),
      rmsMin: Math.min(...rmsValues),
      rmsMax: Math.max(...rmsValues),

      sampleCount: samples.length,
      createdAt: new Date().toISOString()
    };
  }

  mean(values) {
    if (!values.length) {
      return 0;
    }

    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  getCalibrationProgress() {
    return Math.min(
      1,
      this.calibration.samples.length / CONFIG.audio.calibrationTargetSamples
    );
  }

  hasProfiles() {
    return Boolean(this.profiles.singer1 && this.profiles.singer2);
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
      console.warn("[SpeakerDetector] Không lưu được speaker profiles:", error);
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
      console.warn("[SpeakerDetector] Không đọc được speaker profiles:", error);
    }
  }

  clearProfiles() {
    this.profiles.singer1 = null;
    this.profiles.singer2 = null;

    localStorage.removeItem(this.storageKey);
  }
}

export default SpeakerDetector;