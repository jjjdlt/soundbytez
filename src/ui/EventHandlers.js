export class EventHandlers {
    constructor(daw) {
        this.daw = daw;
    }

    setupEventListeners() {
        document.getElementById('play-btn').addEventListener('click', async () => {
            await this.daw.initAudio();
            this.daw.transport.togglePlay();
        });
        document.getElementById('stop-btn').addEventListener('click', () => this.daw.transport.stop());
        document.getElementById('record-btn').addEventListener('click', async () => {
            await this.daw.initAudio();
            this.daw.transport.toggleRecord();
        });
        document.getElementById('loop-btn').addEventListener('click', () => this.daw.transport.toggleLoop());
        
        document.getElementById('bpm').addEventListener('input', (e) => this.daw.transport.setBPM(e.target.value));
        
        document.getElementById('key-select').addEventListener('change', (e) => this.daw.scaleSystem.changeKey(e.target.value));
        document.getElementById('scale-select').addEventListener('change', (e) => this.daw.scaleSystem.changeScale(e.target.value));
        
        document.querySelectorAll('.instrument-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                await this.selectInstrument(e.target.dataset.instrument);
            });
        });
        
        document.querySelectorAll('.key').forEach(key => {
            key.addEventListener('click', async (e) => {
                await this.daw.audioPlayback.playNote(e.target.dataset.note);
            });
        });
        
        this.setupTrackEventListeners();
        
        document.getElementById('add-track-btn').addEventListener('click', () => this.daw.trackManager.addTrack());
        document.getElementById('clear-all-btn').addEventListener('click', () => this.daw.trackManager.clearAll());
        document.getElementById('reset-daw-btn').addEventListener('click', () => {
            if (confirm('⚠️ This will delete ALL tracks and patterns. Are you sure?')) {
                this.daw.resetToCleanState();
                location.reload(); // Reload page to reflect changes
            }
        });
        
        document.getElementById('master-volume').addEventListener('input', (e) => {
            this.daw.mixer.setMasterVolume(e.target.value);
            document.getElementById('master-volume-value').textContent = e.target.value;
        });
        
        this.setupMixerEventListeners();
        this.setupPianoRollEventListeners();
    }

    setupPianoRollEventListeners() {
        // Only set up piano roll event listeners if the elements exist (on piano roll page)
        const closePianoRoll = document.getElementById('close-piano-roll');
        if (closePianoRoll) {
            closePianoRoll.addEventListener('click', () => {
                this.daw.pianoRoll.closePianoRoll();
            });
        }
        
        const noteDivision = document.getElementById('note-division');
        if (noteDivision) {
            noteDivision.addEventListener('change', (e) => {
                this.daw.pianoRollDivision = e.target.value;
                // Update the piano roll widget's grid settings
                const pianoRollWidget = document.getElementById('piano-roll-widget');
                if (pianoRollWidget) {
                    const divisionsPerBeat = {
                        '4n': 4, '8n': 8, '16n': 16, '32n': 32
                    };
                    const newTimebase = divisionsPerBeat[e.target.value] || 16;
                    pianoRollWidget.setAttribute('timebase', newTimebase);
                }
            });
        }
        
        const pianoRollModal = document.getElementById('piano-roll-modal');
        if (pianoRollModal) {
            pianoRollModal.addEventListener('click', (e) => {
                if (e.target === pianoRollModal) {
                    this.daw.pianoRoll.closePianoRoll();
                }
            });
        }
    }

    setupTrackEventListeners() {
        // ✅ NEW WAY - works for ALL tracks, even dynamically added ones!

        // Use event delegation on the tracks container
        const tracksContainer = document.querySelector('.tracks-container');
        if (tracksContainer) {
            tracksContainer.addEventListener('click', async (e) => {
                const target = e.target;

                // Handle step clicks
                if (target.classList.contains('step')) {
                    await this.daw.initAudio();
                    const trackId = parseInt(target.dataset.track);
                    const stepIndex = parseInt(target.dataset.step);
                    this.daw.trackManager.toggleStep(trackId, stepIndex);
                }

                // Handle mute button clicks
                if (target.classList.contains('track-mute-btn')) {
                    const trackId = parseInt(target.dataset.track);
                    this.daw.trackManager.toggleMute(trackId);
                }

                // Handle solo button clicks
                if (target.classList.contains('track-solo-btn')) {
                    const trackId = parseInt(target.dataset.track);
                    this.daw.trackManager.toggleSolo(trackId);
                }

                // Handle delete button clicks
                if (target.classList.contains('track-delete-btn')) {
                    const trackId = parseInt(target.dataset.track);
                    this.daw.trackManager.deleteTrack(trackId);
                }

                // Handle piano roll button clicks
                if (target.classList.contains('track-piano-roll-btn')) {
                    const trackId = parseInt(target.dataset.track);
                    
                    // Get the current instrument from the track's dropdown before opening piano roll
                    const trackInstrumentSelect = document.querySelector(`[data-track="${trackId}"].track-instrument`);
                    if (trackInstrumentSelect) {
                        const currentInstrument = trackInstrumentSelect.value;
                        const track = this.daw.tracks.get(trackId);
                        if (track) {
                            track.instrument = currentInstrument;
                            console.log(`🎛️ Saving current instrument ${currentInstrument} for track ${trackId} before opening piano roll`);
                            // Save to ensure it's captured
                            this.daw.saveDAWData();
                        }
                    }
                    
                    window.location.href = `piano-roll.html?track=${trackId}`;
                }
            });

            // Handle instrument select changes
            tracksContainer.addEventListener('change', async (e) => {
                if (e.target.classList.contains('track-instrument')) {
                    const trackId = parseInt(e.target.dataset.track);
                    const instrumentType = e.target.value;
                    
                    // Change the instrument in the track manager
                    await this.daw.trackManager.changeTrackInstrument(trackId, instrumentType);
                    
                    // Save instrument to individual track storage immediately
                    this.saveTrackInstrumentToStorage(trackId, instrumentType);
                }
            });
        }

        // Same for mixer controls
        const mixerTracks = document.getElementById('mixer-tracks');
        if (mixerTracks) {
            mixerTracks.addEventListener('input', (e) => {
                if (e.target.classList.contains('track-volume-slider')) {
                    const trackId = parseInt(e.target.dataset.track);
                    const value = e.target.value;
                    this.daw.mixer.setTrackVolume(trackId, value);
                    e.target.nextElementSibling.textContent = value;
                }

                if (e.target.classList.contains('track-pan-slider')) {
                    const trackId = parseInt(e.target.dataset.track);
                    const value = e.target.value;
                    this.daw.mixer.setTrackPan(trackId, value);
                    e.target.nextElementSibling.textContent = value;
                }
            });
        }
    }

    setupMixerEventListeners() {
        document.querySelectorAll('.track-volume-slider').forEach(slider => {
            slider.addEventListener('input', (e) => {
                const trackId = parseInt(e.target.dataset.track);
                const value = e.target.value;
                this.daw.mixer.setTrackVolume(trackId, value);
                e.target.nextElementSibling.textContent = value;
            });
        });
        
        document.querySelectorAll('.track-pan-slider').forEach(slider => {
            slider.addEventListener('input', (e) => {
                const trackId = parseInt(e.target.dataset.track);
                const value = e.target.value;
                this.daw.mixer.setTrackPan(trackId, value);
                e.target.nextElementSibling.textContent = value;
            });
        });
    }

    async selectInstrument(instrumentType) {
        await this.daw.initAudio();
        
        document.querySelectorAll('.instrument-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        document.querySelector(`[data-instrument="${instrumentType}"]`).classList.add('active');
        this.daw.currentInstrument = instrumentType;
        
        if (this.daw.synth) {
            this.daw.synth.dispose();
        }
        
        switch (instrumentType) {
            case 'synth':
                this.daw.synth = new Tone.Synth({
                    oscillator: { type: 'sine' },
                    envelope: { attack: 0.1, decay: 0.2, sustain: 0.3, release: 1 }
                }).toDestination();
                break;
            case 'fm':
                this.daw.synth = new Tone.FMSynth({
                    harmonicity: 3,
                    modulationIndex: 10,
                    oscillator: { type: 'sine' },
                    envelope: { attack: 0.1, decay: 0.2, sustain: 0.3, release: 1 }
                }).toDestination();
                break;
            case 'am':
                this.daw.synth = new Tone.AMSynth({
                    harmonicity: 2,
                    oscillator: { type: 'sine' },
                    envelope: { attack: 0.1, decay: 0.2, sustain: 0.3, release: 1 }
                }).toDestination();
                break;
            case 'noise':
                this.daw.synth = new Tone.NoiseSynth({
                    noise: { type: 'white' },
                    envelope: { attack: 0.005, decay: 0.1, sustain: 0 }
                }).toDestination();
                break;
        }
        
        console.log(`Switched to ${instrumentType} synthesizer`);
    }

    saveTrackInstrumentToStorage(trackId, instrumentType) {
        // Get existing individual track storage or create new
        const storageKey = `soundbytez-track-${trackId}`;
        let trackData = { notes: [], timestamp: Date.now() };
        
        const existingData = localStorage.getItem(storageKey);
        if (existingData) {
            try {
                trackData = JSON.parse(existingData);
            } catch (error) {
                console.error(`Error parsing existing track data for ${trackId}:`, error);
            }
        }
        
        // Update instrument and timestamp
        trackData.instrument = instrumentType;
        trackData.timestamp = Date.now();
        
        // Save back to storage
        localStorage.setItem(storageKey, JSON.stringify(trackData));
        
        console.log(`💾 Saved instrument ${instrumentType} to individual storage for track ${trackId}`);
    }
}