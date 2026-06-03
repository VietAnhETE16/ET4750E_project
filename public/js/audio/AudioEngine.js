import CONFIG from "../config.js";
import eventBus from "../EventBus.js";

import VoiceActivityDetector from "./VoiceActivityDetector.js";
import PitchDetector from "./PitchDetector.js";
import SpeakerDetector from "./SpeakerDetector.js";
import MFCCExtractor from "./MFCCExtractor.js";

class AudioEngine {
  constructor() {
    this.audioContext = null;
    this.mediaStream = null;
    this.sourceNode = null;
    this.analyserNode = null;

    this.timeDomainData = null;
    this.processedTimeDomainData = null;

    this.vad = new VoiceActivityDetector();
    this.pitchDetector = new PitchDetector();
    this.mfccExtractor = new MFCCExtractor();
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
      detail: `Thiết bị: ${this.currentDeviceLabel} | Nhận diện: MFCC Profile`
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
    this.processedTimeDomainData = new Float32Array(this.analyserNode.fftSize);

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

    this.applySoftwareGain(
      this.timeDomainData,
      this.processedTimeDomainData
    );

    const buffer = this.processedTimeDomainData;

    const rms = this.calculateRms(buffer);
    const crestFactor = this.calculateCrestFactor(buffer, rms);
    const zeroCrossingRate = this.calculateZeroCrossingRate(buffer);

    const active = this.vad.update({
      rms,
      crestFactor,
      zeroCrossingRate
    });

    // Pitch vẫn được tính để chấm điểm/debug,
    // nhưng KHÔNG được truyền vào SpeakerDetector để phân biệt người hát.
    const pitch = this.pitchDetector.detectPitch(
      buffer,
      this.audioContext.sampleRate
    );

    const pitchConfidence = this.pitchDetector.lastConfidence || 0;

    const mfcc = this.shouldExtractMfcc({
      active,
      rms,
      crestFactor,
      zeroCrossingRate
    })
      ? this.mfccExtractor.extract(buffer, this.audioContext.sampleRate)
      : null;

    const calibrationResult = this.speakerDetector.processSample({
      active,
      rms,
      mfcc,
      crestFactor,
      zeroCrossingRate
    });

    this.emitCalibrationEvents(calibrationResult);

    if (this.speakerDetector.isCalibrating()) {
      this.handleCalibrationFrame({
        active,
        rms,
        pitch,
        pitchConfidence,
        crestFactor,
        zeroCrossingRate,
        mfcc,
        calibrationResult
      });

      return;
    }

    const speaker = this.speakerDetector.classify({
      active,
      rms,
      mfcc,
      crestFactor,
      zeroCrossingRate
    });

    eventBus.emit("audio:data", {
      mode: "mfcc",
      active,
      rms,
      pitch,
      pitchConfidence,
      crestFactor,
      zeroCrossingRate,
      mfccReady: Boolean(mfcc),
      singerId: speaker.singerId,
      confidence: speaker.confidence,
      reason: speaker.reason,
      distances: speaker.distances || null
    });

    if (
      !speaker.singerId ||
      ["not-enough-profiles", "no-voice", "no-mfcc", "low-rms", "impulse-noise", "zcr-noise", "too-far-from-profiles"].includes(speaker.reason)
    ) {
      this.emitSingerInactive("singer1");
      this.emitSingerInactive("singer2");
      return;
    }

    this.emitSingerEvents({
      active,
      rms,
      pitch,
      speaker
    });
  }

  shouldExtractMfcc({ active, rms, crestFactor, zeroCrossingRate }) {
    const minRms = CONFIG.audio.minRmsForVoice;
    const maxCrestFactor = CONFIG.audio.maxCrestFactor || 18;
    const minZcr = CONFIG.audio.minZeroCrossingRate ?? 0.01;
    const maxZcr = CONFIG.audio.maxZeroCrossingRate ?? 0.38;

    if (!active) {
      return false;
    }

    if (rms < minRms) {
      return false;
    }

    if (crestFactor > 0 && crestFactor > maxCrestFactor) {
      return false;
    }

    if (
      zeroCrossingRate > 0 &&
      (zeroCrossingRate < minZcr || zeroCrossingRate > maxZcr)
    ) {
      return false;
    }

    return true;
  }

  handleCalibrationFrame({
    active,
    rms,
    pitch,
    pitchConfidence,
    crestFactor,
    zeroCrossingRate,
    mfcc,
    calibrationResult
  }) {
    const calibratingSingerId = this.speakerDetector.getCalibrationSingerId();

    const otherSingerId =
      calibratingSingerId === "singer1" ? "singer2" : "singer1";

    const acceptedSpeech =
      calibrationResult?.accepted === true ||
      calibrationResult?.reason === "accepted" ||
      calibrationResult?.reason === "completed";

    if (acceptedSpeech && calibratingSingerId) {
      eventBus.emit("singer:active", {
        singerId: calibratingSingerId,
        active: true,
        rms,
        pitch,
        confidence: 1,
        reason: "calibration"
      });

      this.emitSingerInactive(otherSingerId);
    } else {
      this.emitSingerInactive("singer1");
      this.emitSingerInactive("singer2");
    }

    eventBus.emit("audio:data", {
      mode: "mfcc-calibration",
      active,
      rms,
      pitch,
      pitchConfidence,
      crestFactor,
      zeroCrossingRate,
      mfccReady: Boolean(mfcc),
      singerId: calibratingSingerId,
      confidence: acceptedSpeech ? 1 : 0,
      accepted: acceptedSpeech,
      reason: calibrationResult?.reason || "not-speech-like"
    });
  }

  applySoftwareGain(input, output) {
    const gain = CONFIG.audio.softwareGain || 1;

    for (let i = 0; i < input.length; i += 1) {
      const value = input[i] * gain;

      output[i] = Math.max(-1, Math.min(1, value));
    }
  }

  calculateRms(buffer) {
    let sum = 0;

    for (let i = 0; i < buffer.length; i += 1) {
      sum += buffer[i] * buffer[i];
    }

    return Math.sqrt(sum / buffer.length);
  }

  calculateCrestFactor(buffer, rms) {
    if (!buffer || !buffer.length || !rms || rms <= 0) {
      return 0;
    }

    let peak = 0;

    for (let i = 0; i < buffer.length; i += 1) {
      const abs = Math.abs(buffer[i]);

      if (abs > peak) {
        peak = abs;
      }
    }

    return peak / rms;
  }

  calculateZeroCrossingRate(buffer) {
    if (!buffer || buffer.length < 2) {
      return 0;
    }

    let crossings = 0;

    for (let i = 1; i < buffer.length; i += 1) {
      const previous = buffer[i - 1];
      const current = buffer[i];

      if (
        (previous >= 0 && current < 0) ||
        (previous < 0 && current >= 0)
      ) {
        crossings += 1;
      }
    }

    return crossings / buffer.length;
  }

  emitSingerEvents({ active, rms, pitch, speaker }) {
    if (!active || !speaker.singerId) {
      this.emitSingerInactive("singer1");
      this.emitSingerInactive("singer2");
      this.lastSingerId = null;
      return;
    }

    const activeSingerId = speaker.singerId;

    const inactiveSingerId =
      activeSingerId === "singer1" ? "singer2" : "singer1";

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

    eventBus.emit("app:toast", {
      message: `Bắt đầu calib ${this.getSingerLabel(singerId)} bằng MFCC. Hãy nói/hát rõ vào mic.`,
      type: "info"
    });
  }

  clearSpeakerProfiles() {
    this.speakerDetector.clearProfiles();

    eventBus.emit("app:toast", {
      message: "Đã xóa dữ liệu calibration MFCC.",
      type: "info"
    });
  }

  getSingerLabel(singerId) {
    if (singerId === "singer1") {
      return "Ca sĩ 1";
    }

    if (singerId === "singer2") {
      return "Ca sĩ 2";
    }

    return "Ca sĩ";
  }
}

export default AudioEngine;
