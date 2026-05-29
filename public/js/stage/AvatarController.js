import * as THREE from "three";

class AvatarController {
  constructor(options) {
    this.id = options.id;

    // Group cha nhận position / rotation / scale từ config.js
    this.root = options.root;

    // Model .glb thật dùng cho AnimationMixer
    this.animationRoot = options.animationRoot || this.root;

    this.animations = options.animations || [];

    this.basePosition = this.root.position.clone();
    this.baseRotation = this.root.rotation.clone();
    this.baseScale = this.root.scale.clone();

    // Lưu transform gốc của animationRoot để chống root motion kéo model lệch
    this.animationRootBasePosition = this.animationRoot.position.clone();
    this.animationRootBaseRotation = this.animationRoot.rotation.clone();
    this.animationRootBaseScale = this.animationRoot.scale.clone();

    this.mixer = null;
    this.actions = new Map();
    this.singingAction = null;

    this.isSingingAnimationPlaying = false;
    this.stopSingingTimer = null;
    this.stopSingingDelayMs = 500;

    this.voice = {
      active: false,
      rms: 0,
      pitch: 0,
      energy: 0,
      targetEnergy: 0
    };

    this.time = 0;

    this.initAnimations();
  }

  initAnimations() {
    if (!this.animations.length) {
      console.warn(`[AvatarController] ${this.id} không có animation.`);
      return;
    }

    this.mixer = new THREE.AnimationMixer(this.animationRoot);

    this.animations.forEach((clip) => {
      const action = this.mixer.clipAction(clip);

      action.enabled = true;
      action.setEffectiveWeight(1);
      action.setEffectiveTimeScale(1);

      // Không tự chạy animation khi load
      action.stop();
      action.paused = true;

      this.actions.set(clip.name, action);

      console.log(`[AvatarController] ${this.id} animation:`, clip.name);
    });

    this.singingAction =
      this.findAnimationAction("singing") ||
      this.actions.values().next().value ||
      null;

    if (!this.singingAction) {
      console.warn(
        `[AvatarController] ${this.id} không tìm thấy animation "singing" và không có animation fallback.`
      );
    }
  }

  findAnimationAction(targetName) {
    const normalizedTarget = targetName.toLowerCase();

    for (const [clipName, action] of this.actions.entries()) {
      const normalizedClipName = clipName.toLowerCase();

      if (normalizedClipName === normalizedTarget) {
        return action;
      }
    }

    for (const [clipName, action] of this.actions.entries()) {
      const normalizedClipName = clipName.toLowerCase();

      if (normalizedClipName.includes(normalizedTarget)) {
        return action;
      }
    }

    return null;
  }

  setVoiceData({ active = false, rms = 0, pitch = 0 } = {}) {
    const wasActive = this.voice.active;

    this.voice.active = Boolean(active);
    this.voice.rms = Number(rms) || 0;
    this.voice.pitch = Number(pitch) || 0;

    const normalizedEnergy = Math.min(1, Math.max(0, this.voice.rms * 8));
    this.voice.targetEnergy = this.voice.active ? normalizedEnergy : 0;

    if (!wasActive && this.voice.active) {
      this.playSingingAnimation();
    }

    if (wasActive && !this.voice.active) {
      this.stopSingingAnimation();
    }
  }

  playSingingAnimation() {
    // Nếu đang chờ dừng animation mà người hát lại tiếp tục hát
    // thì hủy việc dừng animation.
    if (this.stopSingingTimer) {
      window.clearTimeout(this.stopSingingTimer);
      this.stopSingingTimer = null;
    }

    if (!this.singingAction) {
      return;
    }

    if (this.isSingingAnimationPlaying) {
      this.singingAction.paused = false;
      return;
    }

    this.singingAction.reset();
    this.singingAction.paused = false;
    this.singingAction.enabled = true;
    this.singingAction.setLoop(THREE.LoopRepeat);
    this.singingAction.setEffectiveWeight(1);
    this.singingAction.setEffectiveTimeScale(1);
    this.singingAction.fadeIn(0.15);
    this.singingAction.play();

    this.isSingingAnimationPlaying = true;

    console.log(`[AvatarController] ${this.id} play singing animation`);
  }

  stopSingingAnimation() {
    if (!this.singingAction || !this.isSingingAnimationPlaying) {
      return;
    }

    // Nếu đã có timer dừng rồi thì không tạo thêm timer mới
    if (this.stopSingingTimer) {
      return;
    }

    console.log(
      `[AvatarController] ${this.id} will stop singing animation after 1s`
    );

    // Giữ animation chạy thêm 1 giây sau khi ngừng hát
    this.stopSingingTimer = window.setTimeout(() => {
      this.stopSingingTimer = null;

      // Nếu trong 1 giây đó người hát lại, không dừng animation nữa
      if (this.voice.active) {
        return;
      }

      this.singingAction.fadeOut(0.2);

      window.setTimeout(() => {
        if (!this.voice.active && this.singingAction) {
          this.singingAction.stop();
          this.singingAction.paused = true;

          this.restoreAnimationRootTransform();
          this.isSingingAnimationPlaying = false;

          console.log(`[AvatarController] ${this.id} stop singing animation`);
        }
      }, 230);
    }, this.stopSingingDelayMs);
  }

  update(delta) {
    this.time += delta;

    if (this.mixer && this.isSingingAnimationPlaying) {
      // Khi vừa ngừng hát, energy giảm dần nhưng animation vẫn chạy thêm 1s
      const speed = this.voice.active
        ? 0.85 + this.voice.energy * 0.75
        : 0.75;

      this.mixer.update(delta * speed);

      this.restoreAnimationRootTransform();
    }

    this.voice.energy = THREE.MathUtils.lerp(
      this.voice.energy,
      this.voice.targetEnergy,
      0.16
    );

    this.updateVoiceMotion();
  }

  restoreAnimationRootTransform() {
    this.animationRoot.position.copy(this.animationRootBasePosition);
    this.animationRoot.rotation.copy(this.animationRootBaseRotation);
    this.animationRoot.scale.copy(this.animationRootBaseScale);
  }

  updateVoiceMotion() {
    const idleBob = Math.sin(this.time * 2.1) * 0.018;
    const singBob = Math.sin(this.time * 8.5) * 0.06 * this.voice.energy;

    const scaleBoost = 1 + this.voice.energy * 0.055;
    const rotateBoost = Math.sin(this.time * 5.5) * 0.055 * this.voice.energy;

    // Group cha luôn giữ vị trí từ config.js
    this.root.position.x = this.basePosition.x;
    this.root.position.y = this.basePosition.y + idleBob + singBob;
    this.root.position.z = this.basePosition.z;

    this.root.rotation.x = this.baseRotation.x;
    this.root.rotation.y = this.baseRotation.y + rotateBoost;
    this.root.rotation.z =
      this.baseRotation.z +
      Math.sin(this.time * 4.2) * 0.035 * this.voice.energy;

    this.root.scale.set(
      this.baseScale.x * scaleBoost,
      this.baseScale.y * (1 + this.voice.energy * 0.035),
      this.baseScale.z * scaleBoost
    );
  }

  setVisible(visible) {
    this.root.visible = Boolean(visible);
  }

  dispose() {
    if (this.stopSingingTimer) {
      window.clearTimeout(this.stopSingingTimer);
      this.stopSingingTimer = null;
    }

    if (this.mixer) {
      this.mixer.stopAllAction();
      this.mixer.uncacheRoot(this.animationRoot);
    }
  }
}

export default AvatarController;