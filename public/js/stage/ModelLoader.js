import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

class ModelLoader {
  constructor() {
    this.loader = new GLTFLoader();
    this.cache = new Map();
  }

  async loadModel(path) {
    if (!path) {
      throw new Error("Thiếu đường dẫn model .glb.");
    }

    if (this.cache.has(path)) {
      return this.cloneModel(this.cache.get(path));
    }

    const gltf = await this.load(path);

    this.cache.set(path, gltf);

    return this.cloneModel(gltf);
  }

  load(path) {
    return new Promise((resolve, reject) => {
      this.loader.load(
        path,
        (gltf) => {
          resolve(gltf);
        },
        undefined,
        (error) => {
          reject(error);
        }
      );
    });
  }

  cloneModel(gltf) {
    const root = gltf.scene.clone(true);

    const animations = gltf.animations || [];

    return {
      root,
      animations
    };
  }

  configureModel(root, options = {}) {
    const {
      castShadow = true,
      receiveShadow = true,
      transparent = false
    } = options;

    root.traverse((child) => {
      if (!child.isMesh) {
        return;
      }

      child.castShadow = castShadow;
      child.receiveShadow = receiveShadow;
      child.frustumCulled = false;

      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach((material) => {
            this.configureMaterial(material, transparent);
          });
        } else {
          this.configureMaterial(child.material, transparent);
        }
      }
    });
  }

  configureMaterial(material, transparent) {
    material.needsUpdate = true;

    if (transparent) {
      material.transparent = true;
    }

    if ("roughness" in material) {
      material.roughness = Math.min(1, Math.max(0.35, material.roughness));
    }

    if ("metalness" in material) {
      material.metalness = Math.min(0.7, Math.max(0, material.metalness));
    }
  }

  applyTransform(root, transform = {}) {
    const position = transform.position || {};
    const rotation = transform.rotation || {};
    const scale = transform.scale || {};

    root.position.set(
      Number(position.x ?? 0),
      Number(position.y ?? 0),
      Number(position.z ?? 0)
    );

    root.rotation.set(
      Number(rotation.x ?? 0),
      Number(rotation.y ?? 0),
      Number(rotation.z ?? 0)
    );

    root.scale.set(
      Number(scale.x ?? 1),
      Number(scale.y ?? 1),
      Number(scale.z ?? 1)
    );
  }

  createFallbackAvatar(color = 0x38bdf8) {
    const group = new THREE.Group();

    const bodyGeometry = new THREE.CylinderGeometry(0.28, 0.35, 1.25, 32);
    const headGeometry = new THREE.SphereGeometry(0.26, 32, 32);
    const micGeometry = new THREE.CylinderGeometry(0.035, 0.035, 0.55, 16);

    const bodyMaterial = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.55,
      metalness: 0.15
    });

    const headMaterial = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.65
    });

    const micMaterial = new THREE.MeshStandardMaterial({
      color: 0x111827,
      roughness: 0.4,
      metalness: 0.5
    });

    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 0.65;

    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = 1.45;

    const mic = new THREE.Mesh(micGeometry, micMaterial);
    mic.rotation.z = Math.PI / 2;
    mic.position.set(0.32, 1.18, 0.16);

    body.castShadow = true;
    body.receiveShadow = true;

    head.castShadow = true;
    head.receiveShadow = true;

    mic.castShadow = true;

    group.add(body, head, mic);

    group.userData.isFallback = true;

    return {
      root: group,
      animations: []
    };
  }

  createFallbackStage() {
    const group = new THREE.Group();

    const floorGeometry = new THREE.BoxGeometry(5.8, 0.18, 2.8);
    const floorMaterial = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.55,
      metalness: 0.25
    });

    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.position.y = -0.12;
    floor.receiveShadow = true;

    const backGeometry = new THREE.BoxGeometry(5.8, 2.4, 0.12);
    const backMaterial = new THREE.MeshStandardMaterial({
      color: 0x111827,
      roughness: 0.7
    });

    const back = new THREE.Mesh(backGeometry, backMaterial);
    back.position.set(0, 1.1, -1.35);
    back.receiveShadow = true;

    group.add(floor, back);

    group.userData.isFallback = true;

    return group;
  }
}

export default ModelLoader;