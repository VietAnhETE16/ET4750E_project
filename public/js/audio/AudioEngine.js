import CONFIG from "../config.js";
import eventBus from "../EventBus.js";

import VoiceActivityDetector from "./VoiceActivityDetector.js";
import PitchDetector from "./PitchDetector.js";
import SpeakerDetector from "./SpeakerDetector.js";

class AudioEngine {
  constructor() {
    this.audioContext = null;
    this.mediaStream = null;
    this.sourceNode = null;
    this.analyserNode = null;

    this.timeDomainData = null;

    this.vad = new VoiceActivityDetector();
    this.pitchDetector = new PitchDetector();
    this.speakerDetector = new SpeakerDetector();

    this.analysisTimer = null;

    this.enabled = false;
    this.currentDeviceLabel = "Microphone mặc định";
    this.lastSingerId = null;
  }

  async start() {
    if (this.enabled) {
      return;
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;

    if (!AudioContextClass) {
      throw new Error("Trình duyệt không hỗ trợ Web Audio API.");
    }

    this.audioContext = new AudioContextClass();

    await this.startStreamWithPreferredDevice();

    this.createAudioGraph();

    this.enabled = true;

    this.startAnalysisLoop();

    eventBus.emit("mic:status", {
      enabled: true,
      message: "Mic đang bật",
      detail: `Thiết bị: ${this.currentDeviceLabel}`
    });
  }

  async stop() {
    this.enabled = false;

    if (this.analysisTimer) {
      window.clearInterval(this.analysisTimer);
      this.analysisTimer = null;
    }

    this.vad.reset();

    this.emitSingerInactive("singer1");
    this.emitSingerInactive("singer2");

    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch {
        // ignore
      }

      this.sourceNode = null;
    }

    if (this.analyserNode) {
      try {
        this.analyserNode.disconnect();
      } catch {
        // ignore
      }

      this.analyserNode = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => {
        track.stop();
      });

      this.mediaStream = null;
    }

    if (this.audioContext) {
      await this.audioContext.close();
      this.audioContext = null;
    }

    eventBus.emit("mic:status", {
      enabled: false,
      message: "Mic đã tắt",
      detail: "Nhấn Bật Mic để cấp quyền micro."
    });
  }

  async toggle() {
    if (this.enabled) {
      await this.stop();
    } else {
      await this.start();
    }
  }

  async startStreamWithPreferredDevice() {
    this.mediaStream = await this.requestDefaultStream();

    const preferredDevice = await this.findPreferredInputDevice();

    if (!preferredDevice) {
      this.currentDeviceLabel = this.getCurrentTrackLabel();
      return;
    }

    const currentLabel = this.getCurrentTrackLabel();

    if (currentLabel.includes(preferredDevice.label)) {
      this.currentDeviceLabel = currentLabel;
      return;
    }

    this.mediaStream.getTracks().forEach((track) => {
      track.stop();
    });

    this.mediaStream = await this.requestStreamByDeviceId(preferredDevice.deviceId);
    this.currentDeviceLabel = preferredDevice.label;
  }

  async requestDefaultStream() {
    return navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      },
      video: false
    });
  }

  async requestStreamByDeviceId(deviceId) {
    return navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: {
          exact: deviceId
        },
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      },
      video: false
    });
  }

  async findPreferredInputDevice() {
    if (!navigator.mediaDevices?.enumerateDevices) {
      return null;
    }

    const devices = await navigator.mediaDevices.enumerateDevices();

    const inputDevices = devices.filter((device) => {
      return device.kind === "audioinput";
    });

    const keyword = String(CONFIG.audio.preferredInputKeyword || "").toLowerCase();

    if (!keyword) {
      return inputDevices[0] || null;
    }

    const preferred = inputDevices.find((device) => {
      return String(device.label || "").toLowerCase().includes(keyword);
    });

    return preferred || inputDevices[0] || null;
  }

  getCurrentTrackLabel() {
    const track = this.mediaStream?.getAudioTracks?.()[0];

    return track?.label || "Microphone mặc định";
  }

  createAudioGraph() {
    this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);

    this.analyserNode = this.audioContext.createAnalyser();
    this.analyserNode.fftSize = CONFIG.audio.fftSize;
    this.analyserNode.smoothingTimeConstant = CONFIG.audio.smoothingTimeConstant;

    this.timeDomainData = new Float32Array(this.analyserNode.fftSize);

    this.sourceNode.connect(this.analyserNode);
  }

  startAnalysisLoop() {
    if (this.analysisTimer) {
      window.clearInterval(this.analysisTimer);
    }

    this.analysisTimer = window.setInterval(() => {
      this.analyseFrame();
    }, CONFIG.audio.analysisIntervalMs);
  }

  analyseFrame() {
    if (!this.enabled || !this.analyserNode || !this.audioContext) {
      return;
    }

    this.analyserNode.getFloatTimeDomainData(this.timeDomainData);

    const rms = this.calculateRms(this.timeDomainData);
    const active = this.vad.update(rms);
    const pitch = this.pitchDetector.detectPitch(
      this.timeDomainData,
      this.audioContext.sampleRate
    );

    const calibrationResult = this.speakerDetector.processSample({
      active,
      rms,
      pitch
    });

    this.emitCalibrationEvents(calibrationResult);

    const speaker = this.speakerDetector.classify({
      active,
      rms,
      pitch
    });

    this.emitAudioData({
      active,
      rms,
      pitch,
      speaker
    });

    this.emitSingerEvents({
      active,
      rms,
      pitch,
      speaker
    });
  }

  calculateRms(buffer) {
    let sum = 0;

    for (let i = 0; i < buffer.length; i += 1) {
      sum += buffer[i] * buffer[i];
    }

    return Math.sqrt(sum / buffer.length);
  }

  emitAudioData({ active, rms, pitch, speaker }) {
    eventBus.emit("audio:data", {
      active,
      rms,
      pitch,
      singerId: speaker.singerId,
      confidence: speaker.confidence,
      reason: speaker.reason
    });
  }

  emitSingerEvents({ active, rms, pitch, speaker }) {
    if (!active || !speaker.singerId) {
      this.emitSingerInactive("singer1");
      this.emitSingerInactive("singer2");
      this.lastSingerId = null;
      return;
    }

    const activeSingerId = speaker.singerId;
    const inactiveSingerId = activeSingerId === "singer1" ? "singer2" : "singer1";

    eventBus.emit("singer:active", {
      singerId: activeSingerId,
      active: true,
      rms,
      pitch,
      confidence: speaker.confidence,
      reason: speaker.reason
    });

    this.emitSingerInactive(inactiveSingerId);

    this.lastSingerId = activeSingerId;
  }

  emitSingerInactive(singerId) {
    eventBus.emit("singer:active", {
      singerId,
      active: false,
      rms: 0,
      pitch: 0,
      confidence: 0
    });
  }

  emitCalibrationEvents(result) {
    if (!result) {
      return;
    }

    if (result.calibrationActive) {
      eventBus.emit("audio:calibration-progress", {
        singerId: result.singerId,
        progress: result.progress
      });
    }

    if (result.completed) {
      eventBus.emit("audio:calibration-complete", {
        singerId: result.singerId,
        profile: result.profile
      });
    }
  }

  startCalibration(singerId) {
    if (!this.enabled) {
      eventBus.emit("app:toast", {
        message: "Bạn cần bật Mic trước khi calibration.",
        type: "warning"
      });

      return;
    }

    this.speakerDetector.startCalibration(singerId);

    eventBus.emit("audio:calibration-start", {
      singerId
    });
  }

  clearSpeakerProfiles() {
    this.speakerDetector.clearProfiles();

    eventBus.emit("app:toast", {
      message: "Đã xóa dữ liệu calibration giọng.",
      type: "info"
    });
  }
}

export default AudioEngine;