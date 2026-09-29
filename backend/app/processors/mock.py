"""Milestone 1: mock processors.

Each mock sleeps to simulate work and writes REAL files (playable wavs, a valid
.mid, valid JSON) so the frontend result views can be built against honest data.

Milestones 2-4 replace these one at a time with:
  - stem_separation.py   (Demucs htdemucs_ft)
  - midi_transcription.py (Basic Pitch)
  - lyric_alignment.py    (Whisper/WhisperX)
  - midi_to_musicxml.py   (music21)
Keep the same function signatures so main.py doesn't change.
"""
import json
import shutil
import struct
import time
from pathlib import Path

from .. import jobs


def _tick(job_id: str, progress: float, message: str, sleep: float = 1.0):
    jobs.update_job(job_id, status=jobs.JobStatus.PROCESSING, progress=progress, message=message)
    time.sleep(sleep)


# ---------------------------------------------------------------- stem separation
def run_stem_separation(job_id: str, input_path: Path) -> None:
    out = jobs.job_dir(job_id) / "output"
    _tick(job_id, 0.1, "Loading model (mock)")
    _tick(job_id, 0.4, "Separating stems (mock)")
    # Mock: each "stem" is just a copy of the input so the audio players work.
    stems = ["vocals", "drums", "bass", "other"]
    for i, stem in enumerate(stems):
        shutil.copy(input_path, out / f"{stem}.wav")
        _tick(job_id, 0.4 + 0.15 * (i + 1), f"Writing {stem}.wav", sleep=0.3)
    jobs.update_job(
        job_id,
        status=jobs.JobStatus.DONE,
        progress=1.0,
        message="Done",
        result={"stems": [{"name": s, "file": f"{s}.wav"} for s in stems]},
    )


# ---------------------------------------------------------------- midi transcription
def _write_minimal_midi(path: Path):
    """A tiny valid Type-0 MIDI file: C-major arpeggio, so downloads/parsers work."""
    events = b""
    for i, note in enumerate([60, 64, 67, 72]):
        delta_on = b"\x00" if i == 0 else b"\x60"          # 96 ticks apart
        events += delta_on + bytes([0x90, note, 0x64])      # note on
        events += b"\x60" + bytes([0x80, note, 0x40])       # note off after 96 ticks
    events += b"\x00\xff\x2f\x00"                           # end of track
    track = b"MTrk" + struct.pack(">I", len(events)) + events
    header = b"MThd" + struct.pack(">IHHH", 6, 0, 1, 96)
    path.write_bytes(header + track)


def run_midi_transcription(job_id: str, input_path: Path) -> None:
    out = jobs.job_dir(job_id) / "output"
    _tick(job_id, 0.2, "Analyzing pitch (mock)")
    _tick(job_id, 0.7, "Building MIDI (mock)")
    midi_path = out / "transcription.mid"
    _write_minimal_midi(midi_path)
    # Fake note list for the placeholder piano-roll view
    notes = [
        {"pitch": p, "start": i * 0.5, "end": i * 0.5 + 0.45, "velocity": 100}
        for i, p in enumerate([60, 64, 67, 72])
    ]
    (out / "notes.json").write_text(json.dumps(notes))
    jobs.update_job(
        job_id,
        status=jobs.JobStatus.DONE,
        progress=1.0,
        message="Done",
        result={"midi_file": "transcription.mid", "notes_file": "notes.json", "note_count": len(notes)},
    )


# ---------------------------------------------------------------- lyric alignment
def run_lyric_alignment(job_id: str, input_path: Path, lyrics_text: str) -> None:
    out = jobs.job_dir(job_id) / "output"
    _tick(job_id, 0.2, "Transcribing vocal (mock)")
    _tick(job_id, 0.6, "Aligning words (mock)")
    words = lyrics_text.split()
    # Mock: spread words evenly over a fake 30s duration
    duration = 30.0
    step = duration / max(len(words), 1)
    alignment = [
        {"word": w, "start_time": round(i * step, 3), "end_time": round((i + 1) * step - 0.05, 3)}
        for i, w in enumerate(words)
    ]
    (out / "alignment.json").write_text(json.dumps(alignment))
    # Placeholder MusicXML slot — milestone 4 fills this via music21.
    (out / "melody.musicxml").write_text(_PLACEHOLDER_MUSICXML)
    # Also run the (mock) transcription so Lyric Cast has both artifacts
    _write_minimal_midi(out / "melody.mid")
    jobs.update_job(
        job_id,
        status=jobs.JobStatus.DONE,
        progress=1.0,
        message="Done",
        result={
            "alignment_file": "alignment.json",
            "musicxml_file": "melody.musicxml",
            "midi_file": "melody.mid",
            "word_count": len(words),
        },
    )


_PLACEHOLDER_MUSICXML = """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Vocal</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions><key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>1</duration><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>
"""
