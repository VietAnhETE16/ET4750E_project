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

  fftSize: 2048,
  smoothingTimeConstant: 0.82,

  minRmsForVoice: 0.025, // độ nhạy, tăng nếu mic quá kém, giảm nếu mic quá nhạy
  silenceTimeoutMs: 700,

  analysisIntervalMs: 33,

  minPitch: 80,
  maxPitch: 1000,

  calibrationTargetSamples: 90
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
        position: { x: -1.25, y: 0, z: 0.65 },
        rotation: { x: 0, y: 0.25, z: 0 },
        scale: { x: 1, y: 1, z: 1 }
      },

      singer2: {
        position: { x: 1.25, y: 0, z: 0.65 },
        rotation: { x: 0, y: -0.25, z: 0 },
        scale: { x: 1, y: 1, z: 1 }
      }
    }
  },

  scoring: {
    pitchWeight: 0.4,
    rhythmWeight: 0.25,
    stabilityWeight: 0.2,
    energyWeight: 0.15,

    // RMS mục tiêu để xem giọng đủ rõ.
    targetRms: 0.08,

    // Nếu RMS vượt mức này nhiều thì có thể là hú/noise/clipping.
    tooLoudRms: 0.22,

    // Tỉ lệ thời gian có giọng hát lý tưởng.
    // Vì có nhạc dạo, nghỉ câu, đoạn chuyển nên không nên là 100%.
    idealVoiceRatio: 0.55
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