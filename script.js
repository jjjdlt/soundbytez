import { DAWEngine } from './src/core/DAWEngine.js';

class SoundBytezDAW extends DAWEngine {
    constructor() {
        super();
    }
}

let dawInstance;

document.addEventListener('DOMContentLoaded', () => {
    dawInstance = new SoundBytezDAW();
    window.daw = dawInstance; // Make it globally accessible
    console.log('✅ SoundBytez DAW with PianorollVis.js loaded successfully');
});