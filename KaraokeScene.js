class KaraokeScene {
    constructor() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        document.body.appendChild(this.renderer.domElement);

        this.camera.position.z = 10;
        this.camera.position.y = 2;

        this.avatars = [];
        this.setupLights();
        this.setupAvatars();

        window.addEventListener('resize', () => this.onWindowResize(), false);
    }

    setupLights() {
        this.ambientLight = new THREE.AmbientLight(0x404040);
        this.scene.add(this.ambientLight);

        this.spotLight = new THREE.SpotLight(0xffffff, 0);
        this.spotLight.position.set(0, 10, 5);
        this.scene.add(this.spotLight);
    }

    setupAvatars() {
        // Create 2 avatars for the demo
        const colors = [0x00ffcc, 0xff00ff];
        const positions = [-3, 3];

        for(let i=0; i<2; i++) {
            const geometry = new THREE.BoxGeometry(2, 4, 2);
            const material = new THREE.MeshPhongMaterial({ 
                color: colors[i], 
                emissive: 0x000000 
            });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.x = positions[i];
            this.scene.add(mesh);
            this.avatars.push({ mesh: mesh, active: false, baseColor: colors[i] });
        }
    }

    // Called by the Audio Engine to update visuals
    updateAvatars(activeSingerIndex, rms) {
        // Stage lighting reacts to loudness
        this.spotLight.intensity = rms * 50;

        this.avatars.forEach((avatar, index) => {
            if (activeSingerIndex === 'Group' || activeSingerIndex === index) {
                // Active or Group singing
                avatar.mesh.scale.y = 1 + (rms * 2);
                avatar.mesh.material.emissive.setHex(avatar.baseColor);
                avatar.mesh.material.emissiveIntensity = 0.5;
            } else {
                // Idle
                avatar.mesh.scale.y = 1;
                avatar.mesh.material.emissive.setHex(0x000000);
            }
        });
    }

    render() {
        this.renderer.render(this.scene, this.camera);
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
}