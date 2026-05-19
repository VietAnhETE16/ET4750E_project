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
    fftSize: 2048,
    smoothingTimeConstant: 0.82,
    minRmsForVoice: 0.025,
    silenceTimeoutMs: 900,
    analysisIntervalMs: 33
  },

  stage: {
    cameraFov: 50,
    cameraNear: 0.1,
    cameraFar: 1000,
    maxPixelRatio: 1.5,

    modelPaths: {
      singer1: "./assets/models/singer1.glb",
      singer2: "./assets/models/singer2.glb"
    }
  },

  scoring: {
    pitchWeight: 0.4,
    rhythmWeight: 0.25,
    stabilityWeight: 0.2,
    energyWeight: 0.15
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