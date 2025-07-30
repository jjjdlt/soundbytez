export class TransportControls {
    constructor(daw) {
        this.daw = daw;
    }

    async togglePlay() {
        await this.daw.initAudio();
        
        const playBtn = document.getElementById('play-btn');
        
        if (!this.daw.isPlaying) {
            this.daw.sequence.start();
            Tone.Transport.start();
            this.daw.isPlaying = true;
            playBtn.classList.add('active');
            playBtn.textContent = 'PAUSE';
            this.daw.updateStatus('Audio: Playing');
        } else {
            Tone.Transport.pause();
            this.daw.isPlaying = false;
            playBtn.classList.remove('active');
            playBtn.textContent = 'PLAY';
            this.daw.updateStatus('Audio: Paused');
        }
    }

    stop() {
        Tone.Transport.stop();
        if (this.daw.sequence) {
            this.daw.sequence.stop();
        }
        this.daw.isPlaying = false;
        this.daw.currentStep = 0;
        
        const playBtn = document.getElementById('play-btn');
        playBtn.classList.remove('active');
        playBtn.textContent = 'PLAY';
        
        document.querySelectorAll('.step').forEach(step => {
            step.classList.remove('playing');
        });
        
        this.daw.updateStatus('Audio: Stopped');
    }

    toggleRecord() {
        const recordBtn = document.getElementById('record-btn');
        recordBtn.classList.toggle('active');
        
        if (recordBtn.classList.contains('active')) {
            this.daw.updateStatus('Audio: Recording');
        } else {
            this.daw.updateStatus('Audio: Ready');
        }
    }

    toggleLoop() {
        const loopBtn = document.getElementById('loop-btn');
        loopBtn.classList.toggle('active');
        
        if (loopBtn.classList.contains('active')) {
            Tone.Transport.loop = true;
            Tone.Transport.loopStart = 0;
            Tone.Transport.loopEnd = '2m';
        } else {
            Tone.Transport.loop = false;
        }
    }

    setBPM(bpm) {
        Tone.Transport.bpm.value = parseInt(bpm);
        // Save BPM change to storage
        this.daw.saveDAWData();
        console.log(`🎵 BPM changed to ${bpm} and saved`);
    }
}