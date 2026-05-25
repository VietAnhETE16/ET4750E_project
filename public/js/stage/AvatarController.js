import * as THREE from "three";

class AvatarController {
  constructor(options) {
    this.id = options.id;
    this.root = options.root;
    this.animations = options.animations || [];

    this.basePosition = this.root.position.clone();
    this.baseRotation = this.root.rotation.clone();
    this.baseScale = this.root.scale.clone();

    this.mixer = null;
    this.actions = [];

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
      return;
    }

    this.mixer = new THREE.AnimationMixer(this.root);

    this.animations.forEach((clip) => {
      const action = this.mixer.clipAction(clip);

      action.enabled = true;
      action.setEffectiveWeight(1);
      action.play();

      this.actions.push(action);
    });
  }

  setVoiceData({ active = false, rms = 0, pitch = 0 } = {}) {
    this.voice.active = Boolean(active);
    this.voice.rms = Number(rms) || 0;
    this.voice.pitch = Number(pitch) || 0;

    const normalizedEnergy = Math.min(1, Math.max(0, this.voice.rms * 8));

    this.voice.targetEnergy = this.voice.active ? normalizedEnergy : 0;
  }

  update(delta) {
    this.time += delta;

    if (this.mixer) {
      const speed = this.voice.active ? 1 + this.voice.energy * 0.85 : 0.65;
      this.mixer.update(delta * speed);
    }

    this.voice.energy = THREE.MathUtils.lerp(
      this.voice.energy,
      this.voice.targetEnergy,
      0.16
    );

    this.updateMotion();
  }

  updateMotion() {
    const idleBob = Math.sin(this.time * 2.1) * 0.025;
    const singBob = Math.sin(this.time * 8.5) * 0.08 * this.voice.energy;

    const scaleBoost = 1 + this.voice.energy * 0.08;
    const rotateBoost = Math.sin(this.time * 5.5) * 0.08 * this.voice.energy;

    this.root.position.y = this.basePosition.y + idleBob + singBob;

    this.root.rotation.x = this.baseRotation.x;
    this.root.rotation.y = this.baseRotation.y + rotateBoost;
    this.root.rotation.z =
      this.baseRotation.z + Math.sin(this.time * 4.2) * 0.045 * this.voice.energy;

    this.root.scale.set(
      this.baseScale.x * scaleBoost,
      this.baseScale.y * (1 + this.voice.energy * 0.045),
      this.baseScale.z * scaleBoost
    );
  }

  setVisible(visible) {
    this.root.visible = Boolean(visible);
  }

  dispose() {
    if (this.mixer) {
      this.mixer.stopAllAction();
      this.mixer.uncacheRoot(this.root);
    }
  }
}

export default AvatarController;