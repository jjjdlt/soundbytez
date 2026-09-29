import logging
import shutil
from pathlib import Path

from fastapi import BackgroundTasks, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from . import jobs, supabase_store
from .processors import mock

log = logging.getLogger("uvicorn.error")

# Real processors are optional heavy installs; fall back to mocks without them.
try:
    from .processors.stem_separation import run_stem_separation

    REAL_STEMS = True
except ImportError as e:
    log.warning("Demucs unavailable (%s) — using mock stem separation", e)
    run_stem_separation = mock.run_stem_separation
    REAL_STEMS = False

# Only save real separations to accounts — mock "stems" are copies of the input.
SAVE_TO_ACCOUNTS = supabase_store.enabled and REAL_STEMS

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


def _bearer_user(authorization: str | None) -> str | None:
    """User id from an `Authorization: Bearer <supabase access token>` header, if valid."""
    if not SAVE_TO_ACCOUNTS or not authorization or not authorization.startswith("Bearer "):
        return None
    return supabase_store.user_id_from_token(authorization.removeprefix("Bearer "))


def _run_saved_stem_job(job_id: str, input_path: Path, user_id: str, track_id: str):
    """Separate, upload stems to the user's library, then drop the local copies."""
    out_dir = jobs.job_dir(job_id) / "output"

    def finalize(stems):
        supabase_store.finish_track(track_id, supabase_store.upload_stems(user_id, track_id, stems, out_dir))

    try:
        run_stem_separation(job_id, input_path, finalize=finalize)
    except Exception as e:  # noqa: BLE001
        log.exception("Stem job %s failed", job_id)
        jobs.update_job(job_id, status=jobs.JobStatus.ERROR, message="Failed", error=str(e))
        try:
            supabase_store.fail_track(track_id, str(e))
        except Exception:  # noqa: BLE001
            log.exception("Couldn't mark track %s as failed", track_id)
        return
    # Stems now live in Supabase Storage; the browser plays them from there.
    shutil.rmtree(jobs.job_dir(job_id), ignore_errors=True)


# ---------------------------------------------------------------- job creation
@app.post("/api/jobs/stem_separation")
async def create_stem_job(
    background: BackgroundTasks,
    file: UploadFile = File(...),
    authorization: str | None = Header(None),
):
    _validate_audio(file)
    user_id = _bearer_user(authorization)
    job = jobs.create_job(jobs.JobType.STEM_SEPARATION, file.filename)
    input_path = _save_upload(job, file)

    if user_id:
        track_id = supabase_store.create_track(user_id, file.filename, job["job_id"])
        background.add_task(_run_saved_stem_job, job["job_id"], input_path, user_id, track_id)
        return {"job_id": job["job_id"], "track_id": track_id}

    # Guests (or no Supabase configured): process locally, serve from /files, don't save.
    background.add_task(_run_safely, run_stem_separation, job["job_id"], input_path)
    return {"job_id": job["job_id"], "track_id": None}


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
