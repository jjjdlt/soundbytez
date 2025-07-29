class SoundBytezDAW {
    constructor() {
        this.isPlaying = false;
        this.currentInstrument = 'synth';
        this.synth = null;
        this.sequence = null;
        this.currentStep = 0;
        this.audioInitialized = false;
        this.nextTrackId = 1;
        
        // Track management
        this.tracks = new Map();
        this.tracks.set(0, {
            id: 0,
            name: 'Track 1',
            displayNumber: 1,
            instrument: 'synth',
            synth: null,
            volume: null,
            panner: null,
            steps: Array(16).fill(false),
            pianoRoll: new Map(), // Store notes as Map(noteIndex -> Map(timeStep -> {note, velocity, duration}))
            muted: false,
            soloed: false
        });
        
        // Piano roll state
        this.currentPianoRollTrackId = null;
        this.pianoRollDivision = '8n';
        this.pianoRollSteps = 32; // Number of time steps visible
        
        // Scale system
        this.currentKey = 'C';
        this.currentScale = 'major';
        this.scaleNotes = this.calculateScaleNotes(this.currentKey, this.currentScale);
        
        this.init();
    }

    async init() {
        this.setupEventListeners();
        this.updateStatus('Audio: Click any button to start');
    }

    async initAudio() {
        if (this.audioInitialized) return;
        
        try {
            console.log('Starting Tone.js audio context...');
            await Tone.start();
            console.log('Tone.js started successfully');
            
            this.synth = new Tone.Synth({
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
            
            this.sequence = new Tone.Sequence((time, step) => {
                this.tracks.forEach(track => {
                    if (track.steps[step] && !track.muted && track.synth) {
                        // Check if any track is soloed
                        const hassSoloedTracks = Array.from(this.tracks.values()).some(t => t.soloed);
                        
                        // Play if no tracks are soloed, or this track is soloed
                        if (!hassSoloedTracks || track.soloed) {
                            this.playTrackStep(track, step, time);
                        }
                    }
                });
                this.updateStepIndicator(step);
            }, Array.from({length: 16}, (_, i) => i), '16n');

            Tone.Transport.bpm.value = 120;
            
            // Initialize synths for existing tracks
            await this.initializeTrackSynth(0, 'synth');
            
            this.audioInitialized = true;
            this.updateStatus('Audio: Ready');
            console.log('Audio initialized successfully');
            
        } catch (error) {
            console.error('Audio initialization failed:', error);
            this.updateStatus('Audio: Error - ' + error.message);
        }
    }

    setupEventListeners() {
        document.getElementById('play-btn').addEventListener('click', () => this.togglePlay());
        document.getElementById('stop-btn').addEventListener('click', () => this.stop());
        document.getElementById('record-btn').addEventListener('click', () => this.toggleRecord());
        document.getElementById('loop-btn').addEventListener('click', () => this.toggleLoop());
        
        document.getElementById('bpm').addEventListener('input', (e) => this.setBPM(e.target.value));
        
        // Scale control event listeners
        document.getElementById('key-select').addEventListener('change', (e) => this.changeKey(e.target.value));
        document.getElementById('scale-select').addEventListener('change', (e) => this.changeScale(e.target.value));
        
        document.querySelectorAll('.instrument-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                await this.selectInstrument(e.target.dataset.instrument);
            });
        });
        
        document.querySelectorAll('.key').forEach(key => {
            key.addEventListener('click', async (e) => {
                await this.playNote(e.target.dataset.note);
            });
        });
        
        this.setupTrackEventListeners();
        
        document.getElementById('add-track-btn').addEventListener('click', () => this.addTrack());
        document.getElementById('clear-all-btn').addEventListener('click', () => this.clearAll());
        
        document.getElementById('master-volume').addEventListener('input', (e) => {
            this.setMasterVolume(e.target.value);
            document.getElementById('master-volume-value').textContent = e.target.value;
        });
        
        this.setupMixerEventListeners();
        this.setupPianoRollEventListeners();
    }

    setupPianoRollEventListeners() {
        document.getElementById('close-piano-roll').addEventListener('click', () => {
            this.closePianoRoll();
        });
        
        document.getElementById('note-division').addEventListener('change', (e) => {
            this.pianoRollDivision = e.target.value;
            this.updatePianoRollGrid();
        });
        
        // Close modal when clicking outside
        document.getElementById('piano-roll-modal').addEventListener('click', (e) => {
            if (e.target === document.getElementById('piano-roll-modal')) {
                this.closePianoRoll();
            }
        });
    }

    async togglePlay() {
        await this.initAudio();
        
        const playBtn = document.getElementById('play-btn');
        
        if (!this.isPlaying) {
            this.sequence.start();
            Tone.Transport.start();
            this.isPlaying = true;
            playBtn.classList.add('active');
            playBtn.textContent = '⏸️';
            this.updateStatus('Audio: Playing');
        } else {
            Tone.Transport.pause();
            this.isPlaying = false;
            playBtn.classList.remove('active');
            playBtn.textContent = '▶️';
            this.updateStatus('Audio: Paused');
        }
    }

    stop() {
        Tone.Transport.stop();
        this.sequence.stop();
        this.isPlaying = false;
        this.currentStep = 0;
        
        const playBtn = document.getElementById('play-btn');
        playBtn.classList.remove('active');
        playBtn.textContent = '▶️';
        
        document.querySelectorAll('.step').forEach(step => {
            step.classList.remove('playing');
        });
        
        this.updateStatus('Audio: Stopped');
    }

    toggleRecord() {
        const recordBtn = document.getElementById('record-btn');
        recordBtn.classList.toggle('active');
        
        if (recordBtn.classList.contains('active')) {
            this.updateStatus('Audio: Recording');
        } else {
            this.updateStatus('Audio: Ready');
        }
    }

    toggleLoop() {
        const loopBtn = document.getElementById('loop-btn');
        loopBtn.classList.toggle('active');
        
        if (loopBtn.classList.contains('active')) {
            Tone.Transport.loop = true;
            Tone.Transport.loopStart = 0;
            Tone.Transport.loopEnd = '1m';
        } else {
            Tone.Transport.loop = false;
        }
    }

    setBPM(bpm) {
        Tone.Transport.bpm.value = parseInt(bpm);
    }

    // Scale system methods
    calculateScaleNotes(key, scaleType) {
        const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const keyIndex = noteNames.indexOf(key);
        
        // Scale intervals (semitones from root)
        const scaleIntervals = {
            'major': [0, 2, 4, 5, 7, 9, 11],
            'minor': [0, 2, 3, 5, 7, 8, 10]
        };
        
        const intervals = scaleIntervals[scaleType] || scaleIntervals['major'];
        const scaleNotes = new Set();
        
        // Generate scale notes across all octaves
        for (let octave = 0; octave <= 8; octave++) {
            intervals.forEach(interval => {
                const noteIndex = (keyIndex + interval) % 12;
                const noteName = noteNames[noteIndex];
                scaleNotes.add(`${noteName}${octave}`);
            });
        }
        
        return scaleNotes;
    }

    changeKey(newKey) {
        this.currentKey = newKey;
        this.scaleNotes = this.calculateScaleNotes(this.currentKey, this.currentScale);
        this.updatePianoRollScaleHighlighting();
        console.log(`Key changed to ${newKey} ${this.currentScale}`);
    }

    changeScale(newScale) {
        this.currentScale = newScale;
        this.scaleNotes = this.calculateScaleNotes(this.currentKey, this.currentScale);
        this.updatePianoRollScaleHighlighting();
        console.log(`Scale changed to ${this.currentKey} ${newScale}`);
    }

    isNoteInScale(noteName) {
        return this.scaleNotes.has(noteName);
    }

    isRootNote(noteName) {
        return noteName.startsWith(this.currentKey) && (noteName.length === 2 || noteName.length === 3);
    }

    async selectInstrument(instrumentType) {
        await this.initAudio();
        
        document.querySelectorAll('.instrument-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        document.querySelector(`[data-instrument="${instrumentType}"]`).classList.add('active');
        this.currentInstrument = instrumentType;
        
        if (this.synth) {
            this.synth.dispose();
        }
        
        switch (instrumentType) {
            case 'synth':
                this.synth = new Tone.Synth({
                    oscillator: { type: 'sine' },
                    envelope: { attack: 0.1, decay: 0.2, sustain: 0.3, release: 1 }
                }).toDestination();
                break;
            case 'fm':
                this.synth = new Tone.FMSynth({
                    harmonicity: 3,
                    modulationIndex: 10,
                    oscillator: { type: 'sine' },
                    envelope: { attack: 0.1, decay: 0.2, sustain: 0.3, release: 1 }
                }).toDestination();
                break;
            case 'am':
                this.synth = new Tone.AMSynth({
                    harmonicity: 2,
                    oscillator: { type: 'sine' },
                    envelope: { attack: 0.1, decay: 0.2, sustain: 0.3, release: 1 }
                }).toDestination();
                break;
            case 'noise':
                this.synth = new Tone.NoiseSynth({
                    noise: { type: 'white' },
                    envelope: { attack: 0.005, decay: 0.1, sustain: 0 }
                }).toDestination();
                break;
        }
        
        console.log(`Switched to ${instrumentType} synthesizer`);
    }

    async playNote(note) {
        await this.initAudio();
        
        if (this.synth && note) {
            try {
                console.log(`Playing note: ${note} with ${this.currentInstrument}`);
                
                // Handle different instrument types
                switch (this.currentInstrument) {
                    case 'kick':
                        this.synth.triggerAttackRelease('C1', '8n');
                        break;
                    case 'snare':
                        this.synth.triggerAttackRelease('8n');
                        break;
                    case 'hihat':
                        this.synth.triggerAttackRelease('32n');
                        break;
                    case 'noise':
                        this.synth.triggerAttackRelease('8n');
                        break;
                    default:
                        // Regular synths use the note
                        this.synth.triggerAttackRelease(note, '8n');
                        break;
                }
                
                const keyElement = document.querySelector(`[data-note="${note}"]`);
                if (keyElement) {
                    keyElement.classList.add('pressed');
                    setTimeout(() => {
                        keyElement.classList.remove('pressed');
                    }, 200);
                }
            } catch (error) {
                console.error('Error playing note:', error);
            }
        }
    }

    async stopNote(note) {
        // For triggerAttackRelease, we don't need a separate stop method
        // The note will stop automatically after the specified duration
    }

    toggleStep(trackId, stepIndex) {
        const track = this.tracks.get(trackId);
        if (!track) return;
        
        track.steps[stepIndex] = !track.steps[stepIndex];
        const stepElement = document.querySelector(`[data-step="${stepIndex}"][data-track="${trackId}"]`);
        
        if (track.steps[stepIndex]) {
            stepElement.classList.add('active');
        } else {
            stepElement.classList.remove('active');
        }
    }

    updateStepIndicator(step) {
        document.querySelectorAll('.step').forEach((stepEl) => {
            const stepIndex = parseInt(stepEl.dataset.step);
            if (stepIndex === step) {
                stepEl.classList.add('playing');
            } else {
                stepEl.classList.remove('playing');
            }
        });
        
        this.currentStep = step;
        this.updatePlaybackPosition();
    }

    setupTrackEventListeners() {
        // Set up event listeners for existing tracks
        document.querySelectorAll('.step').forEach(step => {
            step.addEventListener('click', (e) => {
                const trackId = parseInt(e.target.dataset.track);
                const stepIndex = parseInt(e.target.dataset.step);
                this.toggleStep(trackId, stepIndex);
            });
        });
        
        document.querySelectorAll('.track-mute-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const trackId = parseInt(e.target.dataset.track);
                this.toggleMute(trackId);
            });
        });
        
        document.querySelectorAll('.track-solo-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const trackId = parseInt(e.target.dataset.track);
                this.toggleSolo(trackId);
            });
        });
        
        document.querySelectorAll('.track-delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const trackId = parseInt(e.target.dataset.track);
                this.deleteTrack(trackId);
            });
        });
        
        document.querySelectorAll('.track-instrument').forEach(select => {
            select.addEventListener('change', async (e) => {
                const trackId = parseInt(e.target.dataset.track);
                await this.changeTrackInstrument(trackId, e.target.value);
            });
        });
        
        document.querySelectorAll('.track-piano-roll-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const trackId = parseInt(e.target.dataset.track);
                this.openPianoRoll(trackId);
            });
        });
    }

    setupMixerEventListeners() {
        document.querySelectorAll('.track-volume-slider').forEach(slider => {
            slider.addEventListener('input', (e) => {
                const trackId = parseInt(e.target.dataset.track);
                const value = e.target.value;
                this.setTrackVolume(trackId, value);
                e.target.nextElementSibling.textContent = value;
            });
        });
        
        document.querySelectorAll('.track-pan-slider').forEach(slider => {
            slider.addEventListener('input', (e) => {
                const trackId = parseInt(e.target.dataset.track);
                const value = e.target.value;
                this.setTrackPan(trackId, value);
                e.target.nextElementSibling.textContent = value;
            });
        });
    }

    async addTrack() {
        await this.initAudio();
        
        const trackId = this.nextTrackId++;
        const displayNumber = this.tracks.size + 1;
        const trackName = `Track ${displayNumber}`;
        
        // Create track data
        this.tracks.set(trackId, {
            id: trackId,
            name: trackName,
            displayNumber: displayNumber,
            instrument: 'synth',
            synth: null,
            volume: null,
            panner: null,
            steps: Array(16).fill(false),
            pianoRoll: new Map(),
            muted: false,
            soloed: false
        });
        
        // Create DOM element
        const trackElement = this.createTrackDOM(trackId, trackName);
        document.querySelector('.tracks-container').appendChild(trackElement);
        
        // Create mixer track
        const mixerTrackElement = this.createMixerTrackDOM(trackId, trackName);
        document.getElementById('mixer-tracks').appendChild(mixerTrackElement);
        
        // Initialize the synth for this track
        await this.initializeTrackSynth(trackId, 'synth');
        
        // Set up event listeners for the new track
        this.setupTrackEventListeners();
        this.setupMixerEventListeners();
        
        console.log(`Added ${trackName}`);
    }

    createTrackDOM(trackId, trackName) {
        const trackDiv = document.createElement('div');
        trackDiv.className = 'track';
        trackDiv.dataset.track = trackId;
        
        trackDiv.innerHTML = `
            <div class="track-header">
                <span class="track-name">${trackName}</span>
                <select class="track-instrument" data-track="${trackId}">
                    <optgroup label="Drums">
                        <option value="kick">Kick</option>
                        <option value="snare">Snare</option>
                        <option value="hihat">Hi-Hat</option>
                    </optgroup>
                    <optgroup label="Synths">
                        <option value="synth" selected>Basic Synth</option>
                        <option value="fm">FM Synth</option>
                        <option value="am">AM Synth</option>
                        <option value="noise">Noise Synth</option>
                    </optgroup>
                </select>
                <div class="track-controls">
                    <button class="track-mute-btn" data-track="${trackId}">M</button>
                    <button class="track-solo-btn" data-track="${trackId}">S</button>
                    <button class="track-piano-roll-btn" data-track="${trackId}">🎹</button>
                    <button class="track-delete-btn" data-track="${trackId}">×</button>
                </div>
            </div>
            <div class="track-sequencer">
                ${Array.from({length: 16}, (_, i) => {
                    const barDividerClass = [4, 8, 12].includes(i) ? ' bar-divider' : '';
                    return `<div class="step${barDividerClass}" data-step="${i}" data-track="${trackId}"></div>`;
                }).join('')}
            </div>
        `;
        
        return trackDiv;
    }

    createMixerTrackDOM(trackId, trackName) {
        const mixerTrackDiv = document.createElement('div');
        mixerTrackDiv.className = 'mixer-track';
        mixerTrackDiv.dataset.track = trackId;
        
        mixerTrackDiv.innerHTML = `
            <h4>${trackName}</h4>
            <div class="volume-control">
                <label>Volume</label>
                <input type="range" class="track-volume-slider" data-track="${trackId}" min="0" max="100" value="75">
                <span class="volume-value">75</span>
            </div>
            <div class="pan-control">
                <label>Pan</label>
                <input type="range" class="track-pan-slider" data-track="${trackId}" min="-100" max="100" value="0">
                <span class="pan-value">0</span>
            </div>
        `;
        
        return mixerTrackDiv;
    }

    async initializeTrackSynth(trackId, instrumentType) {
        if (!this.audioInitialized) return;
        
        const track = this.tracks.get(trackId);
        if (!track) return;
        
        // Dispose previous audio nodes if they exist
        if (track.synth) {
            track.synth.dispose();
        }
        if (track.volume) {
            track.volume.dispose();
        }
        if (track.panner) {
            track.panner.dispose();
        }
        
        // Create audio chain: Synth -> Volume -> Panner -> Destination
        track.volume = new Tone.Volume(-10).toDestination();
        track.panner = new Tone.Panner(0).connect(track.volume);
        
        // Create new synth based on type and connect to audio chain
        switch (instrumentType) {
            // Drum instruments
            case 'kick':
                track.synth = new Tone.MembraneSynth({
                    pitchDecay: 0.05,
                    octaves: 10,
                    oscillator: { type: 'sine' },
                    envelope: { attack: 0.001, decay: 0.4, sustain: 0.01, release: 1.4, attackCurve: 'exponential' }
                }).connect(track.panner);
                break;
            case 'snare':
                track.synth = new Tone.NoiseSynth({
                    noise: { type: 'white' },
                    envelope: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.2 }
                }).connect(track.panner);
                break;
            case 'hihat':
                track.synth = new Tone.MetalSynth({
                    frequency: 200,
                    envelope: { attack: 0.001, decay: 0.1, release: 0.01 },
                    harmonicity: 5.1,
                    modulationIndex: 32,
                    resonance: 4000,
                    octaves: 1.5
                }).connect(track.panner);
                break;
            // Synth instruments
            case 'synth':
                track.synth = new Tone.Synth({
                    oscillator: { type: 'sine' },
                    envelope: { attack: 0.1, decay: 0.2, sustain: 0.3, release: 1 }
                }).connect(track.panner);
                break;
            case 'fm':
                track.synth = new Tone.FMSynth({
                    harmonicity: 3,
                    modulationIndex: 10,
                    oscillator: { type: 'sine' },
                    envelope: { attack: 0.1, decay: 0.2, sustain: 0.3, release: 1 }
                }).connect(track.panner);
                break;
            case 'am':
                track.synth = new Tone.AMSynth({
                    harmonicity: 2,
                    oscillator: { type: 'sine' },
                    envelope: { attack: 0.1, decay: 0.2, sustain: 0.3, release: 1 }
                }).connect(track.panner);
                break;
            case 'noise':
                track.synth = new Tone.NoiseSynth({
                    noise: { type: 'white' },
                    envelope: { attack: 0.005, decay: 0.1, sustain: 0 }
                }).connect(track.panner);
                break;
        }
        
        track.instrument = instrumentType;
    }

    async changeTrackInstrument(trackId, instrumentType) {
        await this.initializeTrackSynth(trackId, instrumentType);
        const track = this.tracks.get(trackId);
        console.log(`${track ? track.name : 'Track'} changed to ${instrumentType}`);
    }

    deleteTrack(trackId) {
        if (this.tracks.size <= 1) {
            alert('Cannot delete the last track');
            return;
        }
        
        const track = this.tracks.get(trackId);
        if (track) {
            if (track.synth) track.synth.dispose();
            if (track.volume) track.volume.dispose();
            if (track.panner) track.panner.dispose();
        }
        
        this.tracks.delete(trackId);
        
        // Remove from timeline
        const trackElement = document.querySelector(`[data-track="${trackId}"].track`);
        if (trackElement) {
            trackElement.remove();
        }
        
        // Remove from mixer
        const mixerTrackElement = document.querySelector(`[data-track="${trackId}"].mixer-track`);
        if (mixerTrackElement) {
            mixerTrackElement.remove();
        }
        
        // Renumber all remaining tracks
        this.renumberTracks();
        
        console.log(`Deleted track, remaining tracks renumbered`);
    }

    renumberTracks() {
        // Get all tracks sorted by their current display order in DOM
        const trackElements = Array.from(document.querySelectorAll('.track'));
        const mixerElements = Array.from(document.querySelectorAll('.mixer-track'));
        
        // Update display numbers for remaining tracks
        let displayNumber = 1;
        trackElements.forEach((element, index) => {
            const trackId = parseInt(element.dataset.track);
            const track = this.tracks.get(trackId);
            
            if (track) {
                const newName = `Track ${displayNumber}`;
                track.name = newName;
                track.displayNumber = displayNumber;
                
                // Update timeline track name
                const trackNameElement = element.querySelector('.track-name');
                if (trackNameElement) {
                    trackNameElement.textContent = newName;
                }
                
                // Update mixer track name
                const mixerElement = mixerElements.find(el => parseInt(el.dataset.track) === trackId);
                if (mixerElement) {
                    const mixerNameElement = mixerElement.querySelector('h4');
                    if (mixerNameElement) {
                        mixerNameElement.textContent = newName;
                    }
                }
                
                displayNumber++;
            }
        });
        
        console.log('Tracks renumbered sequentially');
    }

    clearAll() {
        this.tracks.forEach(track => {
            track.steps.fill(false);
        });
        
        document.querySelectorAll('.step').forEach(step => {
            step.classList.remove('active', 'playing');
        });
        this.stop();
        console.log('All tracks cleared');
    }

    toggleMute(trackId) {
        const track = this.tracks.get(trackId);
        if (!track) return;
        
        track.muted = !track.muted;
        const button = document.querySelector(`[data-track="${trackId}"].track-mute-btn`);
        
        if (track.muted) {
            button.classList.add('active');
            console.log(`${track.name} muted`);
        } else {
            button.classList.remove('active');
            console.log(`${track.name} unmuted`);
        }
    }

    toggleSolo(trackId) {
        const track = this.tracks.get(trackId);
        if (!track) return;
        
        track.soloed = !track.soloed;
        const button = document.querySelector(`[data-track="${trackId}"].track-solo-btn`);
        
        if (track.soloed) {
            button.classList.add('active');
            console.log(`${track.name} soloed`);
        } else {
            button.classList.remove('active');
            console.log(`${track.name} unsoloed`);
        }
    }

    setMasterVolume(value) {
        // Convert 0-100 slider to -60dB to 0dB range
        const dbValue = value === 0 ? -60 : (value - 100) * 0.6;
        Tone.Destination.volume.value = dbValue;
        console.log(`Master volume set to ${value} (${dbValue.toFixed(1)}dB)`);
    }

    setTrackVolume(trackId, value) {
        const track = this.tracks.get(trackId);
        if (!track || !track.volume) return;
        
        // Convert 0-100 slider to -60dB to 0dB range
        const dbValue = value === 0 ? -60 : (value - 100) * 0.6;
        track.volume.volume.value = dbValue;
        console.log(`${track.name} volume set to ${value} (${dbValue.toFixed(1)}dB)`);
    }

    setTrackPan(trackId, value) {
        const track = this.tracks.get(trackId);
        if (!track || !track.panner) return;
        
        // Convert -100 to 100 slider to -1 to 1 range
        const panValue = value / 100;
        track.panner.pan.value = panValue;
        console.log(`${track.name} pan set to ${value} (${panValue})`);
    }

    // Piano Roll Methods
    openPianoRoll(trackId) {
        this.currentPianoRollTrackId = trackId;
        const track = this.tracks.get(trackId);
        
        if (track) {
            document.getElementById('piano-roll-title').textContent = `Piano Roll - ${track.name}`;
            document.getElementById('piano-roll-modal').style.display = 'block';
            this.generatePianoKeys();
            this.updatePianoRollGrid();
        }
    }

    closePianoRoll() {
        // Sync piano roll data to main sequencer before closing
        this.syncPianoRollToSequencer();
        
        document.getElementById('piano-roll-modal').style.display = 'none';
        this.currentPianoRollTrackId = null;
    }

    generatePianoKeys() {
        const pianoKeys = document.getElementById('piano-keys');
        pianoKeys.innerHTML = '';
        
        // Generate 88 piano keys (A0 to C8)
        const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        
        for (let octave = 0; octave <= 8; octave++) {
            for (let noteIndex = 0; noteIndex < 12; noteIndex++) {
                // Skip notes beyond C8
                if (octave === 8 && noteIndex > 0) break;
                // Skip notes below A0
                if (octave === 0 && noteIndex < 9) continue;
                
                const noteName = noteNames[noteIndex];
                const fullNote = `${noteName}${octave}`;
                const isBlack = noteName.includes('#');
                
                const keyElement = document.createElement('div');
                keyElement.className = `piano-key ${isBlack ? 'black' : 'white'}`;
                keyElement.textContent = fullNote;
                keyElement.dataset.note = fullNote;
                keyElement.dataset.noteIndex = (octave * 12) + noteIndex - 9; // A0 = 0
                
                // Apply scale highlighting
                if (this.isRootNote(fullNote)) {
                    keyElement.classList.add('root-note');
                } else if (this.isNoteInScale(fullNote)) {
                    keyElement.classList.add('in-scale');
                } else {
                    keyElement.classList.add('out-of-scale');
                }
                
                keyElement.addEventListener('click', () => {
                    this.playPianoRollNote(fullNote);
                });
                
                pianoKeys.appendChild(keyElement);
            }
        }
    }

    updatePianoRollGrid() {
        const noteGrid = document.getElementById('note-grid');
        noteGrid.innerHTML = '';
        
        // Calculate steps based on division
        const divisionsPerBeat = {
            '4n': 1,    // Quarter notes
            '8n': 2,    // Eighth notes
            '16n': 4,   // Sixteenth notes
            '32n': 8    // Thirty-second notes
        };
        
        const stepsPerBeat = divisionsPerBeat[this.pianoRollDivision];
        const totalSteps = 16 * stepsPerBeat; // 4 bars * 4 beats * divisions
        
        // Generate bar numbers
        this.generatePianoRollBarNumbers(totalSteps, stepsPerBeat);
        
        // Generate note rows (from high to low)
        for (let noteIndex = 87; noteIndex >= 0; noteIndex--) {
            const row = document.createElement('div');
            row.className = 'note-row';
            row.style.gridTemplateColumns = `repeat(${totalSteps}, 1fr)`;
            
            // Determine if this is a black or white key
            const noteInOctave = (noteIndex + 9) % 12;
            const isBlack = [1, 3, 6, 8, 10].includes(noteInOctave);
            row.classList.add(isBlack ? 'black' : 'white');
            
            // Apply scale highlighting to the row
            const noteName = this.getNoteNameFromIndex(noteIndex);
            if (this.isRootNote(noteName)) {
                row.classList.add('root-note');
            } else if (this.isNoteInScale(noteName)) {
                row.classList.add('in-scale');
            } else {
                row.classList.add('out-of-scale');
            }
            
            // Create cells for each time step
            for (let step = 0; step < totalSteps; step++) {
                const cell = document.createElement('div');
                cell.className = 'note-cell';
                cell.dataset.noteIndex = noteIndex;
                cell.dataset.step = step;
                
                // Mark beat boundaries
                if (step % stepsPerBeat === 0) {
                    cell.classList.add('beat-marker');
                }
                
                // Check if this note is active
                const track = this.tracks.get(this.currentPianoRollTrackId);
                if (track && track.pianoRoll.has(noteIndex) && track.pianoRoll.get(noteIndex).has(step)) {
                    cell.classList.add('active');
                }
                
                cell.addEventListener('click', () => {
                    this.togglePianoRollNote(noteIndex, step);
                });
                
                row.appendChild(cell);
            }
            
            noteGrid.appendChild(row);
        }
    }

    togglePianoRollNote(noteIndex, step) {
        const track = this.tracks.get(this.currentPianoRollTrackId);
        if (!track) return;
        
        // Initialize piano roll map for this note if it doesn't exist
        if (!track.pianoRoll.has(noteIndex)) {
            track.pianoRoll.set(noteIndex, new Map());
        }
        
        const noteMap = track.pianoRoll.get(noteIndex);
        const cell = document.querySelector(`[data-note-index="${noteIndex}"][data-step="${step}"]`);
        
        if (noteMap.has(step)) {
            // Remove note
            noteMap.delete(step);
            cell.classList.remove('active');
        } else {
            // Add note
            const noteData = {
                note: this.getNoteNameFromIndex(noteIndex),
                velocity: 0.8,
                duration: this.pianoRollDivision
            };
            noteMap.set(step, noteData);
            cell.classList.add('active');
        }
    }

    getNoteNameFromIndex(noteIndex) {
        const noteNames = ['A', 'A#', 'B', 'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#'];
        const octave = Math.floor((noteIndex + 9) / 12);
        const noteInOctave = (noteIndex + 9) % 12;
        return `${noteNames[noteInOctave]}${octave}`;
    }

    async playPianoRollNote(note) {
        await this.initAudio();
        const track = this.tracks.get(this.currentPianoRollTrackId);
        
        if (track && track.synth) {
            try {
                // Handle different instrument types
                switch (track.instrument) {
                    case 'kick':
                        track.synth.triggerAttackRelease('C1', '8n');
                        break;
                    case 'snare':
                        track.synth.triggerAttackRelease('8n');
                        break;
                    case 'hihat':
                        track.synth.triggerAttackRelease('32n');
                        break;
                    case 'noise':
                        track.synth.triggerAttackRelease('8n');
                        break;
                    default:
                        // Regular synths use the note
                        track.synth.triggerAttackRelease(note, '8n');
                        break;
                }
            } catch (error) {
                console.error('Error playing piano roll note:', error);
            }
        }
    }

    generatePianoRollBarNumbers(totalSteps, stepsPerBeat) {
        const barNumbers = document.getElementById('piano-roll-bar-numbers');
        barNumbers.innerHTML = '';
        
        const beatsPerBar = 4;
        const stepsPerBar = beatsPerBar * stepsPerBeat;
        const numBars = Math.ceil(totalSteps / stepsPerBar);
        
        for (let bar = 1; bar <= numBars; bar++) {
            const barLabel = document.createElement('div');
            barLabel.className = 'piano-roll-bar-label';
            barLabel.textContent = bar;
            barLabel.style.width = `${(stepsPerBar / totalSteps) * 100}%`;
            barNumbers.appendChild(barLabel);
        }
    }

    syncPianoRollToSequencer() {
        const track = this.tracks.get(this.currentPianoRollTrackId);
        if (!track) return;
        
        // Clear existing sequencer steps
        track.steps.fill(false);
        
        // Check if there are any notes in the piano roll
        let hasNotes = false;
        track.pianoRoll.forEach(noteMap => {
            if (noteMap.size > 0) {
                hasNotes = true;
            }
        });
        
        if (hasNotes) {
            // If there are piano roll notes, mark the first 16 steps based on piano roll content
            const divisionsPerBeat = {
                '4n': 1, '8n': 2, '16n': 4, '32n': 8
            };
            const stepsPerBeat = divisionsPerBeat[this.pianoRollDivision];
            
            // Map piano roll steps to sequencer steps (16 steps)
            for (let seqStep = 0; seqStep < 16; seqStep++) {
                // Calculate which piano roll step(s) correspond to this sequencer step
                const pianoRollStepStart = seqStep * stepsPerBeat;
                const pianoRollStepEnd = pianoRollStepStart + stepsPerBeat;
                
                // Check if any notes exist in this time range
                let hasNoteInRange = false;
                track.pianoRoll.forEach(noteMap => {
                    for (let prStep = pianoRollStepStart; prStep < pianoRollStepEnd; prStep++) {
                        if (noteMap.has(prStep)) {
                            hasNoteInRange = true;
                            break;
                        }
                    }
                    if (hasNoteInRange) return;
                });
                
                track.steps[seqStep] = hasNoteInRange;
            }
        }
        
        // Update visual representation
        this.updateSequencerVisuals(this.currentPianoRollTrackId);
    }

    updateSequencerVisuals(trackId) {
        const track = this.tracks.get(trackId);
        if (!track) return;
        
        // Update the step buttons to reflect the current state
        for (let step = 0; step < 16; step++) {
            const stepElement = document.querySelector(`[data-step="${step}"][data-track="${trackId}"]`);
            if (stepElement) {
                if (track.steps[step]) {
                    stepElement.classList.add('active');
                } else {
                    stepElement.classList.remove('active');
                }
            }
        }
    }

    updatePianoRollScaleHighlighting() {
        // Only update if piano roll is currently open
        if (this.currentPianoRollTrackId === null) return;
        
        // Update piano keys highlighting
        const pianoKeys = document.querySelectorAll('.piano-key');
        pianoKeys.forEach(keyElement => {
            const noteName = keyElement.dataset.note;
            
            // Remove existing scale classes
            keyElement.classList.remove('in-scale', 'root-note', 'out-of-scale');
            
            // Apply new scale highlighting
            if (this.isRootNote(noteName)) {
                keyElement.classList.add('root-note');
            } else if (this.isNoteInScale(noteName)) {
                keyElement.classList.add('in-scale');
            } else {
                keyElement.classList.add('out-of-scale');
            }
        });
        
        // Update note rows highlighting
        const noteRows = document.querySelectorAll('.note-row');
        noteRows.forEach((row, index) => {
            const noteIndex = 87 - index; // Notes are displayed from high to low
            const noteName = this.getNoteNameFromIndex(noteIndex);
            
            // Remove existing scale classes
            row.classList.remove('in-scale', 'root-note', 'out-of-scale');
            
            // Apply new scale highlighting
            if (this.isRootNote(noteName)) {
                row.classList.add('root-note');
            } else if (this.isNoteInScale(noteName)) {
                row.classList.add('in-scale');
            } else {
                row.classList.add('out-of-scale');
            }
        });
    }

    playTrackStep(track, step, time) {
        // Check if this track has piano roll data for this step
        const hasDetailedNotes = this.hasDetailedNotesForStep(track, step);
        
        if (hasDetailedNotes) {
            // Play detailed piano roll notes
            this.playDetailedNotes(track, step, time);
        } else {
            // Play simple step sequencer note
            this.playSimpleNote(track, time);
        }
    }

    hasDetailedNotesForStep(track, step) {
        // Check if there are any piano roll notes for this sequencer step
        if (track.pianoRoll.size === 0) return false;
        
        const divisionsPerBeat = { '4n': 1, '8n': 2, '16n': 4, '32n': 8 };
        const stepsPerBeat = divisionsPerBeat[this.pianoRollDivision] || 2;
        
        const pianoRollStepStart = step * stepsPerBeat;
        const pianoRollStepEnd = pianoRollStepStart + stepsPerBeat;
        
        for (let noteMap of track.pianoRoll.values()) {
            for (let prStep = pianoRollStepStart; prStep < pianoRollStepEnd; prStep++) {
                if (noteMap.has(prStep)) {
                    return true;
                }
            }
        }
        return false;
    }

    playDetailedNotes(track, step, time) {
        const divisionsPerBeat = { '4n': 1, '8n': 2, '16n': 4, '32n': 8 };
        const stepsPerBeat = divisionsPerBeat[this.pianoRollDivision] || 2;
        
        const pianoRollStepStart = step * stepsPerBeat;
        const pianoRollStepEnd = pianoRollStepStart + stepsPerBeat;
        
        // Play all notes in this time range
        track.pianoRoll.forEach((noteMap, noteIndex) => {
            for (let prStep = pianoRollStepStart; prStep < pianoRollStepEnd; prStep++) {
                if (noteMap.has(prStep)) {
                    const noteData = noteMap.get(prStep);
                    const noteTime = time + (prStep - pianoRollStepStart) * (1 / stepsPerBeat / 4); // Offset within the step
                    
                    // Play the specific note
                    if (track.instrument === 'kick' || track.instrument === 'snare' || track.instrument === 'hihat') {
                        // Drum instruments ignore pitch
                        this.playSimpleNote(track, noteTime);
                    } else {
                        // Synth instruments use the actual note
                        track.synth.triggerAttackRelease(noteData.note, noteData.duration, noteTime, noteData.velocity);
                    }
                }
            }
        });
    }

    playSimpleNote(track, time) {
        // Use appropriate notes/durations for different instruments
        switch (track.instrument) {
            case 'kick':
                track.synth.triggerAttackRelease('C1', '8n', time);
                break;
            case 'snare':
                track.synth.triggerAttackRelease('8n', time);
                break;
            case 'hihat':
                track.synth.triggerAttackRelease('32n', time);
                break;
            case 'noise':
                track.synth.triggerAttackRelease('8n', time);
                break;
            default:
                // Regular synths use C4
                track.synth.triggerAttackRelease('C4', '8n', time);
                break;
        }
    }

    updateStatus(message) {
        document.getElementById('audio-status').textContent = message;
    }

    updatePlaybackPosition() {
        const position = Math.floor(Tone.Transport.seconds);
        const minutes = Math.floor(position / 60);
        const seconds = position % 60;
        document.getElementById('playback-position').textContent = 
            `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
}

let dawInstance;

document.addEventListener('DOMContentLoaded', () => {
    dawInstance = new SoundBytezDAW();
    window.daw = dawInstance; // Make it globally accessible
});

document.addEventListener('keydown', async (e) => {
    if (!dawInstance) return;
    
    const keyMap = {
        'a': 'C4', 'w': 'C#4', 's': 'D4', 'e': 'D#4', 'd': 'E4',
        'f': 'F4', 't': 'F#4', 'g': 'G4', 'y': 'G#4', 'h': 'A4',
        'u': 'A#4', 'j': 'B4'
    };
    
    if (keyMap[e.key.toLowerCase()]) {
        e.preventDefault();
        const note = keyMap[e.key.toLowerCase()];
        const keyElement = document.querySelector(`[data-note="${note}"]`);
        if (keyElement && !keyElement.classList.contains('pressed')) {
            await dawInstance.playNote(note);
        }
    }
    
    if (e.code === 'Space') {
        e.preventDefault();
        document.getElementById('play-btn').click();
    }
});