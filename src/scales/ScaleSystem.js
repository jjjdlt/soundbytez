/**
 * ScaleSystem - Handles musical scale calculations and note validation
 */
export class ScaleSystem {
    constructor(initialKey = 'C', initialScale = 'major') {
        this.currentKey = initialKey;
        this.currentScale = initialScale;
        this.noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        
        // Scale intervals (semitones from root)
        this.scaleIntervals = {
            'major': [0, 2, 4, 5, 7, 9, 11],
            'minor': [0, 2, 3, 5, 7, 8, 10]
        };
        
        this.scaleNotes = this.calculateScaleNotes(this.currentKey, this.currentScale);
        this.onScaleChangeCallbacks = [];
    }

    calculateScaleNotes(key, scaleType) {
        const keyIndex = this.noteNames.indexOf(key);
        const intervals = this.scaleIntervals[scaleType] || this.scaleIntervals['major'];
        const scaleNotes = new Set();
        
        // Generate scale notes across all octaves
        for (let octave = 0; octave <= 8; octave++) {
            intervals.forEach(interval => {
                const noteIndex = (keyIndex + interval) % 12;
                const noteName = this.noteNames[noteIndex];
                scaleNotes.add(`${noteName}${octave}`);
            });
        }
        
        return scaleNotes;
    }

    changeKey(newKey) {
        if (!this.noteNames.includes(newKey)) {
            console.warn(`Invalid key: ${newKey}`);
            return;
        }
        
        this.currentKey = newKey;
        this.scaleNotes = this.calculateScaleNotes(this.currentKey, this.currentScale);
        this.notifyScaleChange();
        console.log(`Key changed to ${newKey} ${this.currentScale}`);
    }

    changeScale(newScale) {
        if (!this.scaleIntervals[newScale]) {
            console.warn(`Invalid scale type: ${newScale}`);
            return;
        }
        
        this.currentScale = newScale;
        this.scaleNotes = this.calculateScaleNotes(this.currentKey, this.currentScale);
        this.notifyScaleChange();
        console.log(`Scale changed to ${this.currentKey} ${newScale}`);
    }

    isNoteInScale(noteName) {
        return this.scaleNotes.has(noteName);
    }

    isRootNote(noteName) {
        // Check if the note starts with the current key
        const noteWithoutOctave = noteName.replace(/\d+$/, '');
        return noteWithoutOctave === this.currentKey;
    }

    getScaleNotes() {
        return Array.from(this.scaleNotes);
    }

    getCurrentKey() {
        return this.currentKey;
    }

    getCurrentScale() {
        return this.currentScale;
    }

    getScaleInfo() {
        return {
            key: this.currentKey,
            scale: this.currentScale,
            notes: this.getScaleNotes()
        };
    }

    // Observer pattern for scale change notifications
    onScaleChange(callback) {
        this.onScaleChangeCallbacks.push(callback);
    }

    notifyScaleChange() {
        this.onScaleChangeCallbacks.forEach(callback => {
            try {
                callback(this.getScaleInfo());
            } catch (error) {
                console.error('Error in scale change callback:', error);
            }
        });
    }

    removeScaleChangeListener(callback) {
        const index = this.onScaleChangeCallbacks.indexOf(callback);
        if (index > -1) {
            this.onScaleChangeCallbacks.splice(index, 1);
        }
    }

    // Get note name from MIDI note index (A0 = 0)
    getNoteNameFromIndex(noteIndex) {
        const noteNames = ['A', 'A#', 'B', 'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#'];
        const octave = Math.floor((noteIndex + 9) / 12);
        const noteInOctave = (noteIndex + 9) % 12;
        return `${noteNames[noteInOctave]}${octave}`;
    }

    // Get all available keys
    getAvailableKeys() {
        return [...this.noteNames];
    }

    // Get all available scale types
    getAvailableScales() {
        return Object.keys(this.scaleIntervals);
    }
}