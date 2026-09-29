import logging
from pathlib import Path

from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from . import jobs
from .processors import mock

# Real processors are optional heavy installs; fall back to mocks without them.
try:
    from .processors.stem_separation import run_stem_separation
except ImportError as e:
    logging.getLogger("uvicorn.error").warning("Demucs unavailable (%s) — using mock stem separation", e)
    run_stem_separation = mock.run_stem_separation

app = FastAPI(title="soundbytez API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

ALLOWED_AUDIO_EXT = {".wav", ".mp3", ".flac", ".m4a", ".ogg", ".aiff", ".aif"}


def _save_upload(job: dict, file: UploadFile) -> Path:
    dest = jobs.job_dir(job["job_id"]) / "input" / file.filename
    with dest.open("wb") as f:
        while chunk := file.file.read(1024 * 1024):
            f.write(chunk)
    return dest


def _validate_audio(file: UploadFile):
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_AUDIO_EXT:
        raise HTTPException(400, f"Unsupported file type '{ext}'. Allowed: {sorted(ALLOWED_AUDIO_EXT)}")
    if file.size == 0:
        raise HTTPException(400, "That file is empty")


def _run_safely(fn, job_id: str, *args):
    try:
        fn(job_id, *args)
    except Exception as e:  # noqa: BLE001 — surface any processor failure to the client
        jobs.update_job(job_id, status=jobs.JobStatus.ERROR, message="Failed", error=str(e))


# ---------------------------------------------------------------- job creation
@app.post("/api/jobs/stem_separation")
async def create_stem_job(background: BackgroundTasks, file: UploadFile = File(...)):
    _validate_audio(file)
    job = jobs.create_job(jobs.JobType.STEM_SEPARATION, file.filename)
    input_path = _save_upload(job, file)
    background.add_task(_run_safely, run_stem_separation, job["job_id"], input_path)
    return {"job_id": job["job_id"]}


@app.post("/api/jobs/midi_transcription")
async def create_midi_job(background: BackgroundTasks, file: UploadFile = File(...)):
    _validate_audio(file)
    job = jobs.create_job(jobs.JobType.MIDI_TRANSCRIPTION, file.filename)
    input_path = _save_upload(job, file)
    background.add_task(_run_safely, mock.run_midi_transcription, job["job_id"], input_path)
    return {"job_id": job["job_id"]}


@app.post("/api/jobs/lyric_alignment")
async def create_lyric_job(
    background: BackgroundTasks,
    file: UploadFile = File(...),
    lyrics: str = Form(...),
):
    _validate_audio(file)
    if not lyrics.strip():
        raise HTTPException(400, "Lyrics text is required")
    job = jobs.create_job(jobs.JobType.LYRIC_ALIGNMENT, file.filename, extra={"lyrics": lyrics})
    input_path = _save_upload(job, file)
    background.add_task(_run_safely, mock.run_lyric_alignment, job["job_id"], input_path, lyrics)
    return {"job_id": job["job_id"]}


# ---------------------------------------------------------------- polling + files
@app.get("/api/jobs/{job_id}")
async def get_job_status(job_id: str):
    job = jobs.get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return jobs.public_view(job)


@app.get("/api/jobs/{job_id}/files/{filename}")
async def get_job_file(job_id: str, filename: str):
    job = jobs.get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    path = (jobs.job_dir(job_id) / "output" / filename).resolve()
    # keep file access inside the job's output dir
    if not path.is_relative_to(jobs.job_dir(job_id).resolve()) or not path.exists():
        raise HTTPException(404, "File not found")
    return FileResponse(path)


# Also serve the original input back (useful for Lyric Cast playback)
@app.get("/api/jobs/{job_id}/input")
async def get_job_input(job_id: str):
    job = jobs.get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    path = jobs.job_dir(job_id) / "input" / job["input_filename"]
    if not path.exists():
        raise HTTPException(404, "Input file not found")
    return FileResponse(path)
