"""Supabase persistence for signed-in users' tracks.

Needs SUPABASE_URL and SUPABASE_SECRET_KEY in backend/.env (see .env.example).
The secret (service-role) key bypasses row-level security, so it must only
ever live on the server — never in the frontend.

Without those env vars `enabled` is False and every upload is treated as a
guest upload: processed locally, never saved.
"""
import logging
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

log = logging.getLogger("uvicorn.error")

BUCKET = "stems"
_URL = os.environ.get("SUPABASE_URL")
_KEY = os.environ.get("SUPABASE_SECRET_KEY")

enabled = bool(_URL and _KEY)
_client = None

if enabled:
    from supabase import create_client

    _client = create_client(_URL, _KEY)
else:
    log.warning("SUPABASE_URL / SUPABASE_SECRET_KEY not set — uploads won't be saved to accounts")


def user_id_from_token(access_token: str) -> str | None:
    """Validate a browser session token with Supabase Auth; None if invalid."""
    if not enabled or not access_token:
        return None
    try:
        res = _client.auth.get_user(access_token)
    except Exception as e:  # noqa: BLE001 — any auth failure means "not signed in"
        log.info("Rejected access token: %s", e)
        return None
    return res.user.id if res and res.user else None


def used_bytes(user_id: str) -> int:
    """Bytes counted against the user's quota: finished tracks at their real size,
    in-progress tracks at their estimate. Failed tracks store 0."""
    rows = _client.table("tracks").select("size_bytes").eq("user_id", user_id).execute().data
    return sum(r["size_bytes"] for r in rows)


def create_track(
    user_id: str, name: str, job_id: str, estimated_bytes: int, track_type: str = "stem_separation"
) -> str:
    row = (
        _client.table("tracks")
        .insert(
            {
                "user_id": user_id,
                "name": name,
                "job_id": job_id,
                "type": track_type,
                # Reserve the estimate so concurrent uploads can't overshoot the quota.
                "size_bytes": estimated_bytes,
            }
        )
        .execute()
    )
    return row.data[0]["id"]


def upload_stems(user_id: str, track_id: str, stems: list[dict], out_dir: Path) -> list[dict]:
    """Upload local stem files; returns [{name, path, size}] for the tracks row."""
    stored = []
    for s in stems:
        local = out_dir / s["file"]
        path = f"{user_id}/{track_id}/{s['file']}"
        _client.storage.from_(BUCKET).upload(
            path, local.read_bytes(), {"content-type": "audio/flac", "upsert": "true"}
        )
        stored.append({"name": s["name"], "path": path, "size": local.stat().st_size})
    return stored


def finish_track(track_id: str, stems: list[dict]) -> None:
    _client.table("tracks").update(
        {"status": "done", "stems": stems, "size_bytes": sum(s["size"] for s in stems)}
    ).eq("id", track_id).execute()


def fail_track(track_id: str, error: str) -> None:
    # Nothing was stored, so release the quota reservation.
    _client.table("tracks").update({"status": "error", "error": error, "size_bytes": 0}).eq(
        "id", track_id
    ).execute()
