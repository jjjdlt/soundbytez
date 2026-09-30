"""Per-user storage quota for saved stems.

The quota is enforced here, on the server, before any GPU work starts; the
dashboard's storage bar is only a display of the same numbers.
"""
import json
import os
import subprocess
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

# MiB, so it lines up with the dashboard's KB/MB/GB formatting (base 1024).
USER_QUOTA_BYTES = int(os.environ.get("SBZ_USER_QUOTA_MB", "500")) * 1024**2

# Four 16-bit stereo 44.1 kHz FLAC stems. Measured ~228 KB per second of audio
# on a real song; rounded up so the estimate errs on the side of reserving more.
STEM_BYTES_PER_SECOND = 240_000


def audio_duration_seconds(path: Path) -> float:
    """Duration via ffprobe (already required for FLAC encoding)."""
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", str(path)],
            capture_output=True, text=True, check=True, timeout=30,
        ).stdout
        return float(json.loads(out)["format"]["duration"])
    except (subprocess.SubprocessError, KeyError, ValueError, FileNotFoundError) as e:
        raise ValueError("Couldn't read this audio file — it may be corrupt") from e


def estimate_stem_bytes(path: Path) -> int:
    return int(audio_duration_seconds(path) * STEM_BYTES_PER_SECOND)


def format_mb(n: int) -> str:
    return f"{n / 1024**2:.0f} MB"
