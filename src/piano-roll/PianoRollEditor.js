export class PianoRollEditor {
    constructor(daw) {
        this.daw = daw;
        this.noteVisual = null;
        this.drawLoop = null;
        this.container = null;
        this.currentZoom = 100;
        this.pressedKeys = new Set();
        this.activeNotes = new Map(); // noteNumber -> color
        this.trackNotes = new Map(); // Store notes for current track
    }

    openPianoRoll(trackId) {
        this.daw.currentPianoRollTrackId = trackId;
        const track = this.daw.tracks.get(trackId);
        
        if (track) {
            document.getElementById('piano-roll-title').textContent = `Piano Roll - ${track.name}`;
            const modal = document.getElementById('piano-roll-modal');
            modal.style.display = 'flex';
            
            // Wait for the modal to be visible
            setTimeout(() => {
                this.initializePianoRollVis();
                this.setupZoomControls();
                this.setupKeyboardHandling();
                this.setupPianoRollControls();
                this.loadTrackData(track);
            }, 100);
        }
    }

    closePianoRoll() {
        this.saveTrackData();
        this.cleanup();
        document.getElementById('piano-roll-modal').style.display = 'none';
        this.daw.currentPianoRollTrackId = null;
    }

    initializePianoRollVis() {
        this.container = document.getElementById('piano-roll-container');
        if (!this.container) return;

        // Clear any existing content
        this.container.innerHTML = '';

        // Create the NoteVisual instance with proper parameters
        this.noteVisual = new NoteVisual(
            this.container,  // HTML container div
            'sequencer',     // animation type: 'waterfall' or 'sequencer'
            'horizontal',    // orientation: 'vertical' or 'horizontal'
            -1,              // number of octaves (-1 = auto-calculate based on container)
            1,               // lowest C position (C1)
            -1,              // width (-1 = use container width)
            -1,              // height (-1 = use container height)
            0,               // x position
            0                // y position
        );

        // Set cycle duration for sequencer (8 bars = 8 * 4 = 32 beats)
        this.noteVisual.setCycle(8);

        // Trigger resize to ensure proper grid rendering
        this.noteVisual.onWindowResize();

        // Create and start the draw loop
        this.drawLoop = new DrawLoop(CONSTANTS.REFRESH_RATE);
        this.drawLoop.addDrawFunctionFromVisual(this.noteVisual);
        this.drawLoop.startDrawLoop();
        
        // Start the animation
        this.noteVisual.start();

        // Add click handlers for note input
        this.setupClickToAddNotes();

        console.log('✅ PianorollVis.js initialized with 8-bar cycle');
        console.log('Container:', this.container);
        console.log('NoteVisual:', this.noteVisual);
        console.log('DrawLoop:', this.drawLoop);
        
        // Debug: Check what piano keys are available after initialization
        setTimeout(() => {
            const svgElement = this.container.querySelector('#svg');
            if (svgElement) {
                const pianoKeys = svgElement.querySelectorAll('rect[data-index]');
                const indices = Array.from(pianoKeys).map(key => parseInt(key.getAttribute('data-index')));
                console.log(`Piano keys available - Count: ${pianoKeys.length}, Indices: [${Math.min(...indices)} - ${Math.max(...indices)}]`);
            }
        }, 1500);
    }

    setupZoomControls() {
        const zoomInBtn = document.getElementById('zoom-in-btn');
        const zoomOutBtn = document.getElementById('zoom-out-btn');
        const zoomLevel = document.getElementById('zoom-level');

        if (zoomInBtn && zoomOutBtn && zoomLevel) {
            zoomInBtn.addEventListener('click', () => this.zoomIn());
            zoomOutBtn.addEventListener('click', () => this.zoomOut());
            this.updateZoomDisplay();
        }
    }

    setupPianoRollControls() {
        const addNoteBtn = document.getElementById('add-note-btn');
        const clearNotesBtn = document.getElementById('clear-notes-btn');
        const playPreviewBtn = document.getElementById('play-preview-btn');

        if (addNoteBtn) {
            addNoteBtn.addEventListener('click', () => this.addTestNote());
        }

        if (clearNotesBtn) {
            clearNotesBtn.addEventListener('click', () => this.clearAllNotes());
        }

        if (playPreviewBtn) {
            playPreviewBtn.addEventListener('click', () => this.playPreview());
        }
    }

    setupClickToAddNotes() {
        // Add click listeners to the piano keys for note input
        setTimeout(() => {
            const svgElement = this.container.querySelector('#svg');
            if (svgElement) {
                svgElement.addEventListener('click', (event) => {
                    this.handlePianoClick(event);
                });
                console.log('✅ Piano click handlers setup for SVG:', svgElement);
            } else {
                console.error('❌ SVG element not found in container:', this.container);
            }
        }, 1000); // Increased wait time for SVG creation
    }

    handlePianoClick(event) {
        console.log('Piano click detected:', event.target);
        
        // Get the clicked element
        const target = event.target;
        
        // Check if it's a piano key (uses data-index attribute)
        if (target.tagName === 'rect' && target.hasAttribute('data-index')) {
            const noteIndex = parseInt(target.getAttribute('data-index'));
            console.log('Found piano key with data-index:', noteIndex);
            
            if (!isNaN(noteIndex)) {
                // Convert note index to MIDI note number
                const midiNote = noteIndex + CONSTANTS.LOWEST_PIANO_KEY_MIDI_NOTE;
                const color = this.getColorForNote(midiNote);
                
                // Add note to track
                this.addNoteToTrack(midiNote);
                
                // Show the note visually
                this.showNote(midiNote, color);
                
                // Play the note
                this.playNote(midiNote);
                
                console.log(`Piano key clicked - Note Index: ${noteIndex}, MIDI: ${midiNote}, Color: ${color}`);
                
                console.log(`Added note: ${this.getNoteNameFromMidi(midiNote)} (MIDI: ${midiNote}, Index: ${noteIndex})`);
            } else {
                console.error('Invalid note index:', noteIndex);
            }
        } else {
            console.log('Clicked element is not a piano key. Tag:', target.tagName, 'Has data-index:', target.hasAttribute('data-index'));
            if (target.tagName === 'rect') {
                const allAttrs = Array.from(target.attributes).map(attr => `${attr.name}="${attr.value}"`).join(' ');
                console.log('Element attributes:', allAttrs);
            }
        }
    }

    setupKeyboardHandling() {
        this.boundKeydownHandler = this.handlePianoRollKeydown.bind(this);
        this.boundKeyupHandler = this.handlePianoRollKeyup.bind(this);
        
        document.addEventListener('keydown', this.boundKeydownHandler);
        document.addEventListener('keyup', this.boundKeyupHandler);
    }

    cleanup() {
        // The DrawLoop doesn't have a stopDrawLoop method, so we just clear the reference
        // The animation will continue but won't have any visual to draw
        if (this.drawLoop) {
            this.drawLoop = null;
        }

        // Clear all active notes
        this.clearAllActiveNotes();

        // Remove keyboard handlers
        if (this.boundKeydownHandler) {
            document.removeEventListener('keydown', this.boundKeydownHandler);
        }
        if (this.boundKeyupHandler) {
            document.removeEventListener('keyup', this.boundKeyupHandler);
        }

        // Clear the container
        if (this.container) {
            this.container.innerHTML = '';
        }

        this.noteVisual = null;
        this.pressedKeys.clear();
        this.activeNotes.clear();
    }

    loadTrackData(track) {
        // Clear existing visualization
        this.clearAllActiveNotes();
        this.trackNotes.clear();

        // For now, don't auto-load existing notes to avoid errors
        // The piano roll starts empty and notes are added via user interaction
        console.log(`Piano roll loaded for track: ${track.name}`);
    }

    saveTrackData() {
        const track = this.daw.tracks.get(this.daw.currentPianoRollTrackId);
        if (!track) return;

        // Clear existing piano roll data
        track.pianoRoll.clear();

        // Convert visualization data back to track format
        this.trackNotes.forEach((noteInfo, noteKey) => {
            const { midiNote, step, noteData } = noteInfo;
            const noteIndex = this.midiToNoteIndex(midiNote);
            
            if (!track.pianoRoll.has(noteIndex)) {
                track.pianoRoll.set(noteIndex, new Map());
            }
            
            track.pianoRoll.get(noteIndex).set(step, noteData);
        });

        // Sync to main sequencer
        this.syncToSequencer();
    }

    syncToSequencer() {
        const track = this.daw.tracks.get(this.daw.currentPianoRollTrackId);
        if (!track) return;

        // Clear existing sequencer steps
        track.steps.fill(false);

        // Map piano roll notes to sequencer steps
        this.trackNotes.forEach((noteInfo) => {
            const { step } = noteInfo;
            if (step >= 0 && step < 32) {
                track.steps[step] = true;
            }
        });

        // Update visual representation
        this.updateSequencerVisuals(this.daw.currentPianoRollTrackId);
    }

    updateSequencerVisuals(trackId) {
        const track = this.daw.tracks.get(trackId);
        if (!track) return;

        for (let step = 0; step < 32; step++) {
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

    addNoteToTrack(midiNote, step = null) {
        // If no step specified, use a default step (could be current playback position)
        if (step === null) {
            step = Math.floor(Math.random() * 32); // Random step for now
        }
        
        const color = this.getColorForNote(midiNote);
        const noteKey = `${midiNote}-${step}`;
        
        this.trackNotes.set(noteKey, {
            midiNote,
            step,
            color,
            noteData: {
                note: this.getNoteNameFromMidi(midiNote),
                velocity: 0.8,
                duration: '16n'
            }
        });
        
        console.log(`Added note to track: ${this.getNoteNameFromMidi(midiNote)} at step ${step}`);
    }

    // Visualization methods
    showNote(midiNote, color = 'orange') {
        if (this.noteVisual && typeof this.noteVisual.noteOn === 'function') {
            try {
                this.noteVisual.noteOn(midiNote, color);
                this.activeNotes.set(midiNote, color);
                console.log(`✅ Note shown: MIDI ${midiNote}`);
            } catch (error) {
                console.error(`❌ Error showing note MIDI ${midiNote}:`, error);
            }
        } else {
            console.error('❌ NoteVisual not available or noteOn method missing');
        }
    }

    hideNote(midiNote) {
        if (this.noteVisual && typeof this.noteVisual.noteOff === 'function') {
            try {
                this.noteVisual.noteOff(midiNote);
                this.activeNotes.delete(midiNote);
                console.log(`✅ Note hidden: MIDI ${midiNote}`);
            } catch (error) {
                console.error(`❌ Error hiding note MIDI ${midiNote}:`, error);
            }
        }
    }

    clearAllActiveNotes() {
        this.activeNotes.forEach((color, midiNote) => {
            this.hideNote(midiNote);
        });
        this.activeNotes.clear();
    }

    // Keyboard handling
    handlePianoRollKeydown(e) {
        if (this.daw.currentPianoRollTrackId === null) return;
        
        const key = e.key.toLowerCase();
        const keys = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'];
        
        if (this.pressedKeys.has(key)) return;
        this.pressedKeys.add(key);
        
        const keyIndex = keys.indexOf(key);
        if (keyIndex !== -1) {
            e.preventDefault();
            
            const scaleNotes = this.getScaleNotesForPianoRoll();
            if (keyIndex < scaleNotes.length) {
                const note = scaleNotes[keyIndex];
                const midiNote = this.noteNameToMidi(note);
                const color = this.getColorForNote(midiNote);
                
                // Play the note
                this.playNote(midiNote);
                
                // Show the note in the visualization (temporary preview)
                this.showNote(midiNote, color);
                
                console.log(`Keyboard preview: ${note} -> MIDI ${midiNote}`);
            }
        }
    }

    handlePianoRollKeyup(e) {
        const key = e.key.toLowerCase();
        const keys = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'];
        
        this.pressedKeys.delete(key);
        
        const keyIndex = keys.indexOf(key);
        if (keyIndex !== -1) {
            const scaleNotes = this.getScaleNotesForPianoRoll();
            if (keyIndex < scaleNotes.length) {
                const note = scaleNotes[keyIndex];
                const midiNote = this.noteNameToMidi(note);
                
                // Hide the preview note (only if it's not a saved note)
                const isPersistedNote = Array.from(this.trackNotes.values()).some(noteInfo => noteInfo.midiNote === midiNote);
                if (!isPersistedNote) {
                    this.hideNote(midiNote);
                }
            }
        }
    }

    // Control methods
    addTestNote() {
        // Add a test note at C4
        const midiNote = 60; // C4
        const step = Math.floor(Math.random() * 32); // Random step
        
        // Add to persistent track notes
        const noteKey = `${midiNote}-${step}`;
        this.trackNotes.set(noteKey, {
            midiNote,
            step,
            color: 'orange',
            noteData: {
                note: this.getNoteNameFromMidi(midiNote),
                velocity: 0.8,
                duration: '16n'
            }
        });
        
        // Show the note in visualization (persistent)
        this.showNote(midiNote, 'orange');
        
        // Play the note for feedback
        this.playNote(midiNote);
        
        console.log(`Added test note: ${this.getNoteNameFromMidi(midiNote)} at step ${step}`);
    }

    clearAllNotes() {
        this.clearAllActiveNotes();
        this.trackNotes.clear();
        console.log('Cleared all notes');
    }

    playPreview() {
        // Play all notes in the current track
        this.trackNotes.forEach((noteInfo) => {
            setTimeout(() => {
                this.playNote(noteInfo.midiNote);
            }, noteInfo.step * 100); // Stagger playback
        });
    }

    playNote(midiNote) {
        const track = this.daw.tracks.get(this.daw.currentPianoRollTrackId);
        if (track && track.synth) {
            const noteName = this.getNoteNameFromMidi(midiNote);
            
            try {
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
                        track.synth.triggerAttackRelease(noteName, '8n');
                        break;
                }
            } catch (error) {
                console.error('Error playing piano roll note:', error);
            }
        }
    }

    // Zoom controls
    zoomIn() {
        if (this.currentZoom < 400) {
            this.currentZoom = Math.min(this.currentZoom * 1.25, 400);
            this.applyZoom();
        }
    }

    zoomOut() {
        if (this.currentZoom > 25) {
            this.currentZoom = Math.max(this.currentZoom / 1.25, 25);
            this.applyZoom();
        }
    }

    applyZoom() {
        if (this.container) {
            const scale = this.currentZoom / 100;
            this.container.style.transform = `scale(${scale})`;
            this.container.style.transformOrigin = 'top left';
            this.updateZoomDisplay();
        }
    }

    updateZoomDisplay() {
        const zoomLevel = document.getElementById('zoom-level');
        if (zoomLevel) {
            zoomLevel.textContent = `${Math.round(this.currentZoom)}%`;
        }
    }

    // Helper methods
    getScaleNotesForPianoRoll() {
        const scaleNotes = this.daw.scaleSystem.getScaleNotes();
        return scaleNotes.filter(note => {
            const octave = parseInt(note.slice(-1));
            return octave >= 3 && octave <= 6;
        }).sort((a, b) => {
            const noteToNumber = (note) => {
                const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
                const octave = parseInt(note.slice(-1));
                const noteName = note.slice(0, -1);
                return octave * 12 + noteNames.indexOf(noteName);
            };
            return noteToNumber(a) - noteToNumber(b);
        });
    }

    noteNameToMidi(noteName) {
        const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const octave = parseInt(noteName.slice(-1));
        const noteIndex = noteNames.indexOf(noteName.slice(0, -1));
        return (octave + 1) * 12 + noteIndex;
    }

    getNoteNameFromMidi(midiNote) {
        const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const octave = Math.floor(midiNote / 12) - 1;
        const noteIndex = midiNote % 12;
        return `${noteNames[noteIndex]}${octave}`;
    }

    noteIndexToMidi(noteIndex) {
        return noteIndex + 21; // A0 = 21 in MIDI
    }

    midiToNoteIndex(midiNote) {
        return midiNote - 21;
    }

    getColorForNote(midiNote) {
        const colors = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple'];
        return colors[midiNote % colors.length];
    }

    // Legacy compatibility methods (simplified)
    updatePianoRollScaleHighlighting() {
        // The new library handles its own visual styling
        console.log('Scale highlighting updated');
    }
}