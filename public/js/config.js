const CONFIG = {
  appName: "Hệ thống Karaoke 3D trực tuyến",

  youtube: {
    maxResults: 8,
    regionCode: "VN",
    relevanceLanguage: "vi",

    playerVars: {
      autoplay: 1,
      controls: 1,
      rel: 0,
      modestbranding: 1,
      playsinline: 1
    }
  },

  audio: {
    preferredInputKeyword: "K300",
    mode: "mixed",

    fftSize: 4096,
    smoothingTimeConstant: 0.72,

    minRmsForVoice: 0.014,
    softwareGain: 1.5,

    silenceTimeoutMs: 850,
    analysisIntervalMs: 33,

    minPitch: 70,
    maxPitch: 900,

    pitchMinRms: 0.007,
    pitchConfidenceThreshold: 0.22,

    voiceStartFrames: 3,
    maxCrestFactor: 18,
    minZeroCrossingRate: 0.01,
    maxZeroCrossingRate: 0.38,

    calibrationTargetSamples: 90
  },

  mfcc: {
    enabled: true,

    coefficientCount: 13,
    filterCount: 26,
    fftSize: 2048,
    minFreq: 80,
    maxFreq: 7600,
    preEmphasis: 0.97,

    calibrationTargetSamples: 100,
    sampleEveryMs: 80,

    c0Weight: 0.35,
    stdFloor: 3.5,
    decisionMargin: 0.08,
    smoothingFrames: 4,
    maxDistance: 9.5
  },

  stage: {
    cameraFov: 45,
    cameraNear: 0.1,
    cameraFar: 1000,

    maxPixelRatio: 1,

    modelPaths: {
      stage: "./assets/models/stage.glb",
      singer1: "./assets/models/singer1.glb",
      singer2: "./assets/models/singer2.glb"
    },

    transforms: {
      stage: {
        position: { x: 0, y: -4.75, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 }
      },

      singer1: {
        position: { x: -3, y: -1.5, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 0.5, y: 0.5, z: 0.5 }
      },

      singer2: {
        position: { x: 3, y: -1.5, z: 0 },
        rotation: { x: 0, y: -0.25, z: 0 },
        scale: { x: 0.5, y: 0.5, z: 0.5 }
      }
    }
  },

  scoring: {
    // Dễ tính hơn: giảm trọng số pitch, tăng energy
    pitchWeight: 0.22,
    rhythmWeight: 0.23,
    stabilityWeight: 0.2,
    energyWeight: 0.35,

    // Mic thường nhỏ, nên hạ target RMS
    targetRms: 0.045,

    // Cho phép mic lớn hơn mới bị xem là quá to
    tooLoudRms: 0.35,

    // Karaoke có nhạc dạo/nghỉ câu, nên voiceRatio lý tưởng thấp hơn
    idealVoiceRatio: 0.38,

    // Điểm cộng thân thiện cho demo
    friendlyBonus: 8,

    // Chỉ cần hát một ít là có điểm nền
    minVoiceRatioForBaseScore: 0.04,

    // Điểm nền khi có hát
    baseScoreWhenSinging: 70
  },

  ui: {
    toastDurationMs: 2600,
    searchDebounceMs: 450,
    suggestionDebounceMs: 250
  },

  queue: {
    autoPlayNext: true,
    autoNextDelayMs: 3500
  },

  sfx: {
    enabled: true,
    volume: 0.35
  }
};

export default CONFIG;