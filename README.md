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
# Real stem separation (Demucs) needs torch installed FIRST, with the CUDA build for your GPU:
pip install torch --index-url https://download.pytorch.org/whl/cu128   # RTX 50-series needs cu128+
pip install -r requirements.txt
uvicorn app.main:app --port 8000
```
Restart the backend by hand after editing it. On Windows, `--reload` can hang on
"Reloading..." (the old worker never exits), leaving the port refusing connections.

### Supabase (accounts + saved stems)

1. Supabase dashboard → **SQL Editor** → run `supabase/migrations/0001_tracks_and_stems.sql`
   (creates the `tracks` table, the private `stems` bucket, and row-level security).
2. `backend/.env` from `backend/.env.example` — project URL + **secret** key (server only).
3. `frontend/.env.local` from `frontend/.env.example` — project URL + **publishable** key.
4. Restart both servers.

Without these, the app runs in guest mode: uploads are processed but not saved.

### Lyric Cast (song ID + synced lyrics)

`/lyrics` fingerprints the upload with ffmpeg's Chromaprint muxer, identifies it
via [AcoustID](https://acoustid.org/webservice), then pulls LRC synced lyrics from
[LRCLIB](https://lrclib.net/docs). Set `ACOUSTID_API_KEY` in `backend/.env` (an
application key — free for non-commercial use). ffmpeg must be built with
`--enable-chromaprint` (the gyan.dev "full" Windows build is); check with
`ffmpeg -muxers | grep chromaprint`.

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
| `/api/jobs/lyric_alignment` | POST | multipart `file` → `{job_id}`; result is `{track, lyrics: {synced, lines: [{time, text}]}, instrumental}` |
| `/api/tracks/{track_id}/lyrics` | GET | Bearer token; same result shape, song identified from the saved stems |
| `/api/jobs/{job_id}/lyrics` | GET | same, for a guest's stem job (identified from the original upload) |
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
