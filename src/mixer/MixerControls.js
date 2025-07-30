export class MixerControls {
    constructor(daw) {
        this.daw = daw;
    }

    setMasterVolume(value) {
        const dbValue = value === 0 ? -60 : (value - 100) * 0.6;
        Tone.Destination.volume.value = dbValue;
        console.log(`Master volume set to ${value} (${dbValue.toFixed(1)}dB)`);
    }

    setTrackVolume(trackId, value) {
        const track = this.daw.tracks.get(trackId);
        if (!track || !track.volume) return;
        
        const dbValue = value === 0 ? -60 : (value - 100) * 0.6;
        track.volume.volume.value = dbValue;
        console.log(`${track.name} volume set to ${value} (${dbValue.toFixed(1)}dB)`);
    }

    setTrackPan(trackId, value) {
        const track = this.daw.tracks.get(trackId);
        if (!track || !track.panner) return;
        
        const panValue = value / 100;
        track.panner.pan.value = panValue;
        console.log(`${track.name} pan set to ${value} (${panValue})`);
    }
}