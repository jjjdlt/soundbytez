/**
 * AudioEngine - Handles all Tone.js audio initialization and management
 */
export class AudioEngine {
    constructor() {
        this.isInitialized = false;
        this.masterSynth = null;
        this.sequence = null;
        this.isPlaying = false;
        this.currentStep = 0;
    }

    async initialize() {
        if (this.isInitialized) return;
        
        try {
            console.log('Starting Tone.js audio context...');
            await Tone.start();
            console.log('Tone.js started successfully');
            
            this.masterSynth = new Tone.Synth({
                oscillator: {
                    type: 'sine'
                },
                envelope: {
                    attack: 0.1,
                    decay: 0.2,
                    sustain: 0.3,
                    release: 1
                }
            }).toDestination();

            Tone.Transport.bpm.value = 120;
            this.isInitialized = true;
            
            console.log('Audio initialized successfully');
            return true;
        } catch (error) {
            console.error('Audio initialization failed:', error);
            throw new Error('Audio initialization failed: ' + error.message);
        }
    }

    createSequence(callback, steps = 16) {
        if (this.sequence) {
            this.sequence.dispose();
        }
        
        this.sequence = new Tone.Sequence((time, step) => {
            callback(time, step);
            this.currentStep = step;
        }, Array.from({length: steps}, (_, i) => i), '16n');
    }

    async play() {
        if (!this.isInitialized) {
            await this.initialize();
        }
        
        if (!this.isPlaying && this.sequence) {
            this.sequence.start();
            Tone.Transport.start();
            this.isPlaying = true;
            return true;
        }
        return false;
    }

    pause() {
        if (this.isPlaying) {
            Tone.Transport.pause();
            this.isPlaying = false;
            return true;
        }
        return false;
    }

    stop() {
        if (this.sequence) {
            Tone.Transport.stop();
            this.sequence.stop();
        }
        this.isPlaying = false;
        this.currentStep = 0;
    }

    setBPM(bpm) {
        Tone.Transport.bpm.value = parseInt(bpm);
    }

    setMasterVolume(value) {
        // Convert 0-100 slider to -60dB to 0dB range
        const dbValue = value === 0 ? -60 : (value - 100) * 0.6;
        Tone.Destination.volume.value = dbValue;
    }

    toggleLoop(enabled) {
        if (enabled) {
            Tone.Transport.loop = true;
            Tone.Transport.loopStart = 0;
            Tone.Transport.loopEnd = '1m';
        } else {
            Tone.Transport.loop = false;
        }
    }

    createSynth(instrumentType) {
        switch (instrumentType) {
            case 'kick':
                return new Tone.MembraneSynth({
                    pitchDecay: 0.05,
                    octaves: 10,
                    oscillator: { type: 'sine' },
                    envelope: { attack: 0.001, decay: 0.4, sustain: 0.01, release: 1.4, attackCurve: 'exponential' }
                });
            case 'snare':
                return new Tone.NoiseSynth({
                    noise: { type: 'white' },
                    envelope: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.2 }
                });
            case 'hihat':
                return new Tone.MetalSynth({
                    frequency: 200,
                    envelope: { attack: 0.001, decay: 0.1, release: 0.01 },
                    harmonicity: 5.1,
                    modulationIndex: 32,
                    resonance: 4000,
                    octaves: 1.5
                });
            case 'synth':
                return new Tone.Synth({
                    oscillator: { type: 'sine' },
                    envelope: { attack: 0.1, decay: 0.2, sustain: 0.3, release: 1 }
                });
            case 'fm':
                return new Tone.FMSynth({
                    harmonicity: 3,
                    modulationIndex: 10,
                    oscillator: { type: 'sine' },
                    envelope: { attack: 0.1, decay: 0.2, sustain: 0.3, release: 1 }
                });
            case 'am':
                return new Tone.AMSynth({
                    harmonicity: 2,
                    oscillator: { type: 'sine' },
                    envelope: { attack: 0.1, decay: 0.2, sustain: 0.3, release: 1 }
                });
            case 'noise':
                return new Tone.NoiseSynth({
                    noise: { type: 'white' },
                    envelope: { attack: 0.005, decay: 0.1, sustain: 0 }
                });
            default:
                return new Tone.Synth();
        }
    }

    createVolume(initialValue = -10) {
        return new Tone.Volume(initialValue).toDestination();
    }

    createPanner(initialValue = 0) {
        return new Tone.Panner(initialValue);
    }

    getPlaybackPosition() {
        const position = Math.floor(Tone.Transport.seconds);
        const minutes = Math.floor(position / 60);
        const seconds = position % 60;
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    dispose() {
        if (this.sequence) {
            this.sequence.dispose();
        }
        if (this.masterSynth) {
            this.masterSynth.dispose();
        }
    }
}