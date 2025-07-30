export class KeyboardHandler {
    constructor(daw) {
        this.daw = daw;
        this.keys = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'];
        this.pressedKeys = new Set();
        
        this.setupKeyboardListeners();
        this.updateScaleDisplay();
        
        // Listen for scale changes
        this.daw.scaleSystem.onScaleChange(() => {
            this.updateScaleDisplay();
        });
    }

    getScaleNotes() {
        const scaleNotes = this.daw.scaleSystem.getScaleNotes();
        
        // Filter to a reasonable range for keyboard mapping (C3 to C7)
        const filteredNotes = scaleNotes.filter(note => {
            const octave = parseInt(note.slice(-1));
            return octave >= 3 && octave <= 6;
        });
        
        return filteredNotes.sort((a, b) => {
            const noteToNumber = (note) => {
                const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
                const octave = parseInt(note.slice(-1));
                const noteName = note.slice(0, -1);
                return octave * 12 + noteNames.indexOf(noteName);
            };
            return noteToNumber(a) - noteToNumber(b);
        });
    }

    updateScaleDisplay() {
        const scaleNotesDisplay = document.getElementById('scale-notes-display');
        if (!scaleNotesDisplay) return;

        const scaleNotes = this.getScaleNotes();
        scaleNotesDisplay.innerHTML = '';

        this.keys.forEach((key, index) => {
            const noteElement = document.createElement('div');
            noteElement.className = 'key-note-mapping';
            
            if (index < scaleNotes.length) {
                const note = scaleNotes[index];
                noteElement.innerHTML = `<span class="key-label">${key.toUpperCase()}</span> → <span class="note-label">${note}</span>`;
                
                // Highlight root notes
                if (this.daw.scaleSystem.isRootNote(note)) {
                    noteElement.classList.add('root-note');
                }
            } else {
                noteElement.innerHTML = `<span class="key-label inactive">${key.toUpperCase()}</span> → <span class="note-label inactive">—</span>`;
                noteElement.classList.add('inactive');
            }
            
            scaleNotesDisplay.appendChild(noteElement);
        });
    }

    setupKeyboardListeners() {
        document.addEventListener('keydown', async (e) => {
            if (!this.daw) return;
            
            const key = e.key.toLowerCase();
            
            // Prevent key repeat
            if (this.pressedKeys.has(key)) return;
            this.pressedKeys.add(key);
            
            const keyIndex = this.keys.indexOf(key);
            if (keyIndex !== -1) {
                e.preventDefault();
                const scaleNotes = this.getScaleNotes();
                
                if (keyIndex < scaleNotes.length) {
                    const note = scaleNotes[keyIndex];
                    const keyElement = document.querySelector(`[data-note="${note}"]`);
                    if (keyElement && !keyElement.classList.contains('pressed')) {
                        await this.daw.audioPlayback.playNote(note);
                    }
                }
            }
            
            if (e.code === 'Space') {
                e.preventDefault();
                document.getElementById('play-btn').click();
            }
        });

        document.addEventListener('keyup', (e) => {
            const key = e.key.toLowerCase();
            this.pressedKeys.delete(key);
        });
    }
}