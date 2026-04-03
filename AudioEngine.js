class AudioEngine {
    constructor(scene) {
        this.scene = scene;
        this.audioCtx = null;
        this.analyzer = null;
        this.meydaAnalyzer = null;
        this.detectPitch = null;
        
        // Speaker profiles (Storing mock MFCC arrays for clustering)
        this.profiles = {
            0: Array(13).fill(0), // Avatar 1 profile baseline
            1: Array(13).fill(0)  // Avatar 2 profile baseline
        };
        this.isTraining = true;
        this.trainingFrames = 0;
    }

    async initialize() {
        // 1. Setup AudioContext with low latency
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
        
        // 2. Request microphone access (Disable echo cancellation to capture raw Voicemeeter mix)
        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: { echoCancellation: false, autoGainControl: false, noiseSuppression: false } 
        });

        const source = this.audioCtx.createMediaStreamSource(stream);
        
        // 3. Setup Analyzer for raw waveform (Pitchfinder)
        this.analyzer = this.audioCtx.createAnalyser();
        this.analyzer.fftSize = 2048;
        source.connect(this.analyzer);

        // NOTE: We do NOT connect source to destination here to prevent feedback loops.
        // Monitoring should be handled natively in Voicemeeter before hitting the browser.

        // 4. Setup Pitchfinder (YIN algorithm)
        this.detectPitch = Pitchfinder.YIN({ sampleRate: this.audioCtx.sampleRate });

        // 5. Setup Meyda (Feature Extraction)
        this.meydaAnalyzer = Meyda.createMeydaAnalyzer({
            audioContext: this.audioCtx,
            source: source,
            bufferSize: 512,
            featureExtractors: ['rms', 'mfcc'],
            callback: (features) => this.processAudioFeatures(features)
        });

        this.meydaAnalyzer.start();
        console.log("Audio Engine Initialized.");
    }

    processAudioFeatures(features) {
        if (!features) return;

        const { rms, mfcc } = features;

        // --- Voice Activity Detection (VAD) ---
        // Only process if energy is above a silence threshold
        if (rms < 0.02) {
            this.scene.updateAvatars(-1, rms); // -1 means no one
            document.getElementById('singerDisplay').innerText = "None";
            return;
        }

        // --- Speaker Clustering (Approximate) ---
        let activeSinger = "Group";
        
        // Mock Training Phase: Assign first few frames to Profile 0, next to Profile 1
        if (this.isTraining) {
            if (this.trainingFrames < 50) {
                this.profiles[0] = mfcc; // Train Player 1
                document.getElementById('singerDisplay').innerText = "Training Player 1...";
            } else if (this.trainingFrames < 100) {
                this.profiles[1] = mfcc; // Train Player 2
                document.getElementById('singerDisplay').innerText = "Training Player 2...";
            } else {
                this.isTraining = false;
            }
            this.trainingFrames++;
        } else {
            // Predict Singer using Euclidean Distance
            const dist1 = this.calculateEuclideanDistance(mfcc, this.profiles[0]);
            const dist2 = this.calculateEuclideanDistance(mfcc, this.profiles[1]);

            // Assign to closest profile. If both distances are huge and RMS is high -> Group
            const threshold = 40; 
            if (dist1 < dist2 && dist1 < threshold) {
                activeSinger = 0;
            } else if (dist2 < dist1 && dist2 < threshold) {
                activeSinger = 1;
            } else if (rms > 0.15) {
                activeSinger = "Group";
            }
            
            document.getElementById('singerDisplay').innerText = activeSinger === "Group" ? "Group" : `Player ${activeSinger + 1}`;
        }

        // --- Pitch Detection & Scoring ---
        // Get raw data for pitch
        const float32Array = new Float32Array(this.analyzer.fftSize);
        this.analyzer.getFloatTimeDomainData(float32Array);
        const pitch = this.detectPitch(float32Array);

        if (pitch) {
            document.getElementById('pitchDisplay').innerText = Math.round(pitch);
            // SCORING LOGIC HERE: Compare `pitch` to your MIDI array
        }

        // Update 3D Visuals
        this.scene.updateAvatars(activeSinger, rms);
    }

    // Helper math function for clustering
    calculateEuclideanDistance(vec1, vec2) {
        let sum = 0;
        for (let i = 0; i < vec1.length; i++) {
            sum += Math.pow(vec1[i] - vec2[i], 2);
        }
        return Math.sqrt(sum);
    }

    update() {
        // Called per frame, handled asynchronously by Meyda callback
    }
}