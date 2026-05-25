import * as THREE from "three";

import CONFIG from "../config.js";
import eventBus from "../EventBus.js";

import ModelLoader from "./ModelLoader.js";
import AvatarController from "./AvatarController.js";

class ThreeStage {
  constructor() {
    this.canvas = null;
    this.renderer = null;
    this.scene = null;
    this.camera = null;

    this.clock = new THREE.Clock();
    this.animationFrameId = null;

    this.modelLoader = new ModelLoader();

    this.stageRoot = null;

    this.avatars = {
      singer1: null,
      singer2: null
    };

    this.isReady = false;
    this.isRunning = false;
  }

  async init() {
    this.canvas = document.querySelector("#three-canvas");

    if (!this.canvas) {
      throw new Error("Không tìm thấy canvas #three-canvas.");
    }

    this.createScene();
    this.createCamera();
    this.createRenderer();
    this.createLights();
    this.bindEvents();

    await this.loadStageAsset();
    await this.loadAvatars();

    this.isReady = true;
    this.isRunning = true;

    this.start();

    eventBus.emit("app:toast", {
      message: "Sân khấu 3D đã sẵn sàng.",
      type: "success"
    });
  }

  createScene() {
    this.scene = new THREE.Scene();
    this.scene.background = null;
  }

  createCamera() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    this.camera = new THREE.PerspectiveCamera(
      CONFIG.stage.cameraFov,
      width / height,
      CONFIG.stage.cameraNear,
      CONFIG.stage.cameraFar
    );

    this.camera.position.set(0, 0, 5.2);
    this.camera.lookAt(0, 0, 0);
  }

  createRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: true,
      powerPreference: "high-performance"
    });

    this.renderer.setSize(window.innerWidth, window.innerHeight);

    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, CONFIG.stage.maxPixelRatio || 1.5)
    );

    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.renderer.shadowMap.enabled = false;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  createLights() {
    const ambient = new THREE.AmbientLight(0xffffff, 0.9);
    this.scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.55);
    keyLight.position.set(3, 5, 4);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.camera.near = 0.1;
    keyLight.shadow.camera.far = 20;
    keyLight.shadow.camera.left = -6;
    keyLight.shadow.camera.right = 6;
    keyLight.shadow.camera.top = 6;
    keyLight.shadow.camera.bottom = -6;
    this.scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 1.1);
    rimLight.position.set(-3, 3.5, -3);
    this.scene.add(rimLight);

    const purpleLight = new THREE.PointLight(0xc084fc, 1.8, 8);
    purpleLight.position.set(0, 2.2, 1.2);
    this.scene.add(purpleLight);
  }

  bindEvents() {
    window.addEventListener("resize", () => {
      this.handleResize();
    });

    eventBus.on("singer:active", (payload) => {
      this.handleSingerActive(payload);
    });

    eventBus.on("youtube:state", ({ state }) => {
      if (state === "playing") {
        this.isRunning = true;
      }

      if (state === "ended" || state === "stopped") {
        this.resetSingerVoice();
      }
    });
  }

  async loadStageAsset() {
    const stagePath = CONFIG.stage.modelPaths.stage;

    try {
      const { root } = await this.modelLoader.loadGLB(stagePath);

      this.stageRoot = root;

      this.modelLoader.configureModel(this.stageRoot, {
        castShadow: true,
        receiveShadow: true
      });

      this.modelLoader.applyTransform(
        this.stageRoot,
        CONFIG.stage.transforms.stage
      );

      this.scene.add(this.stageRoot);

      console.log("[ThreeStage] Loaded stage asset:", stagePath);
    } catch (error) {
      console.warn("[ThreeStage] Không load được stage.glb, dùng fallback:", error);

      this.stageRoot = this.modelLoader.createFallbackStage();
      this.scene.add(this.stageRoot);

      eventBus.emit("app:toast", {
        message: "Không tải được asset sân khấu. Đang dùng fallback tối thiểu.",
        type: "warning"
      });
    }
  }

  async loadAvatars() {
    await Promise.all([
      this.loadAvatar("singer1", CONFIG.stage.modelPaths.singer1, 0x38bdf8),
      this.loadAvatar("singer2", CONFIG.stage.modelPaths.singer2, 0xc084fc)
    ]);
  }

  async loadAvatar(id, path, fallbackColor) {
    let modelData;

    try {
      modelData = await this.modelLoader.loadGLB(path);

      this.modelLoader.configureModel(modelData.root, {
        castShadow: true,
        receiveShadow: true
      });

      console.log(`[ThreeStage] Loaded avatar ${id}:`, path);
    } catch (error) {
      console.warn(`[ThreeStage] Không load được avatar ${id}, dùng fallback:`, error);

      modelData = this.modelLoader.createFallbackAvatar(fallbackColor);

      eventBus.emit("app:toast", {
        message: `Không tải được model ${id}. Đang dùng avatar fallback.`,
        type: "warning"
      });
    }

    const transform = CONFIG.stage.transforms[id];

    this.modelLoader.applyTransform(modelData.root, transform);

    this.scene.add(modelData.root);

    this.avatars[id] = new AvatarController({
      id,
      root: modelData.root,
      animations: modelData.animations
    });
  }

  handleSingerActive({ singerId, active, rms, pitch }) {
    const avatar = this.avatars[singerId];

    if (!avatar) {
      return;
    }

    avatar.setVoiceData({
      active,
      rms,
      pitch
    });
  }

  resetSingerVoice() {
    Object.values(this.avatars).forEach((avatar) => {
      if (!avatar) {
        return;
      }

      avatar.setVoiceData({
        active: false,
        rms: 0,
        pitch: 0
      });
    });
  }

  start() {
    if (this.animationFrameId) {
      return;
    }

    this.clock.start();
    this.animate();
  }

  animate() {
    this.animationFrameId = window.requestAnimationFrame(() => {
      this.animate();
    });

    const delta = Math.min(this.clock.getDelta(), 0.05);

    Object.values(this.avatars).forEach((avatar) => {
      if (avatar) {
        avatar.update(delta);
      }
    });

    this.renderer.render(this.scene, this.camera);
  }

  handleResize() {
    if (!this.camera || !this.renderer) {
      return;
    }

    const width = window.innerWidth;
    const height = window.innerHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height);

    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, CONFIG.stage.maxPixelRatio || 1.5)
    );
  }

  dispose() {
    if (this.animationFrameId) {
      window.cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    Object.values(this.avatars).forEach((avatar) => {
      if (avatar) {
        avatar.dispose();
      }
    });

    this.renderer?.dispose();
  }
}

export default ThreeStage;