import { TransportControls } from '../transport/TransportControls.js';
import { TrackManager } from '../tracks/TrackManager.js';
import { MixerControls } from '../mixer/MixerControls.js';
import { ScaleSystem } from '../scales/ScaleSystem.js';
import { EventHandlers } from '../ui/EventHandlers.js';
import { KeyboardHandler } from '../ui/KeyboardHandler.js';
import { AudioPlayback } from '../audio/AudioPlayback.js';

export class DAWEngine {
    constructor() {
        this.isPlaying = false;
        this.currentInstrument = 'synth';
        this.synth = null;
        this.sequence = null;
        this.currentStep = 0;
        this.audioInitialized = false;
        this.nextTrackId = 1;
        
        // Track management - will be initialized in loadSavedData or with default track
        this.tracks = new Map();
        
        // Initialize subsystems
        this.transport = new TransportControls(this);
        this.trackManager = new TrackManager(this);
        this.mixer = new MixerControls(this);
        this.scaleSystem = new ScaleSystem(this);
        this.eventHandlers = new EventHandlers(this);
        this.keyboardHandler = new KeyboardHandler(this);
        this.audioPlayback = new AudioPlayback(this);
        
        this.init();
    }

    async init() {
        this.eventHandlers.setupEventListeners();
        this.loadSavedData();
        this.updateStatus('Audio: Click PLAY or any step to start');
    }

    loadSavedData() {
        try {
            const savedData = localStorage.getItem('soundbytez-daw-data');
            if (savedData) {
                const data = JSON.parse(savedData);

                // Check if data looks corrupted
                if (this.isDataCorrupted(data)) {
                    console.warn('🚨 Detected corrupted track data, resetting to clean state');
                    this.resetToCleanState();
                    return;
                }

                // Restore tracks WITHOUT normalization!
                if (data.tracks) {
                    this.restoreTracks(data.tracks);  // ← New function name!
                }

                console.log(`📁 Loaded DAW data: ${this.tracks.size} tracks restored`);
                this.updateTrackVisuals();
            } else {
                this.createDefaultTrack();
            }
        } catch (error) {
            console.error('Error loading saved data:', error);
            this.resetToCleanState();
        }
    }
    
    isDataCorrupted(data) {
        if (!data.tracks) return false;
        
        const tracks = Object.values(data.tracks);
        
        // Check for too many tracks (likely corrupted)
        if (tracks.length > 8) {
            console.log(`🔍 Too many tracks detected: ${tracks.length}`);
            return true;
        }
        
        // Check for inconsistent naming or high track IDs
        const trackIds = tracks.map(t => t.id).sort((a, b) => a - b);
        const maxId = Math.max(...trackIds);
        if (maxId > 10) {
            console.log(`🔍 Suspiciously high track ID detected: ${maxId}`);
            return true;
        }
        
        return false;
    }

    restoreTracks(tracksData) {
        this.tracks.clear();

        // First, restore tracks from main DAW data
        Object.values(tracksData).forEach((trackData) => {
            if (trackData.id !== undefined) {
                const track = {
                    id: trackData.id,
                    name: trackData.name,
                    displayNumber: trackData.displayNumber,
                    instrument: trackData.instrument || 'synth',
                    synth: null,
                    volume: null,
                    panner: null,
                    steps: trackData.steps || Array(32).fill(false),
                    stepNotes: trackData.stepNotes || Array(32).fill(null),
                    pianoRoll: new Map(),
                    muted: trackData.muted || false,
                    soloed: trackData.soloed || false
                };

                // Restore piano roll from main DAW data first
                if (trackData.pianoRoll && Array.isArray(trackData.pianoRoll)) {
                    track.pianoRoll = new Map(trackData.pianoRoll);
                    console.log(`🎵 Restored ${trackData.pianoRoll.length} piano roll notes from main DAW data for track ${trackData.id}`);
                }

                this.tracks.set(trackData.id, track);
                console.log(`📁 Restored track ${trackData.id}: "${track.name}"`);

                // Create DOM elements for tracks that don't exist in HTML (only track 0 is hardcoded)
                if (trackData.id !== 0) {
                    this.createTrackDOMElements(trackData.id, track.name);
                }
            }
        });

        // Then, check individual track storage and merge/override with more recent data
        this.loadIndividualTrackData();
    }

    createTrackDOMElements(trackId, trackName) {
        // Check if DOM elements already exist
        const existingTrackElement = document.querySelector(`[data-track="${trackId}"].track`);
        if (existingTrackElement) {
            console.log(`🏗️ Track ${trackId} DOM elements already exist, skipping creation`);
            return;
        }

        // Create track DOM element using TrackManager's method
        const trackElement = this.trackManager.createTrackDOM(trackId, trackName);
        document.querySelector('.tracks-container').appendChild(trackElement);

        // Create mixer track DOM element
        const mixerTrackElement = this.trackManager.createMixerTrackDOM(trackId, trackName);
        document.getElementById('mixer-tracks').appendChild(mixerTrackElement);

        // Initialize the track's synth if audio is already initialized
        const track = this.tracks.get(trackId);
        if (this.audioInitialized && track) {
            this.trackManager.initializeTrackSynth(trackId, track.instrument);
        }

        console.log(`🏗️ Created DOM elements for restored track ${trackId}: "${trackName}"`);
    }

    updateTrackInstrumentUI(trackId, instrument) {
        // Update the track instrument dropdown to show the correct selection
        const trackInstrumentSelect = document.querySelector(`[data-track="${trackId}"].track-instrument`);
        if (trackInstrumentSelect) {
            trackInstrumentSelect.value = instrument;
            console.log(`🎛️ Updated UI instrument selector for track ${trackId} to ${instrument}`);
        }
    }

    loadIndividualTrackData() {
        console.log('🔍 Checking individual track storage...');

        this.tracks.forEach((track, trackId) => {
            const individualStorageKey = `soundbytez-track-${trackId}`;
            const savedTrackData = localStorage.getItem(individualStorageKey);

            if (savedTrackData) {
                try {
                    const individualData = JSON.parse(savedTrackData);

                    // Check which data is more recent
                    const mainDAWTimestamp = 0; // Main DAW doesn't store timestamps
                    const individualTimestamp = individualData.timestamp || 0;

                    if (individualData.notes && Array.isArray(individualData.notes) && individualData.notes.length > 0) {
                        // Individual storage has piano roll data - use it and update steps
                        track.pianoRoll = new Map(individualData.notes);
                        this.updateStepsFromPianoRoll(track);

                        console.log(`🎵 Updated track ${trackId} with ${individualData.notes.length} notes from individual storage`);
                        console.log(`⏰ Individual storage timestamp: ${new Date(individualTimestamp).toLocaleTimeString()}`);
                    } else {
                        // No piano roll data in individual storage - preserve existing sequencer step data
                        console.log(`📄 No piano roll data in individual storage for track ${trackId} - preserving sequencer steps`);
                        console.log(`🎯 Track ${trackId} has ${track.steps.filter(s => s).length} active sequencer steps preserved`);
                    }
                    
                    // Update instrument if present in individual storage (more recent)
                    if (individualData.instrument) {
                        track.instrument = individualData.instrument;
                        console.log(`🎛️ Updated track ${trackId} instrument to ${individualData.instrument} from individual storage`);
                        
                        // Update the UI to reflect the correct instrument
                        this.updateTrackInstrumentUI(trackId, individualData.instrument);
                        
                        // Re-initialize the synth if audio is already initialized
                        if (this.audioInitialized) {
                            this.trackManager.initializeTrackSynth(trackId, individualData.instrument);
                        }
                    }
                } catch (error) {
                    console.error(`❌ Error loading individual data for track ${trackId}:`, error);
                }
            } else {
                console.log(`📄 No individual storage found for track ${trackId}`);
            }
        });

        // After loading individual data, save the merged state back to main DAW
        this.saveDAWData();
    }

    updateStepsFromPianoRoll(track) {
        // Reset steps and stepNotes
        track.steps = Array(32).fill(false);
        track.stepNotes = Array(32).fill(null);

        // Convert piano roll notes back to step data
        track.pianoRoll.forEach((noteInfo, noteKey) => {
            const { midiNote, step } = noteInfo;
            if (step >= 0 && step < 32) {
                track.steps[step] = true;
                track.stepNotes[step] = midiNote;
            }
        });

        console.log(`🔄 Updated step data for track ${track.id}: ${track.steps.filter(s => s).length} active steps`);
    }
    
    resetToCleanState() {
        console.log('🧹 Resetting to clean state...');
        
        // Clear all localStorage data
        localStorage.removeItem('soundbytez-daw-data');
        
        // Clear any individual track data
        for (let i = 0; i < 20; i++) {
            localStorage.removeItem(`soundbytez-track-${i}`);
        }
        
        // Reset tracks
        this.tracks.clear();
        
        // Create default track
        this.createDefaultTrack();
        
        // Save clean state
        this.saveDAWData();
        
        console.log('✅ Reset complete - starting with clean Track 1');
    }
    
    createDefaultTrack() {
        // Create default track that matches the hardcoded HTML Track 1
        this.tracks.set(0, {
            id: 0,
            name: 'Track 1',
            displayNumber: 1,
            instrument: 'synth',
            synth: null,
            volume: null,
            panner: null,
            steps: Array(32).fill(false),
            stepNotes: Array(32).fill(null),
            pianoRoll: new Map(),
            muted: false,
            soloed: false
        });
        
        // Create initial individual storage for track 0 if it doesn't exist
        const track0StorageKey = 'soundbytez-track-0';
        if (!localStorage.getItem(track0StorageKey)) {
            const initialTrackData = {
                trackId: 0,
                notes: [],
                instrument: 'synth',
                timestamp: Date.now()
            };
            localStorage.setItem(track0StorageKey, JSON.stringify(initialTrackData));
            console.log('💾 Created initial storage for default track 0');
        }

        // Check if we have any saved individual track data for Track 1
        this.loadIndividualTrackData();
        
        console.log('📁 Created default Track 1 (matches hardcoded HTML)');
    }
    
    updateTrackVisuals() {
        // Update the sequencer grid to show loaded notes
        this.tracks.forEach((track, trackId) => {
            track.steps.forEach((isActive, stepIndex) => {
                const stepElement = document.querySelector(`[data-step="${stepIndex}"][data-track="${trackId}"]`);
                if (stepElement) {
                    if (isActive) {
                        stepElement.classList.add('active');
                    } else {
                        stepElement.classList.remove('active');
                    }
                }
            });
        });
    }

    async initAudio() {
        if (this.audioInitialized) return;
        
        try {
            console.log('Starting Tone.js audio context...');
            
            // Ensure audio context is running
            if (Tone.context.state === 'suspended') {
                await Tone.context.resume();
                console.log('AudioContext resumed');
            }
            
            if (Tone.context.state !== 'running') {
                await Tone.start();
                console.log('Tone.js started successfully');
            }
            
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
            
            // Only create sequence if it doesn't exist
            if (!this.sequence) {
                this.sequence = new Tone.Sequence((time, step) => {
                    this.tracks.forEach(track => {
                        if (track.steps[step] && !track.muted && track.synth) {
                            const hassSoloedTracks = Array.from(this.tracks.values()).some(t => t.soloed);
                            
                            if (!hassSoloedTracks || track.soloed) {
                                console.log(`🎵 Playing step ${step} on track ${track.name}`);
                                this.audioPlayback.playTrackStep(track, step, time);
                            }
                        }
                    });
                    this.updateStepIndicator(step);
                }, Array.from({length: 32}, (_, i) => i), '16n');
            }

            Tone.Transport.bpm.value = 120;
            
            // Initialize track synths for all existing tracks
            for (const [trackId, track] of this.tracks.entries()) {
                await this.trackManager.initializeTrackSynth(trackId, track.instrument);
            }
            
            this.audioInitialized = true;
            this.updateStatus('Audio: Ready ✅');
            console.log('✅ Audio initialized successfully');
            
            // Update status back to normal after delay
            setTimeout(() => {
                this.updateStatus('Ready');
            }, 2000);
            
        } catch (error) {
            console.error('❌ Audio initialization failed:', error);
            this.updateStatus('Audio: Error - Click to retry');
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

    saveDAWData() {
        try {
            const dawData = {
                tracks: Object.fromEntries(
                    Array.from(this.tracks.entries()).map(([id, track]) => [
                        id,
                        {
                            id: track.id,
                            name: track.name,
                            instrument: track.instrument,
                            steps: track.steps,
                            stepNotes: track.stepNotes,
                            pianoRoll: Array.from(track.pianoRoll.entries()),
                            muted: track.muted,
                            soloed: track.soloed
                        }
                    ])
                ),
                currentBPM: Tone.Transport.bpm.value,
                currentScale: `${this.scaleSystem.getCurrentKey()} ${this.scaleSystem.getCurrentScale()}`
            };
            
            localStorage.setItem('soundbytez-daw-data', JSON.stringify(dawData));
            console.log('💾 DAW data saved to localStorage');
        } catch (error) {
            console.error('Error saving DAW data:', error);
        }
    }
}