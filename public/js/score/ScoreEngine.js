import CONFIG from "../config.js";
import eventBus from "../EventBus.js";

class ScoreEngine {
  constructor() {
    this.reset();
  }

  reset() {
    this.active = false;

    this.videoId = null;
    this.title = "";

    this.startedAt = 0;
    this.endedAt = 0;

    this.frames = [];
    this.lastFrameTime = 0;
  }

  start({ videoId, title } = {}) {
    if (!videoId) {
      return;
    }

    if (this.active && this.videoId === videoId) {
      return;
    }

    this.reset();

    this.active = true;
    this.videoId = videoId;
    this.title = title || "";
    this.startedAt = performance.now();
    this.lastFrameTime = this.startedAt;

    eventBus.emit("score:started", {
      videoId: this.videoId,
      title: this.title
    });

    console.log("[ScoreEngine] Started:", this.title);
  }

  addAudioFrame(payload) {
    if (!this.active) {
      return;
    }

    const normalizedFrames = this.normalizeAudioPayload(payload);

    normalizedFrames.forEach((frame) => {
      this.frames.push(frame);
    });

    this.lastFrameTime = performance.now();
  }

  normalizeAudioPayload(payload) {
    const now = performance.now();

    if (!payload) {
      return [];
    }

    if (payload.mode === "dual-channel") {
      const singer1 = payload.singers?.singer1;
      const singer2 = payload.singers?.singer2;

      const frames = [];

      if (singer1) {
        frames.push(this.createFrameFromSinger("singer1", singer1, now));
      }

      if (singer2) {
        frames.push(this.createFrameFromSinger("singer2", singer2, now));
      }

      return frames;
    }

    return [
      {
        time: now,
        mode: payload.mode || "mixed",
        singerId: payload.singerId || null,
        active: Boolean(payload.active),
        rms: Number(payload.rms || 0),
        pitch: Number(payload.pitch || 0),
        confidence: Number(payload.confidence || 0),
        reason: payload.reason || "unknown"
      }
    ];
  }

  createFrameFromSinger(singerId, singerData, time) {
    return {
      time,
      mode: "dual-channel",
      singerId,
      active: Boolean(singerData.active),
      rms: Number(singerData.rms || 0),
      pitch: Number(singerData.pitch || 0),
      confidence: Number(singerData.confidence || 0),
      reason: singerData.reason || "dual-channel"
    };
  }

  finish() {
    if (!this.active) {
      const emptyScore = this.createEmptyScore();
      eventBus.emit("score:final", emptyScore);
      return emptyScore;
    }

    this.active = false;
    this.endedAt = performance.now();

    const result = this.calculateFinalScore();

    eventBus.emit("score:final", result);

    console.log("[ScoreEngine] Final:", result);

    return result;
  }

  cancel() {
    this.reset();
    eventBus.emit("score:cancelled");
  }

  calculateFinalScore() {
    if (!this.frames.length) {
      return this.createEmptyScore();
    }

    const totalFrames = this.frames.length;

    const voicedFrames = this.frames.filter((frame) => {
      return frame.active && frame.rms >= CONFIG.audio.minRmsForVoice;
    });

    const pitchFrames = voicedFrames.filter((frame) => {
      return (
        Number.isFinite(frame.pitch) &&
        frame.pitch >= CONFIG.audio.minPitch &&
        frame.pitch <= CONFIG.audio.maxPitch
      );
    });

    const durationMs = Math.max(
      1,
      (this.endedAt || performance.now()) - this.startedAt
    );

    const durationSeconds = durationMs / 1000;

    const voiceRatio = voicedFrames.length / totalFrames;

    const pitchValidRatio =
      voicedFrames.length > 0 ? pitchFrames.length / voicedFrames.length : 0;

    const energyScore = this.calculateEnergyScore(voicedFrames);
    const rhythmScore = this.calculateRhythmScore({
      totalFrames,
      voicedFrames,
      voiceRatio
    });

    const pitchScore = this.calculatePitchScore({
      pitchFrames,
      pitchValidRatio,
      voiceRatio
    });

    const stabilityScore = this.calculateStabilityScore({
      voicedFrames,
      pitchFrames
    });

    const weights = CONFIG.scoring;

    let finalScore =
      pitchScore * weights.pitchWeight +
      rhythmScore * weights.rhythmWeight +
      stabilityScore * weights.stabilityWeight +
      energyScore * weights.energyWeight;

    // Dễ tính hơn: nếu có hát thì đảm bảo điểm nền.
    if (voiceRatio >= CONFIG.scoring.minVoiceRatioForBaseScore) {
      finalScore = Math.max(finalScore, CONFIG.scoring.baseScoreWhenSinging);
    }

    // Cộng bonus nhẹ cho demo.
    finalScore += CONFIG.scoring.friendlyBonus || 0;

    // Chỉ phạt nặng nếu gần như không hát.
    if (voiceRatio < 0.015) {
      finalScore = Math.min(finalScore, 25);
    }

    // Nếu không bắt được pitch thì vẫn cho điểm, không ép quá thấp.
    if (pitchValidRatio < 0.05 && voiceRatio >= 0.08) {
      finalScore = Math.max(finalScore, 55);
    }

    finalScore = this.clamp(finalScore, 0, 100);

    const singerStats = this.calculateSingerStats(voicedFrames);

    return {
      videoId: this.videoId,
      title: this.title,

      finalScore,
      pitchScore,
      rhythmScore,
      energyScore,
      stabilityScore,

      detail: {
        durationSeconds,
        totalFrames,
        voicedFrames: voicedFrames.length,
        pitchFrames: pitchFrames.length,
        voiceRatio,
        pitchValidRatio,
        averageRms: this.mean(voicedFrames.map((frame) => frame.rms)),
        averagePitch: this.mean(pitchFrames.map((frame) => frame.pitch)),
        singerStats
      }
    };
  }

  calculateEnergyScore(voicedFrames) {
    if (!voicedFrames.length) {
      return 0;
    }

    const rmsValues = voicedFrames.map((frame) => frame.rms);
    const avgRms = this.mean(rmsValues);

    const minVoice = CONFIG.audio.minRmsForVoice;
    const targetRms = CONFIG.scoring.targetRms || 0.045;
    const tooLoudRms = CONFIG.scoring.tooLoudRms || 0.35;

    if (avgRms <= minVoice) {
      return 20;
    }

    let score = 45 + (avgRms / targetRms) * 55;

    // Dễ tính hơn: chỉ phạt nhẹ khi quá to.
    if (avgRms > tooLoudRms) {
      const penalty = (avgRms - tooLoudRms) * 80;
      score -= penalty;
    }

    return this.clamp(score, 0, 100);
  }

  calculateRhythmScore({ totalFrames, voicedFrames, voiceRatio }) {
    if (!totalFrames || !voicedFrames.length) {
      return 0;
    }

    const idealVoiceRatio = CONFIG.scoring.idealVoiceRatio || 0.38;

    // Dễ tính hơn: sai lệch voiceRatio bị trừ ít hơn.
    let score = 88 - Math.abs(voiceRatio - idealVoiceRatio) * 75;

    // Hát ít vẫn có điểm nếu có giọng rõ.
    if (voiceRatio < 0.12) {
      score *= 0.75 + voiceRatio / 0.12 * 0.25;
    }

    // Nếu mic luôn active, chỉ trừ nhẹ.
    if (voiceRatio > 0.94) {
      score -= 8;
    }

    const flickerPenalty = this.calculateFlickerPenalty();
    score -= flickerPenalty * 0.5;

    return this.clamp(score, 0, 100);
  }

  calculatePitchScore({ pitchFrames, pitchValidRatio, voiceRatio }) {
    if (!pitchFrames.length) {
      // Dễ tính hơn: nếu có hát nhưng không bắt pitch, vẫn cho điểm vừa phải.
      if (voiceRatio >= 0.08) {
        return 58;
      }

      return 25;
    }

    const pitchValues = pitchFrames.map((frame) => frame.pitch);
    const centsDiffs = this.calculatePitchCentsDiffs(pitchValues);

    const avgCentsDiff = this.mean(centsDiffs);

    // Dễ tính hơn: pitch dao động vẫn không bị trừ quá mạnh.
    const smoothScore = this.clamp(100 - avgCentsDiff * 0.22, 35, 100);

    // Dễ tính hơn: chỉ cần pitch hợp lệ một phần là có điểm.
    const validScore = this.clamp(45 + pitchValidRatio * 55, 0, 100);

    const score = validScore * 0.45 + smoothScore * 0.55;

    return this.clamp(score, 0, 100);
  }

  calculateStabilityScore({ voicedFrames, pitchFrames }) {
    if (!voicedFrames.length) {
      return 0;
    }

    const rmsValues = voicedFrames.map((frame) => frame.rms);
    const rmsCv = this.coefficientOfVariation(rmsValues);

    // Dễ tính hơn: RMS không cần quá đều.
    const rmsStability = this.clamp(100 - rmsCv * 70, 35, 100);

    if (pitchFrames.length < 3) {
      return this.clamp(rmsStability * 0.85, 35, 100);
    }

    const pitchValues = pitchFrames.map((frame) => frame.pitch);
    const pitchCentsDiffs = this.calculatePitchCentsDiffs(pitchValues);
    const pitchJitter = this.mean(pitchCentsDiffs);

    // Dễ tính hơn: pitch jitter bị phạt nhẹ hơn.
    const pitchStability = this.clamp(100 - pitchJitter * 0.18, 35, 100);

    const score = rmsStability * 0.55 + pitchStability * 0.45;

    return this.clamp(score, 0, 100);
  }

  calculateFlickerPenalty() {
    if (this.frames.length < 4) {
      return 0;
    }

    let transitions = 0;

    for (let i = 1; i < this.frames.length; i += 1) {
      if (this.frames[i].active !== this.frames[i - 1].active) {
        transitions += 1;
      }
    }

    const transitionRatio = transitions / this.frames.length;

    return this.clamp(transitionRatio * 45, 0, 10);
  }

  calculatePitchCentsDiffs(pitchValues) {
    const diffs = [];

    for (let i = 1; i < pitchValues.length; i += 1) {
      const previous = pitchValues[i - 1];
      const current = pitchValues[i];

      if (previous <= 0 || current <= 0) {
        continue;
      }

      const cents = Math.abs(1200 * Math.log2(current / previous));

      if (Number.isFinite(cents)) {
        diffs.push(cents);
      }
    }

    return diffs;
  }

  calculateSingerStats(voicedFrames) {
    const stats = {
      singer1: {
        frames: 0,
        averageRms: 0,
        averagePitch: 0
      },
      singer2: {
        frames: 0,
        averageRms: 0,
        averagePitch: 0
      },
      unknown: {
        frames: 0,
        averageRms: 0,
        averagePitch: 0
      }
    };

    ["singer1", "singer2", "unknown"].forEach((key) => {
      const frames = voicedFrames.filter((frame) => {
        const singerId = frame.singerId || "unknown";
        return singerId === key;
      });

      stats[key].frames = frames.length;
      stats[key].averageRms = this.mean(frames.map((frame) => frame.rms));

      const pitchFrames = frames.filter((frame) => frame.pitch > 0);

      stats[key].averagePitch = this.mean(
        pitchFrames.map((frame) => frame.pitch)
      );
    });

    return stats;
  }

  createEmptyScore() {
    return {
      videoId: this.videoId,
      title: this.title,

      finalScore: 0,
      pitchScore: 0,
      rhythmScore: 0,
      energyScore: 0,
      stabilityScore: 0,

      detail: {
        durationSeconds: 0,
        totalFrames: 0,
        voicedFrames: 0,
        pitchFrames: 0,
        voiceRatio: 0,
        pitchValidRatio: 0,
        averageRms: 0,
        averagePitch: 0,
        singerStats: {}
      }
    };
  }

  mean(values) {
    const cleanValues = values.filter((value) => {
      return Number.isFinite(value);
    });

    if (!cleanValues.length) {
      return 0;
    }

    return cleanValues.reduce((sum, value) => sum + value, 0) / cleanValues.length;
  }

  standardDeviation(values) {
    const cleanValues = values.filter((value) => {
      return Number.isFinite(value);
    });

    if (cleanValues.length < 2) {
      return 0;
    }

    const avg = this.mean(cleanValues);

    const variance =
      cleanValues.reduce((sum, value) => {
        return sum + (value - avg) ** 2;
      }, 0) / cleanValues.length;

    return Math.sqrt(variance);
  }

  coefficientOfVariation(values) {
    const avg = this.mean(values);

    if (avg <= 0) {
      return 0;
    }

    return this.standardDeviation(values) / avg;
  }

  clamp(value, min, max) {
    return Math.min(max, Math.max(min, Number(value) || 0));
  }
}

export default ScoreEngine;