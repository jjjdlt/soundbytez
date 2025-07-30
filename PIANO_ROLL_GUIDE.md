# Piano Roll Guide

## How to Use the Piano Roll

### Navigation
1. **From Main DAW**: Click the 🎹 piano roll button on any track
2. **Opens**: Dedicated piano roll page (`piano-roll.html?track=X`)
3. **Return**: Click "← Back to DAW" or "Save & Return"

### Piano Roll Features

#### 🎹 **Piano Key Interaction**
- **Click piano keys** (white/black keys on the left) to add notes
- Keys have `data-index` attributes for proper note detection
- Each click adds a note and plays it for audio feedback

#### ⌨️ **Keyboard Shortcuts**
- **A S D F G H J K L**: Lower row scale notes
- **Q W E R T Y U I O P**: Upper row scale notes  
- **Press & hold**: Preview note (shows but doesn't persist)
- **Release**: Hides preview note (unless it's saved)

#### 🎛️ **Controls**
- **Add Note**: Adds test note at C4
- **Clear All**: Removes all notes
- **Play Preview**: Plays all saved notes in sequence
- **Zoom**: +/- buttons (25% to 400%)
- **Play/Stop**: Playback controls (placeholder)

#### 📊 **Visualization**
- **8-bar timeline**: Configured with `setCycle(8)`
- **Horizontal sequencer**: Shows notes as colored bars
- **Real-time highlighting**: Notes light up when played
- **Grid system**: Background grid shows timing divisions

### Technical Details

#### File Structure
```
piano-roll.html          # Main piano roll page
piano-roll.css           # Dedicated styles
src/piano-roll/
  ├── PianoRollPage.js   # Main page logic
  └── PianoRollEditor.js # Legacy (unused)
```

#### Key Classes & Methods
- **`PianoRollPage`**: Main page controller
- **`NoteVisual`**: PianorollVis.js visualization
- **`DrawLoop`**: Animation loop
- **Audio**: Tone.js synth for note playback

#### Data Persistence
- **localStorage**: Saves track data between sessions
- **URL params**: Track ID passed via `?track=X`
- **Return navigation**: Data saved when returning to DAW

### Troubleshooting

#### Common Issues
1. **Notes not highlighting**: Check console for `rect is undefined` errors
2. **No sound**: Verify Tone.js audio context started
3. **Keys not responding**: Ensure SVG elements have `data-index` attributes
4. **Grid not showing**: Verify `setCycle(8)` and `onWindowResize()` called

#### Debug Console Commands
```javascript
// Check available piano keys
document.querySelectorAll('rect[data-index]').length

// Test note visualization
noteVisual.noteOn(60, 'orange')  // C4
noteVisual.noteOff(60)

// Check CONSTANTS
console.log(CONSTANTS.LOWEST_PIANO_KEY_MIDI_NOTE)  // Should be 21
```

### Current Functionality Status
✅ **Working**: Piano key clicks, keyboard shortcuts, note visualization, audio playback  
✅ **Working**: Navigation between pages, data persistence  
✅ **Working**: 8-bar timeline, zoom controls, basic UI  
🔄 **Partial**: Full sequencer playback, advanced editing  
❓ **Unknown**: Complex note editing, velocity/timing adjustments  

### Next Steps for Enhancement
1. Add note editing (drag, resize, delete individual notes)
2. Implement full playback with Tone.js Transport
3. Add velocity/timing controls
4. Improve grid/bar number display
5. Add snap-to-grid functionality