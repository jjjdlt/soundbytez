"""Milestone 2: real stem separation with Demucs (PyTorch).

Uses `htdemucs_ft` by default — a bag of four fine-tuned Hybrid Transformer
Demucs models (one per stem). Best 4-stem quality Demucs offers; ~4x slower
than plain `htdemucs`, which on a modern GPU still means seconds per song.
Override with the SBZ_DEMUCS_MODEL env var (e.g. `htdemucs`, or `htdemucs_6s`
for guitar + piano stems as well).

Weights (~300MB for htdemucs_ft) download from Hugging Face on first use and
are cached after that.
"""
import os
import threading
from pathlib import Path

import torch
from demucs.api import LoadAudioError, Separator
from demucs.audio import save_audio

from .. import jobs

MODEL_NAME = os.environ.get("SBZ_DEMUCS_MODEL", "htdemucs_ft")
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"


class StemSeparator:
    """Process-wide Demucs wrapper.

    The model is loaded once, lazily, on the first job. Jobs are serialized
    with a lock: the GPU can only usefully run one separation at a time, and
    the Separator's progress callback is per-instance state.
    """

    _instance: "StemSeparator | None" = None
    _instance_lock = threading.Lock()

    def __init__(self, model_name: str = MODEL_NAME, device: str = DEVICE):
        self.model_name = model_name
        self.device = device
        self._separator = Separator(model=model_name, device=device)
        self._run_lock = threading.Lock()

    @classmethod
    def get(cls) -> "StemSeparator":
        with cls._instance_lock:
            if cls._instance is None:
                cls._instance = cls()
            return cls._instance

    @property
    def stems(self) -> list[str]:
        return list(self._separator.model.sources)

    def separate(self, input_path: Path, out_dir: Path, on_progress=None) -> list[dict]:
        """Split `input_path` into one FLAC per stem in `out_dir`.

        on_progress(fraction 0..1) is called as chunks finish.
        Returns [{"name": stem, "file": filename}, ...].
        """
        with self._run_lock:
            self._separator.update_parameter(callback=_progress_callback(on_progress))
            try:
                _, separated = self._separator.separate_audio_file(input_path)
            except LoadAudioError as e:
                raise ValueError("Couldn't decode this audio file — it may be corrupt or empty") from e

        # FLAC: lossless like WAV at roughly half the size, which keeps a
        # 5-minute stem under Supabase's 50 MB per-file limit.
        results = []
        for name, wav in separated.items():
            filename = f"{name}.flac"
            save_audio(wav.cpu(), out_dir / filename, samplerate=self._separator.samplerate)
            results.append({"name": name, "file": filename})
        return results


def _progress_callback(on_progress):
    """Turn Demucs' per-chunk callback dicts into a single 0..1 fraction."""
    if on_progress is None:
        return None

    def callback(info: dict):
        if info["state"] != "end":
            return
        within_model = min(info["segment_offset"] / max(info["audio_length"], 1), 1.0)
        on_progress((info["model_idx_in_bag"] + within_model) / info["models"])

    return callback


# ---------------------------------------------------------------- job entry point
# Same signature as mock.run_stem_separation so main.py can swap between them.
# finalize(stems), if given, runs before the job is marked done (e.g. saving to Supabase).
def run_stem_separation(job_id: str, input_path: Path, finalize=None) -> None:
    out = jobs.job_dir(job_id) / "output"

    def update(progress: float, message: str):
        jobs.update_job(job_id, status=jobs.JobStatus.PROCESSING, progress=progress, message=message)

    update(0.02, f"Loading {MODEL_NAME} on {DEVICE.upper()}")
    separator = StemSeparator.get()

    # Separation covers 5%–90% of the bar; writing WAVs covers the rest.
    update(0.05, "Separating stems")
    stems = separator.separate(
        input_path,
        out,
        on_progress=lambda f: update(0.05 + 0.85 * f, f"Separating stems ({f:.0%})"),
    )
    if finalize:
        update(0.92, "Saving to your library")
        finalize(stems)

    jobs.update_job(
        job_id,
        status=jobs.JobStatus.DONE,
        progress=1.0,
        message="Done",
        result={"stems": stems},
    )
