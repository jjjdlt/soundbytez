export class TrackManager {
    constructor(daw) {
        this.daw = daw;
    }

    async addTrack() {
        await this.daw.initAudio();
        
        console.log(`🔍 Before adding track: ${this.daw.tracks.size} tracks exist`);
        console.log(`🗺️ Current tracks:`, Array.from(this.daw.tracks.keys()));
        
        // Find the lowest available track ID instead of always incrementing
        const trackId = this.findNextAvailableTrackId();
        const displayNumber = this.daw.tracks.size + 1;
        const trackName = `Track ${displayNumber}`;
        
        console.log(`➕ Creating track with ID ${trackId}, display name "${trackName}"`);
        console.log(`📊 Track will be #${displayNumber} of ${this.daw.tracks.size + 1} total`);
        
        this.daw.tracks.set(trackId, {
            id: trackId,
            name: trackName,
            displayNumber: displayNumber,
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
        
        const trackElement = this.createTrackDOM(trackId, trackName);
        document.querySelector('.tracks-container').appendChild(trackElement);
        
        const mixerTrackElement = this.createMixerTrackDOM(trackId, trackName);
        document.getElementById('mixer-tracks').appendChild(mixerTrackElement);
        
        await this.initializeTrackSynth(trackId, 'synth');
        
        // Create initial individual storage for the new track
        this.createInitialTrackStorage(trackId, 'synth');
        
        // Event listeners are handled by event delegation in EventHandlers.js
        // No need to set up individual listeners for each track
        
        // Save the new track structure
        this.daw.saveDAWData();
        
        console.log(`Added ${trackName} with ID ${trackId}`);
    }

    findNextAvailableTrackId() {
        const existingIds = Array.from(this.daw.tracks.keys()).sort((a, b) => a - b);
        console.log(`🔍 Existing track IDs: [${existingIds.join(', ')}]`);

        // Look for actual gaps in the sequence
        for (let i = 0; i < Math.max(...existingIds, -1) + 1; i++) {
            if (!existingIds.includes(i)) {
                console.log(`🎯 Found actual gap at ID ${i}, reusing it`);
                return i;
            }
        }

        // No gaps, use next ID
        const nextId = existingIds.length > 0 ? Math.max(...existingIds) + 1 : 0;
        console.log(`➡️ No gaps found, using next sequential ID: ${nextId}`);
        return nextId;
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
                ${Array.from({length: 32}, (_, i) => {
                    const barDividerClass = [4, 8, 12, 16, 20, 24, 28].includes(i) ? ' bar-divider' : '';
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
        if (!this.daw.audioInitialized) return;
        
        const track = this.daw.tracks.get(trackId);
        if (!track) return;
        
        if (track.synth) track.synth.dispose();
        if (track.volume) track.volume.dispose();
        if (track.panner) track.panner.dispose();
        
        track.volume = new Tone.Volume(-10).toDestination();
        track.panner = new Tone.Panner(0).connect(track.volume);
        
        switch (instrumentType) {
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
        const track = this.daw.tracks.get(trackId);
        console.log(`${track ? track.name : 'Track'} changed to ${instrumentType}`);
        this.daw.saveDAWData();
    }

    deleteTrack(trackId) {
        if (this.daw.tracks.size <= 1) {
            alert('Cannot delete the last track');
            return;
        }
        
        const track = this.daw.tracks.get(trackId);
        if (track) {
            if (track.synth) track.synth.dispose();
            if (track.volume) track.volume.dispose();
            if (track.panner) track.panner.dispose();
        }
        
        this.daw.tracks.delete(trackId);
        
        const trackElement = document.querySelector(`[data-track="${trackId}"].track`);
        if (trackElement) trackElement.remove();
        
        const mixerTrackElement = document.querySelector(`[data-track="${trackId}"].mixer-track`);
        if (mixerTrackElement) mixerTrackElement.remove();
        
        this.renumberTracks();
        
        // Save the updated track structure
        this.daw.saveDAWData();
        
        console.log(`Deleted track, remaining tracks renumbered`);
    }

    renumberTracks() {
        const trackElements = Array.from(document.querySelectorAll('.track'));
        const mixerElements = Array.from(document.querySelectorAll('.mixer-track'));
        
        let displayNumber = 1;
        trackElements.forEach((element, index) => {
            const trackId = parseInt(element.dataset.track);
            const track = this.daw.tracks.get(trackId);
            
            if (track) {
                const newName = `Track ${displayNumber}`;
                track.name = newName;
                track.displayNumber = displayNumber;
                
                const trackNameElement = element.querySelector('.track-name');
                if (trackNameElement) {
                    trackNameElement.textContent = newName;
                }
                
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

    createInitialTrackStorage(trackId, instrumentType) {
        const storageKey = `soundbytez-track-${trackId}`;
        const initialTrackData = {
            trackId: trackId,
            notes: [],
            instrument: instrumentType,
            timestamp: Date.now()
        };
        
        localStorage.setItem(storageKey, JSON.stringify(initialTrackData));
        console.log(`💾 Created initial storage for track ${trackId} with instrument ${instrumentType}`);
    }

    toggleStep(trackId, stepIndex) {
        const track = this.daw.tracks.get(trackId);
        if (!track) return;
        
        track.steps[stepIndex] = !track.steps[stepIndex];
        
        // Clear the stepNote if the step is deactivated
        if (!track.steps[stepIndex]) {
            track.stepNotes[stepIndex] = null;
        }
        
        const stepElement = document.querySelector(`[data-step="${stepIndex}"][data-track="${trackId}"]`);
        
        if (track.steps[stepIndex]) {
            stepElement.classList.add('active');
        } else {
            stepElement.classList.remove('active');
        }
        
        // Save the changes
        this.daw.saveDAWData();
    }

    clearAll() {
        this.daw.tracks.forEach(track => {
            track.steps.fill(false);
            track.stepNotes.fill(null);
        });
        
        document.querySelectorAll('.step').forEach(step => {
            step.classList.remove('active', 'playing');
        });
        this.daw.transport.stop();
        this.daw.saveDAWData();
        console.log('All tracks cleared');
    }

    toggleMute(trackId) {
        const track = this.daw.tracks.get(trackId);
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
        
        this.daw.saveDAWData();
    }

    toggleSolo(trackId) {
        const track = this.daw.tracks.get(trackId);
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
        
        this.daw.saveDAWData();
    }
}