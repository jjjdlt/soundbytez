export class AudioPlayback {
    constructor(daw) {
        this.daw = daw;
    }

    async playNote(note) {
        await this.daw.initAudio();
        
        if (this.daw.synth && note) {
            try {
                console.log(`Playing note: ${note} with ${this.daw.currentInstrument}`);
                
                switch (this.daw.currentInstrument) {
                    case 'kick':
                        this.daw.synth.triggerAttackRelease('C1', '8n');
                        break;
                    case 'snare':
                        this.daw.synth.triggerAttackRelease('8n');
                        break;
                    case 'hihat':
                        this.daw.synth.triggerAttackRelease('32n');
                        break;
                    case 'noise':
                        this.daw.synth.triggerAttackRelease('8n');
                        break;
                    default:
                        this.daw.synth.triggerAttackRelease(note, '8n');
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
    }

    playTrackStep(track, step, time) {
        // Check if we have a specific MIDI note for this step from piano roll
        const midiNote = track.stepNotes && track.stepNotes[step];
        
        if (midiNote) {
            // Play the specific MIDI note from piano roll
            this.playMidiNote(track, midiNote, time);
        } else {
            // Fall back to detailed notes or simple note
            const hasDetailedNotes = this.hasDetailedNotesForStep(track, step);
            
            if (hasDetailedNotes) {
                this.playDetailedNotes(track, step, time);
            } else {
                this.playSimpleNote(track, time);
            }
        }
    }

    hasDetailedNotesForStep(track, step) {
        if (track.pianoRoll.size === 0) return false;
        
        const divisionsPerBeat = { '4n': 1, '8n': 2, '16n': 4, '32n': 8 };
        const stepsPerBeat = divisionsPerBeat[this.daw.pianoRollDivision] || 2;
        
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
        const stepsPerBeat = divisionsPerBeat[this.daw.pianoRollDivision] || 2;
        
        const pianoRollStepStart = step * stepsPerBeat;
        const pianoRollStepEnd = pianoRollStepStart + stepsPerBeat;
        
        track.pianoRoll.forEach((noteMap, noteIndex) => {
            for (let prStep = pianoRollStepStart; prStep < pianoRollStepEnd; prStep++) {
                if (noteMap.has(prStep)) {
                    const noteData = noteMap.get(prStep);
                    const noteTime = time + (prStep - pianoRollStepStart) * (1 / stepsPerBeat / 4);
                    
                    if (track.instrument === 'kick' || track.instrument === 'snare' || track.instrument === 'hihat') {
                        this.playSimpleNote(track, noteTime);
                    } else {
                        track.synth.triggerAttackRelease(noteData.note, noteData.duration, noteTime, noteData.velocity);
                    }
                }
            }
        });
    }

    playMidiNote(track, midiNote, time) {
        // Convert MIDI note number to note name
        const noteName = this.midiToNoteName(midiNote);
        
        if (track.instrument === 'kick' || track.instrument === 'snare' || track.instrument === 'hihat' || track.instrument === 'noise') {
            // For drum instruments, ignore the MIDI note and use instrument-specific notes
            this.playSimpleNote(track, time);
        } else {
            // For melodic instruments, play the specific MIDI note
            track.synth.triggerAttackRelease(noteName, '8n', time);
            console.log(`🎵 Playing MIDI note ${midiNote} (${noteName}) on track ${track.name}`);
        }
    }

    midiToNoteName(midiNote) {
        const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const octave = Math.floor(midiNote / 12) - 1;
        const noteIndex = midiNote % 12;
        return `${noteNames[noteIndex]}${octave}`;
    }

    playSimpleNote(track, time) {
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
                track.synth.triggerAttackRelease('C4', '8n', time);
                break;
        }
    }
}