// No imports needed - we'll use minimal data structures

class PianoRollPage {
    constructor() {
        this.daw = null;
        this.currentTrackId = null;
        this.noteVisual = null;
        this.drawLoop = null;
        this.container = null;
        this.currentZoom = 100;
        this.pressedKeys = new Set();
        this.activeNotes = new Map();
        this.trackNotes = new Map();
        this.isPlaying = false;
        
        // Audio initialization state
        this.audioInitialized = false;
        this.audioContext = null;
        this.synth = null;
        
        this.init();
    }

    async init() {
        console.log('🎹 Initializing Piano Roll Page...');
        
        // Get track info from URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        this.currentTrackId = parseInt(urlParams.get('track')) || '0';
        console.log(`📋 Track ID from URL: ${this.currentTrackId}`);
        
        // Initialize or get DAW data from localStorage
        await this.initializeDAW();
        
        // Set up audio initialization UI (don't initialize audio yet)
        this.setupAudioInitialization();
        
        // Set up the piano roll visualization
        this.initializePianoRoll();
        
        // Set up all event listeners
        this.setupEventListeners();
        
        // Load track data
        this.loadTrackData();
        
        console.log('✅ Piano Roll Page initialized successfully');
        console.log('🎯 Try clicking piano keys or pressing A-L, Q-P keys!');
    }

    async initializeDAW() {
        // Create minimal track data structure
        this.dawData = {
            tracks: new Map(),
            currentBPM: 120,
            currentScale: 'C Major'
        };
        
        // ALWAYS start with a clean slate for this track
        this.trackNotes = new Map();

        // Load saved track data from localStorage if available
        const savedTrackData = localStorage.getItem(`soundbytez-track-${this.currentTrackId}`);
        if (savedTrackData) {
            try {
                const trackData = JSON.parse(savedTrackData);
                // Restore notes from saved data for THIS specific track
                this.trackNotes = new Map(trackData.notes || []);
                
                // Restore instrument from individual storage (this is most recent)
                if (trackData.instrument) {
                    this.currentTrackInstrument = trackData.instrument;
                    console.log(`🎛️ Using instrument from individual storage: ${trackData.instrument}`);
                }
                
                console.log(`📁 Loaded track ${this.currentTrackId} data: ${this.trackNotes.size} notes`);
            } catch (error) {
                console.error('Error loading track data:', error);
                // If there's an error, ensure we start with empty notes
                this.trackNotes = new Map();
            }
        } else {
            console.log(`📄 No saved data for track ${this.currentTrackId}, starting with empty pattern`);
        }
        
        // Load main DAW data for BPM, scale info, and track instrument
        const savedDAWData = localStorage.getItem('soundbytez-daw-data');
        if (savedDAWData) {
            try {
                const dawData = JSON.parse(savedDAWData);
                this.dawData.currentBPM = dawData.currentBPM || 120;
                this.dawData.currentScale = dawData.currentScale || 'C Major';
                
                // Load current track's instrument information
                if (dawData.tracks && dawData.tracks[this.currentTrackId]) {
                    this.currentTrackInstrument = dawData.tracks[this.currentTrackId].instrument;
                } else {
                    this.currentTrackInstrument = null; // Will be set from individual storage if available
                }
                
                console.log('📁 Loaded DAW settings and track instrument from localStorage');
                console.log(`🎛️ Track ${this.currentTrackId} instrument: ${this.currentTrackInstrument}`);
            } catch (error) {
                console.error('Error loading DAW data:', error);
            }
        }
        
        // Set fallback instrument if none was found
        if (!this.currentTrackInstrument) {
            this.currentTrackInstrument = 'synth';
            console.log(`🎛️ No instrument found, defaulting to synth for track ${this.currentTrackId}`);
        }
    }

    setupAudioInitialization() {
        // Show audio initialization status
        this.updateAudioStatus('Click any button to enable audio');
        
        // Set up one-time audio initialization on first user interaction
        this.setupFirstUserGesture();
    }
    
    setupFirstUserGesture() {
        const initializeAudioOnce = async () => {
            if (this.audioInitialized) return;
            
            try {
                console.log('🔊 Initializing audio context after user gesture...');
                
                // Initialize Tone.js audio context
                if (Tone.context.state === 'suspended') {
                    await Tone.context.resume();
                }
                
                if (Tone.context.state !== 'running') {
                    await Tone.start();
                }
                
                // Create synth for note playback
                this.synth = new Tone.Synth({
                    oscillator: { type: 'sine' },
                    envelope: {
                        attack: 0.02,
                        decay: 0.1,
                        sustain: 0.3,
                        release: 0.5
                    }
                }).toDestination();
                
                this.audioInitialized = true;
                this.updateAudioStatus('Audio ready');
                
                console.log('✅ Audio context initialized successfully');
                
                // Remove listeners after first initialization
                this.removeAudioInitListeners();
                
            } catch (error) {
                console.error('❌ Error initializing audio:', error);
                this.updateAudioStatus('Audio initialization failed');
            }
        };
        
        // Store reference for cleanup
        this.audioInitHandler = initializeAudioOnce;
        
        // Add listeners to various user interaction elements
        const interactiveElements = [
            document.body,
            document.getElementById('piano-roll-visualization'),
            document.getElementById('add-note-btn'),
            document.getElementById('play-btn'),
            document.getElementById('play-preview-btn')
        ].filter(el => el !== null);
        
        interactiveElements.forEach(element => {
            ['click', 'keydown', 'touchstart'].forEach(eventType => {
                element.addEventListener(eventType, this.audioInitHandler, { once: true });
            });
        });
        
        // Store elements for cleanup
        this.audioInitElements = interactiveElements;
    }
    
    removeAudioInitListeners() {
        if (this.audioInitElements && this.audioInitHandler) {
            this.audioInitElements.forEach(element => {
                ['click', 'keydown', 'touchstart'].forEach(eventType => {
                    element.removeEventListener(eventType, this.audioInitHandler);
                });
            });
        }
    }
    
    updateAudioStatus(message) {
        // Update footer message with visual feedback
        const footerCenter = document.querySelector('.footer-center .keyboard-hint');
        if (footerCenter) {
            // Store original content if not already stored
            if (!this.originalFooterContent) {
                this.originalFooterContent = footerCenter.innerHTML;
            }
            
            // Update content and styling based on status
            if (message.includes('Click any button')) {
                footerCenter.innerHTML = `🎵 ${message} | ${this.originalFooterContent}`;
                footerCenter.className = 'keyboard-hint audio-initializing';
            } else if (message === 'Audio ready') {
                footerCenter.innerHTML = `✅ ${message} | ${this.originalFooterContent}`;
                footerCenter.className = 'keyboard-hint audio-ready';
                
                // Restore original content after delay
                setTimeout(() => {
                    footerCenter.innerHTML = this.originalFooterContent;
                    footerCenter.className = 'keyboard-hint';
                }, 2000);
            } else if (message.includes('failed')) {
                footerCenter.innerHTML = `❌ ${message} | ${this.originalFooterContent}`;
                footerCenter.className = 'keyboard-hint';
            }
        }
    }

    initializePianoRoll() {
        this.container = document.getElementById('piano-roll-visualization');
        if (!this.container) {
            console.error('❌ Piano roll container not found');
            return;
        }

        // Clear any existing content
        this.container.innerHTML = '';

        try {
            // Create the NoteVisual instance
            this.noteVisual = new NoteVisual(
                this.container,
                'sequencer',     // animation type
                'horizontal',    // orientation
                -1,              // number of octaves (-1 = auto-calculate)
                1,               // lowest C position (C1)
                -1,              // width (-1 = use container width)
                -1,              // height (-1 = use container height)
                0,               // x position
                0                // y position
            );

            // Set 8-bar cycle
            this.noteVisual.setCycle(8);

            // Create and start the draw loop
            this.drawLoop = new DrawLoop(CONSTANTS.REFRESH_RATE);
            this.drawLoop.addDrawFunctionFromVisual(this.noteVisual);
            this.drawLoop.startDrawLoop();

            // Start the visualization
            this.noteVisual.start();

            console.log('✅ Piano roll visualization initialized');
            
            // Simple working initialization with debug logging
            setTimeout(() => {
                console.log('🔄 Step 1: First resize');
                this.noteVisual.onWindowResize();
            }, 100);
            
            setTimeout(() => {
                console.log('🔄 Step 2: Second resize + render');
                this.noteVisual.onWindowResize();
                this.forceVisualizationRender();
            }, 500);
            
            // Set up click handlers and grid
            setTimeout(() => {
                console.log('🔄 Step 3: Setting up grid and handlers');
                this.setupPianoClickHandlers();
                this.addCustomGrid();
                this.container.classList.add('loaded');
                this.displayExistingNotes();
                console.log('✅ Piano roll fully ready! Click grid cells to add notes.');
            }, 1200);

        } catch (error) {
            console.error('❌ Error initializing piano roll:', error);
        }
    }

    forceVisualizationRender() {
        try {
            // Force the visualization to render properly
            if (this.noteVisual && this.noteVisual.piano) {
                this.noteVisual.piano.draw();
                if (typeof this.noteVisual.piano.drawBackgroundGrid === 'function') {
                    this.noteVisual.piano.drawBackgroundGrid();
                }
                console.log('🔄 Forced visualization render');
            }
        } catch (error) {
            console.error('Error forcing visualization render:', error);
        }
    }
    

    addCustomGrid() {
        const svgElement = this.container.querySelector('#svg');
        if (!svgElement) return;

        // Remove existing custom grid
        const existingGrid = svgElement.querySelector('.custom-grid');
        if (existingGrid) existingGrid.remove();

        // Create custom grid group
        const gridGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        gridGroup.setAttribute('class', 'custom-grid');

        const svgRect = svgElement.getBoundingClientRect();
        const pianoWidth = 100; // Width of piano keys area
        const gridStartX = pianoWidth;
        const gridWidth = svgRect.width - pianoWidth;
        const gridHeight = svgRect.height;

        // 8 bars, 4 cells per bar = 32 cells total
        const cellWidth = gridWidth / 32;
        
        // Add bar headers
        this.addBarHeaders(gridGroup, gridStartX, cellWidth);
        
        // Add vertical grid lines
        for (let i = 0; i <= 32; i++) {
            const x = gridStartX + (i * cellWidth);
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', x);
            line.setAttribute('y1', 30); // Start below header
            line.setAttribute('x2', x);
            line.setAttribute('y2', gridHeight);
            
            // Bold line every 4 cells (bar divisions)
            if (i % 4 === 0) {
                line.setAttribute('stroke', '#666666');
                line.setAttribute('stroke-width', '2');
            } else {
                line.setAttribute('stroke', '#404040');
                line.setAttribute('stroke-width', '1');
            }
            
            gridGroup.appendChild(line);
        }
        
        // Add clickable grid cells
        this.addGridCells(gridGroup, gridStartX, cellWidth, gridHeight);
        
        svgElement.appendChild(gridGroup);
        console.log('✅ Custom grid added with 8 bars, 4 cells per bar');
    }

    addBarHeaders(gridGroup, startX, cellWidth) {
        // Add header background
        const headerBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        headerBg.setAttribute('x', startX);
        headerBg.setAttribute('y', 0);
        headerBg.setAttribute('width', cellWidth * 32);
        headerBg.setAttribute('height', 30);
        headerBg.setAttribute('fill', '#333333');
        headerBg.setAttribute('stroke', '#555555');
        headerBg.setAttribute('stroke-width', '1');
        gridGroup.appendChild(headerBg);
        
        // Add bar numbers (1-8)
        for (let bar = 0; bar < 8; bar++) {
            const x = startX + (bar * cellWidth * 4) + (cellWidth * 2); // Center of each bar
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', x);
            text.setAttribute('y', 20);
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('fill', '#cccccc');
            text.setAttribute('font-size', '12');
            text.setAttribute('font-weight', 'bold');
            text.textContent = bar + 1;
            gridGroup.appendChild(text);
        }
    }

    addGridCells(gridGroup, startX, cellWidth, gridHeight) {
        const pianoKeys = this.container.querySelectorAll('rect[data-index]');
        if (pianoKeys.length === 0) return;
        
        // Create clickable cells for each piano key row
        pianoKeys.forEach(pianoKey => {
            const noteIndex = parseInt(pianoKey.getAttribute('data-index'));
            const keyY = parseFloat(pianoKey.getAttribute('y'));
            const keyHeight = parseFloat(pianoKey.getAttribute('height'));
            
            // Create 32 cells (8 bars × 4 cells) for this note row
            for (let cell = 0; cell < 32; cell++) {
                const cellX = startX + (cell * cellWidth);
                const cellRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                
                cellRect.setAttribute('x', cellX);
                cellRect.setAttribute('y', keyY);
                cellRect.setAttribute('width', cellWidth);
                cellRect.setAttribute('height', keyHeight);
                cellRect.setAttribute('fill', 'transparent');
                cellRect.setAttribute('stroke', '#404040');
                cellRect.setAttribute('stroke-width', '0.5');
                cellRect.setAttribute('class', 'grid-cell');
                cellRect.setAttribute('data-note-index', noteIndex);
                cellRect.setAttribute('data-cell', cell);
                cellRect.setAttribute('data-bar', Math.floor(cell / 4));
                cellRect.setAttribute('data-beat', cell % 4);
                
                // Add hover effect
                cellRect.style.cursor = 'pointer';
                
                // Add click handler for this cell
                cellRect.addEventListener('click', (e) => {
                    this.handleGridCellClick(e, noteIndex, cell);
                });
                
                cellRect.addEventListener('mouseenter', (e) => {
                    if (!e.target.classList.contains('active-note')) {
                        e.target.setAttribute('fill', 'rgba(0, 122, 204, 0.2)');
                    }
                });
                
                cellRect.addEventListener('mouseleave', (e) => {
                    if (!e.target.classList.contains('active-note')) {
                        e.target.setAttribute('fill', 'transparent');
                    }
                });
                
                gridGroup.appendChild(cellRect);
            }
        });
    }

    setupPianoClickHandlers() {
        const svgElement = this.container.querySelector('#svg');
        if (svgElement) {
            svgElement.addEventListener('click', (event) => {
                // Only handle piano key clicks, not grid cell clicks
                if (event.target.getAttribute('data-index') && !event.target.classList.contains('grid-cell')) {
                    this.handlePianoClick(event);
                }
            });
            
            // Debug: Log available piano keys
            const pianoKeys = svgElement.querySelectorAll('rect[data-index]');
            const indices = Array.from(pianoKeys).map(key => parseInt(key.getAttribute('data-index')));
            console.log(`🎹 Piano keys available: ${pianoKeys.length} keys, range: ${Math.min(...indices)} - ${Math.max(...indices)}`);
        } else {
            console.error('❌ SVG element not found for click handlers');
        }
    }

    handlePianoClick(event) {
        const target = event.target;
        
        if (target.tagName === 'rect' && target.hasAttribute('data-index')) {
            const noteIndex = parseInt(target.getAttribute('data-index'));
            
            if (!isNaN(noteIndex)) {
                const midiNote = noteIndex + CONSTANTS.LOWEST_PIANO_KEY_MIDI_NOTE;
                const color = this.getColorForNote(midiNote);
                
                console.log(`🎵 Piano key clicked: Index ${noteIndex}, MIDI ${midiNote}`);
                
                // Just play the note for preview, don't add to track
                this.playNote(midiNote);
                
                // Show temporary visual feedback
                this.showNote(midiNote, color);
                setTimeout(() => {
                    this.hideNote(midiNote);
                }, 300);
            }
        }
    }
    
    handleGridCellClick(event, noteIndex, cell) {
        event.stopPropagation();
        
        const midiNote = noteIndex + CONSTANTS.LOWEST_PIANO_KEY_MIDI_NOTE;
        const color = this.getColorForNote(midiNote);
        const bar = Math.floor(cell / 4) + 1;
        const beat = (cell % 4) + 1;
        
        console.log(`🎵 Grid cell clicked: Note ${this.midiToNoteName(midiNote)}, Bar ${bar}, Beat ${beat}`);
        
        // Toggle note in this cell
        const noteKey = `${midiNote}-${cell}`;
        if (this.trackNotes.has(noteKey)) {
            // Remove note
            this.trackNotes.delete(noteKey);
            event.target.setAttribute('fill', 'transparent');
            event.target.classList.remove('active-note');
            console.log(`➖ Removed note from Bar ${bar}, Beat ${beat}`);
        } else {
            // Add note
            this.addNote(midiNote, cell);
            event.target.setAttribute('fill', color);
            event.target.classList.add('active-note');
            console.log(`➕ Added note to Bar ${bar}, Beat ${beat}`);
        }
        
        // Play the note for feedback
        this.playNote(midiNote);
    }

    setupEventListeners() {
        // Navigation buttons
        document.getElementById('back-to-daw')?.addEventListener('click', () => {
            this.saveAndReturn();
        });

        document.getElementById('save-and-return-btn')?.addEventListener('click', () => {
            this.saveAndReturn();
        });

        // Zoom controls
        document.getElementById('zoom-in-btn')?.addEventListener('click', () => {
            this.zoomIn();
        });

        document.getElementById('zoom-out-btn')?.addEventListener('click', () => {
            this.zoomOut();
        });

        // Tool buttons
        document.getElementById('add-note-btn')?.addEventListener('click', () => {
            this.addTestNote();
        });

        document.getElementById('clear-notes-btn')?.addEventListener('click', () => {
            this.clearAllNotes();
        });

        document.getElementById('play-preview-btn')?.addEventListener('click', () => {
            this.playPreview();
        });

        // Playback controls
        document.getElementById('play-btn')?.addEventListener('click', () => {
            // Force visualization to render if it hasn't already (fallback)
            if (!this.container.classList.contains('loaded')) {
                console.log('🔄 Fallback: Loading piano roll via play button...');
                this.forceVisualizationRender();
                setTimeout(() => {
                    this.addCustomGrid();
                    this.container.classList.add('loaded');
                    this.displayExistingNotes();
                    console.log('✅ Piano roll loaded via fallback!');
                }, 500);
            }
            this.togglePlayback();
        });

        document.getElementById('stop-btn')?.addEventListener('click', () => {
            this.stopPlayback();
        });

        // Keyboard events
        document.addEventListener('keydown', (e) => this.handleKeydown(e));
        document.addEventListener('keyup', (e) => this.handleKeyup(e));

        // Window resize
        window.addEventListener('resize', () => {
            if (this.noteVisual) {
                this.noteVisual.onWindowResize();
            }
        });

        console.log('✅ Event listeners set up');
    }

    handleKeydown(e) {
        const key = e.key.toLowerCase();
        const keys = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'];
        
        if (this.pressedKeys.has(key)) return;
        this.pressedKeys.add(key);
        
        const keyIndex = keys.indexOf(key);
        if (keyIndex !== -1) {
            e.preventDefault();
            
            // Get scale notes (simplified for now)
            const scaleNotes = this.getScaleNotes();
            if (keyIndex < scaleNotes.length) {
                const midiNote = scaleNotes[keyIndex];
                const color = this.getColorForNote(midiNote);
                
                // Play preview
                this.playNote(midiNote);
                this.showNote(midiNote, color);
                
                console.log(`⌨️ Keyboard preview: Key ${key.toUpperCase()} -> MIDI ${midiNote}`);
            }
        }
    }

    handleKeyup(e) {
        const key = e.key.toLowerCase();
        const keys = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'];
        
        this.pressedKeys.delete(key);
        
        const keyIndex = keys.indexOf(key);
        if (keyIndex !== -1) {
            const scaleNotes = this.getScaleNotes();
            if (keyIndex < scaleNotes.length) {
                const midiNote = scaleNotes[keyIndex];
                
                // Hide preview note (if not persisted)
                const isPersisted = Array.from(this.trackNotes.values()).some(note => note.midiNote === midiNote);
                if (!isPersisted) {
                    this.hideNote(midiNote);
                }
            }
        }
    }

    getScaleNotes() {
        // Generate C major scale for now (can be made configurable later)
        const rootNote = 48; // C3
        const majorScale = [0, 2, 4, 5, 7, 9, 11]; // Major scale intervals
        const notes = [];
        
        // Generate 3 octaves of scale notes
        for (let octave = 0; octave < 3; octave++) {
            for (let interval of majorScale) {
                notes.push(rootNote + (octave * 12) + interval);
            }
        }
        
        return notes.slice(0, 19); // Limit to 19 notes for our key layout
    }

    addNote(midiNote, step = null) {
        // Add note to current step or random step
        if (step === null) {
            step = Math.floor(Math.random() * 32);
        }
        
        const noteKey = `${midiNote}-${step}`;
        this.trackNotes.set(noteKey, {
            midiNote,
            step,
            color: this.getColorForNote(midiNote),
            velocity: 0.8,
            duration: '8n'
        });
        
        const bar = Math.floor(step / 4) + 1;
        const beat = (step % 4) + 1;
        console.log(`➕ Added note: ${this.midiToNoteName(midiNote)} at Bar ${bar}, Beat ${beat}`);
    }

    addTestNote() {
        const midiNote = 60; // C4
        const color = this.getColorForNote(midiNote);
        
        this.addNote(midiNote);
        this.showNote(midiNote, color);
        this.playNote(midiNote);
        
        console.log('🧪 Test note added');
    }

    clearAllNotes() {
        this.trackNotes.clear();
        this.activeNotes.forEach((color, midiNote) => {
            this.hideNote(midiNote);
        });
        
        // Also clear all grid cell visuals
        this.container.querySelectorAll('.grid-cell').forEach(cell => {
            cell.setAttribute('fill', 'transparent');
            cell.classList.remove('active-note');
        });
        
        console.log(`🧹 All notes cleared for track ${this.currentTrackId}`);
    }

    showNote(midiNote, color = 'orange') {
        if (this.noteVisual && typeof this.noteVisual.noteOn === 'function') {
            try {
                this.noteVisual.noteOn(midiNote, color);
                this.activeNotes.set(midiNote, color);
            } catch (error) {
                console.error(`❌ Error showing note ${midiNote}:`, error);
            }
        }
    }

    hideNote(midiNote) {
        if (this.noteVisual && typeof this.noteVisual.noteOff === 'function') {
            try {
                this.noteVisual.noteOff(midiNote);
                this.activeNotes.delete(midiNote);
            } catch (error) {
                console.error(`❌ Error hiding note ${midiNote}:`, error);
            }
        }
    }

    async playNote(midiNote) {
        // Ensure audio is initialized before playing
        if (!this.audioInitialized) {
            console.log('🔊 Audio not initialized, attempting to initialize...');
            await this.audioInitHandler?.();
        }
        
        if (!this.synth || !this.audioInitialized) {
            console.warn('⚠️ Audio system not ready');
            return;
        }
        
        try {
            const noteName = this.midiToNoteName(midiNote);
            this.synth.triggerAttackRelease(noteName, '8n');
        } catch (error) {
            console.error(`❌ Error playing note ${midiNote}:`, error);
        }
    }

    playPreview() {
        console.log('🎵 Playing preview...');
        this.trackNotes.forEach((noteInfo, index) => {
            setTimeout(() => {
                this.playNote(noteInfo.midiNote);
            }, noteInfo.step * 125); // 125ms per step for preview
        });
    }

    togglePlayback() {
        const playBtn = document.getElementById('play-btn');
        if (this.isPlaying) {
            this.stopPlayback();
        } else {
            this.startPlayback();
            playBtn?.classList.add('active');
        }
    }

    startPlayback() {
        this.isPlaying = true;
        console.log('▶️ Playback started');
    }

    stopPlayback() {
        this.isPlaying = false;
        const playBtn = document.getElementById('play-btn');
        playBtn?.classList.remove('active');
        console.log('⏹️ Playback stopped');
    }

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
            
            const zoomLevel = document.getElementById('zoom-level');
            if (zoomLevel) {
                zoomLevel.textContent = `${Math.round(this.currentZoom)}%`;
            }
        }
    }

    loadTrackData() {
        // Update UI with current track info
        const trackTitle = document.getElementById('track-title');
        if (trackTitle) {
            trackTitle.textContent = `Piano Roll - Track ${parseInt(this.currentTrackId) + 1}`;
        }
        
        // Update BPM and scale display
        const bpmElement = document.getElementById('current-bpm');
        const scaleElement = document.getElementById('current-scale');
        
        if (bpmElement) bpmElement.textContent = this.dawData.currentBPM;
        if (scaleElement) scaleElement.textContent = this.dawData.currentScale;
        
        console.log(`📂 Loaded track ${this.currentTrackId} data`);
    }
    
    displayExistingNotes() {
        // First, clear all existing note visuals from the grid
        this.container.querySelectorAll('.grid-cell').forEach(cell => {
            cell.setAttribute('fill', 'transparent');
            cell.classList.remove('active-note');
        });
        
        // Then display the notes for the current track
        this.trackNotes.forEach((noteInfo, noteKey) => {
            const { midiNote, step } = noteInfo;
            
            // Find the corresponding grid cell and mark it as active
            const noteIndex = midiNote - CONSTANTS.LOWEST_PIANO_KEY_MIDI_NOTE;
            const gridCell = this.container.querySelector(`[data-note-index="${noteIndex}"][data-cell="${step}"]`);
            
            if (gridCell) {
                const color = this.getColorForNote(midiNote);
                gridCell.setAttribute('fill', color);
                gridCell.classList.add('active-note');
            }
        });
        
        if (this.trackNotes.size > 0) {
            console.log(`🎵 Displayed ${this.trackNotes.size} existing notes for track ${this.currentTrackId}`);
        } else {
            console.log(`📄 No existing notes to display for track ${this.currentTrackId}`);
        }
    }

    saveAndReturn() {
        console.log('💾 Saving track data...');
        
        // Save current track piano roll data
        const trackData = {
            trackId: this.currentTrackId,
            notes: Array.from(this.trackNotes.entries()),
            instrument: this.currentTrackInstrument || 'synth',
            timestamp: Date.now()
        };
        
        localStorage.setItem(`soundbytez-track-${this.currentTrackId}`, JSON.stringify(trackData));
        
        // Also save in main DAW format for immediate playback
        this.saveToMainDAWFormat();
        
        console.log(`💾 Saved ${this.trackNotes.size} notes to track ${this.currentTrackId}`);
        
        // Add a small delay to ensure localStorage write completes
        setTimeout(() => {
            // Navigate back to main DAW
            window.location.href = 'index.html';
        }, 100);
    }
    
    saveToMainDAWFormat() {
        console.log(`🔄 Starting conversion to main DAW format for track ${this.currentTrackId}...`);
        console.log('Track notes to convert:', this.trackNotes.size);
        
        // Load existing DAW data
        let dawData = {};
        const existingData = localStorage.getItem('soundbytez-daw-data');
        if (existingData) {
            try {
                dawData = JSON.parse(existingData);
                console.log('📁 Loaded existing DAW data for piano roll save');
                console.log('📊 Existing tracks before save:', Object.keys(dawData.tracks || {}));
                
                // Debug: Log existing track data to see what we're preserving
                Object.entries(dawData.tracks || {}).forEach(([trackId, track]) => {
                    const activeSteps = track.steps ? track.steps.filter(s => s).length : 0;
                    console.log(`🔍 Track ${trackId}: ${activeSteps} active steps, instrument: ${track.instrument}`);
                });
            } catch (error) {
                console.error('Error parsing existing DAW data:', error);
            }
        } else {
            console.log('📄 No existing DAW data found');
        }
        
        // Initialize tracks if not exists
        if (!dawData.tracks) {
            dawData.tracks = {};
        }
        
        // Convert piano roll notes to step data with MIDI note information
        const steps = Array(32).fill(false);
        const stepNotes = Array(32).fill(null); // Store the MIDI note for each step
        
        // Debug: log what notes we're converting
        console.log('Notes being converted:');
        this.trackNotes.forEach((noteInfo, noteKey) => {
            const { midiNote, step } = noteInfo;
            console.log(`  ${noteKey}: MIDI ${midiNote} at step ${step}`);
            
            // Mark the step as active and store the MIDI note
            if (step >= 0 && step < 32) {
                steps[step] = true;
                stepNotes[step] = midiNote;
                console.log(`  ✅ Activated step ${step} with MIDI note ${midiNote}`);
            }
        });
        
        console.log('Final steps array:', steps.map((active, i) => active ? i : null).filter(x => x !== null));
        console.log('Step notes array:', stepNotes.map((note, i) => note ? `${i}:${note}` : null).filter(x => x !== null));
        
        // Convert piano roll notes to array format for serialization
        const pianoRollArray = Array.from(this.trackNotes.entries());
        
        // Save track data in DAW format with enhanced step data
        // CRITICAL: Only update the current track, preserve ALL existing track data
        const existingTrack = dawData.tracks[this.currentTrackId] || {};
        
        // Preserve ALL existing properties and only update what's necessary
        dawData.tracks[this.currentTrackId] = {
            // Copy all existing properties first
            ...existingTrack,
            // Then override only what we need to update
            id: parseInt(this.currentTrackId),
            name: existingTrack.name || `Track ${parseInt(this.currentTrackId) + 1}`,
            displayNumber: existingTrack.displayNumber || (parseInt(this.currentTrackId) + 1),
            instrument: existingTrack.instrument || this.currentTrackInstrument || 'synth',
            steps: steps, // Update steps from piano roll
            stepNotes: stepNotes, // Update step notes from piano roll  
            pianoRoll: pianoRollArray, // Update piano roll data
            // Preserve existing mute/solo state
            muted: existingTrack.muted || false,
            soloed: existingTrack.soloed || false
        };
        
        console.log(`🔄 Updated track ${this.currentTrackId} in DAW data`);
        console.log('📊 All tracks in DAW data after update:', Object.keys(dawData.tracks));
        console.log(`🎛️ Track ${this.currentTrackId} instrument: ${dawData.tracks[this.currentTrackId].instrument}`);
        
        // Preserve BPM and scale settings - DON'T overwrite with defaults!
        if (this.dawData.currentBPM) {
            dawData.currentBPM = this.dawData.currentBPM;
        }
        if (this.dawData.currentScale) {
            dawData.currentScale = this.dawData.currentScale;
        }
        
        // Save back to localStorage
        localStorage.setItem('soundbytez-daw-data', JSON.stringify(dawData));
        
        console.log(`✅ Saved track ${this.currentTrackId} with ${steps.filter(s => s).length} active steps and note data`);
        console.log('📊 Final tracks in localStorage:', Object.keys(dawData.tracks));
        
        // Debug: Log final state of all tracks to verify preservation
        Object.entries(dawData.tracks).forEach(([trackId, track]) => {
            const activeSteps = track.steps ? track.steps.filter(s => s).length : 0;
            console.log(`🔍 Final Track ${trackId}: ${activeSteps} active steps, instrument: ${track.instrument}`);
        });
        
        console.log(`🎵 Final BPM: ${dawData.currentBPM}, Scale: ${dawData.currentScale}`);
    }

    getColorForNote(midiNote) {
        const colors = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple'];
        return colors[midiNote % colors.length];
    }

    midiToNoteName(midiNote) {
        const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const octave = Math.floor(midiNote / 12) - 1;
        const noteIndex = midiNote % 12;
        return `${noteNames[noteIndex]}${octave}`;
    }
}

// Initialize the piano roll page when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new PianoRollPage();
});