# soundbytez — Milestone 1 (skeleton)

Music production workflow app: stem separation, audio→MIDI, synced lyrics + notation.
This milestone is the **mocked skeleton**: the full upload → job_id → poll → result
flow works end to end for all three tools, with fake processors that produce real,
openable output files (playable WAVs, a valid .mid, alignment JSON, placeholder MusicXML).

## Run it

Backend (Python 3.10+):
```bash
cd backend
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Frontend (Node 18+):
```bash
cd frontend
npm install
npm run dev                      # http://localhost:5173
```

CORS is preconfigured for localhost:5173 → localhost:8000.

## API shape

| Endpoint | Method | Notes |
|---|---|---|
| `/api/jobs/stem_separation` | POST | multipart `file` → `{job_id}` |
| `/api/jobs/midi_transcription` | POST | multipart `file` → `{job_id}` |
| `/api/jobs/lyric_alignment` | POST | multipart `file` + form `lyrics` → `{job_id}` |
| `/api/jobs/{job_id}` | GET | `{status, progress, message, result, error}` |
| `/api/jobs/{job_id}/files/{filename}` | GET | serves output files |
| `/api/jobs/{job_id}/input` | GET | serves the original upload (Lyric Cast playback) |

Storage layout: `backend/storage/{job_id}/input/` and `.../output/`.
Jobs live in an in-memory dict (`app/jobs.py`) — they reset on server restart. Fine for now.

## Where the real ML goes (milestones 2–4)

All mocks live in `backend/app/processors/mock.py` with stable signatures.
Each milestone replaces one function; `main.py` only changes its import.

## ⚠️ Heavy dependencies — read before installing

These are commented out in `requirements.txt` on purpose:

| Package | Pulls in | Disk / download | Notes |
|---|---|---|---|
| `demucs` | PyTorch + torchaudio | ~2–3 GB torch (CPU) or +CUDA; **htdemucs_ft weights ~1 GB** auto-download on first run | CPU works but is ~5–15× realtime slow. GPU strongly recommended for real use. |
| `basic-pitch` | TensorFlow by default | TF is ~500 MB+ | Prefer `pip install "basic-pitch[onnx]"` — ONNX runtime is much lighter and the bundled model is small (~20 MB). |
| `whisperx` | PyTorch + faster-whisper + pyannote | Whisper weights: tiny 75 MB → large-v3 ~3 GB | `base` or `small` is plenty for word-level lyric alignment. WhisperX also wants ffmpeg installed. |
| `music21` | pure Python | small | Safe anytime. |

Also: **ffmpeg** is required by Demucs and Whisper for non-WAV inputs — install via system package manager.

## Milestone status

- [x] 1. Scaffold + mocked job pipeline, end-to-end flow verified via curl
- [ ] 2. Real Demucs stem separation
- [ ] 3. Real Basic Pitch MIDI transcription
- [ ] 4. Whisper/WhisperX alignment + music21 MIDI→MusicXML
- [ ] 5. OpenSheetMusicDisplay rendering + sync highlight on Lyric Cast
