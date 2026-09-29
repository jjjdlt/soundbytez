"""In-memory job registry. Simple by design — swap for Redis/DB later if needed."""
import uuid
import time
from enum import Enum
from pathlib import Path
from typing import Any

STORAGE_ROOT = Path(__file__).resolve().parent.parent / "storage"
STORAGE_ROOT.mkdir(exist_ok=True)


class JobStatus(str, Enum):
    QUEUED = "queued"
    PROCESSING = "processing"
    DONE = "done"
    ERROR = "error"


class JobType(str, Enum):
    STEM_SEPARATION = "stem_separation"
    MIDI_TRANSCRIPTION = "midi_transcription"
    LYRIC_ALIGNMENT = "lyric_alignment"


# job_id -> job dict
_JOBS: dict[str, dict[str, Any]] = {}


def create_job(job_type: JobType, input_filename: str, extra: dict | None = None) -> dict:
    job_id = uuid.uuid4().hex[:12]
    job_dir = STORAGE_ROOT / job_id
    (job_dir / "input").mkdir(parents=True)
    (job_dir / "output").mkdir(parents=True)
    job = {
        "job_id": job_id,
        "type": job_type,
        "status": JobStatus.QUEUED,
        "created_at": time.time(),
        "input_filename": input_filename,
        "extra": extra or {},
        "progress": 0.0,
        "message": "Queued",
        "result": None,
        "error": None,
    }
    _JOBS[job_id] = job
    return job


def get_job(job_id: str) -> dict | None:
    return _JOBS.get(job_id)


def job_dir(job_id: str) -> Path:
    return STORAGE_ROOT / job_id


def update_job(job_id: str, **fields) -> None:
    job = _JOBS.get(job_id)
    if job:
        job.update(fields)


def public_view(job: dict) -> dict:
    """What the client sees when polling."""
    return {
        "job_id": job["job_id"],
        "type": job["type"],
        "status": job["status"],
        "progress": job["progress"],
        "message": job["message"],
        "result": job["result"],
        "error": job["error"],
    }
