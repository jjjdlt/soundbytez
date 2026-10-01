"""Lyric Cast: identify the uploaded song, then fetch time-synced lyrics for it.

  1. Chromaprint fingerprint of the audio, via ffmpeg's `chromaprint` muxer
     (same fingerprint `fpcalc` produces, without a second binary to install).
  2. AcoustID lookup: fingerprint -> MusicBrainz recording (title, artists).
  3. LRCLIB lookup: title/artist/duration -> LRC synced lyrics.

Needs ACOUSTID_API_KEY in backend/.env — an *application* key from
https://acoustid.org/new-application. LRCLIB needs no key.
"""
import os
import re
import subprocess
from pathlib import Path

import httpx
from dotenv import load_dotenv

from .. import jobs, quota

load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")

ACOUSTID_API_KEY = os.environ.get("ACOUSTID_API_KEY")
ACOUSTID_URL = "https://api.acoustid.org/v2/lookup"
LRCLIB_URL = "https://lrclib.net/api"
# LRCLIB asks clients to identify themselves.
USER_AGENT = "soundbytez/0.1"

# AcoustID only fingerprints the first two minutes (fpcalc's default length).
FINGERPRINT_SECONDS = 120
# Below this AcoustID is guessing; a wrong song's lyrics are worse than none.
MIN_MATCH_SCORE = 0.5
MAX_CANDIDATES = 3
# Synced lyrics are only useful if they were timed against this same cut of the
# song; a different edit (radio, live, extended) drifts out of sync.
SYNC_DURATION_TOLERANCE = 3.0


def fingerprint(sources: list[str]) -> str:
    """Chromaprint fingerprint of one audio file/URL, or of several mixed together
    (a saved track's stems sum back to the original song)."""
    cmd = ["ffmpeg", "-v", "error"]
    for src in sources:
        cmd += ["-i", str(src)]
    if len(sources) == 1:
        cmd += ["-map", "0:a:0"]
    else:
        cmd += ["-filter_complex", f"amix=inputs={len(sources)}:normalize=0"]
    cmd += ["-t", str(FINGERPRINT_SECONDS), "-f", "chromaprint", "-fp_format", "base64", "-"]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    except FileNotFoundError as e:
        raise RuntimeError("ffmpeg isn't installed, so the song can't be fingerprinted") from e
    except subprocess.TimeoutExpired as e:
        raise RuntimeError("Fingerprinting timed out") from e
    if proc.returncode != 0 or not proc.stdout.strip():
        if "chromaprint" in proc.stderr:
            raise RuntimeError("This ffmpeg build has no Chromaprint support (needs --enable-chromaprint)")
        raise ValueError("Couldn't read this audio file — it may be corrupt")
    return proc.stdout.strip()


# ---------------------------------------------------------------- AcoustID
def identify(client: httpx.Client, fp: str, duration: float) -> list[dict]:
    """Likely recordings for a fingerprint, best first: [{title, artist, artists, album, score}]."""
    if not ACOUSTID_API_KEY:
        raise RuntimeError("ACOUSTID_API_KEY isn't set in backend/.env — can't identify songs")
    res = client.post(
        ACOUSTID_URL,
        data={
            "client": ACOUSTID_API_KEY,
            "duration": round(duration),
            "fingerprint": fp,
            "meta": "recordings releasegroups compress",
        },
    )
    body = res.json()
    if body.get("status") != "ok":
        raise RuntimeError(f"AcoustID lookup failed: {body.get('error', {}).get('message', res.status_code)}")

    candidates, seen = [], set()
    for result in sorted(body["results"], key=lambda r: r["score"], reverse=True):
        if result["score"] < MIN_MATCH_SCORE:
            break
        # One fingerprint can map to several recordings (album cut, single,
        # compilation); try the ones closest in length to this file first.
        recordings = [r for r in result.get("recordings", []) if r.get("title") and r.get("artists")]
        recordings.sort(key=lambda r: abs(r.get("duration", duration) - duration))
        for rec in recordings:
            artists = [a["name"] for a in rec["artists"]]
            artist = "".join(a["name"] + a.get("joinphrase", "") for a in rec["artists"])
            key = (rec["title"].lower(), artist.lower())
            if key in seen:
                continue
            seen.add(key)
            candidates.append(
                {
                    "title": rec["title"],
                    "artist": artist,
                    "artists": artists,
                    "album": _album(rec.get("releasegroups", [])),
                    "score": result["score"],
                }
            )
    return candidates[:MAX_CANDIDATES]


def _album(release_groups: list[dict]) -> str | None:
    """Prefer the studio album over singles and compilations."""
    for rg in release_groups:
        if rg.get("type") == "Album" and not rg.get("secondarytypes"):
            return rg["title"]
    return release_groups[0]["title"] if release_groups else None


# ---------------------------------------------------------------- LRCLIB
def find_lyrics(client: httpx.Client, candidate: dict, duration: float) -> dict | None:
    """Best LRCLIB record for a candidate: synced lyrics timed to this duration
    if there are any, otherwise plain lyrics. None if LRCLIB doesn't have the song."""
    fallback = None
    # LRCLIB credits vary ("A feat. B" vs just "A"), so try both.
    for artist in dict.fromkeys([candidate["artist"], candidate["artists"][0]]):
        res = client.get(
            f"{LRCLIB_URL}/get",
            params={"track_name": candidate["title"], "artist_name": artist, "duration": round(duration)},
        )
        if res.status_code == 200:
            record = res.json()
            if record.get("syncedLyrics"):
                return record
            fallback = fallback or record

    # /get only matches within a couple of seconds of `duration`; search more loosely.
    res = client.get(
        f"{LRCLIB_URL}/search",
        params={"track_name": candidate["title"], "artist_name": candidate["artists"][0]},
    )
    records = res.json() if res.status_code == 200 else []
    records.sort(key=lambda r: abs((r.get("duration") or 0) - duration))
    for record in records:
        if record.get("syncedLyrics") and abs((record.get("duration") or 0) - duration) <= SYNC_DURATION_TOLERANCE:
            return record
    return fallback or next((r for r in records if r.get("plainLyrics") or r.get("instrumental")), None)


_LRC_TIMESTAMP = re.compile(r"\[(\d+):(\d+(?:\.\d+)?)\]")


def parse_lrc(lrc: str) -> list[dict]:
    """LRC text -> [{time, text}] sorted by time. A line can carry several
    timestamps (repeated choruses); blank lines mark instrumental gaps."""
    lines = []
    for raw in lrc.splitlines():
        stamps = _LRC_TIMESTAMP.findall(raw)
        text = _LRC_TIMESTAMP.sub("", raw).strip()
        for minutes, seconds in stamps:
            lines.append({"time": round(int(minutes) * 60 + float(seconds), 2), "text": text})
    return sorted(lines, key=lambda line: line["time"])


def _lyrics_payload(record: dict) -> dict:
    if record.get("syncedLyrics"):
        return {"synced": True, "lines": parse_lrc(record["syncedLyrics"])}
    plain = record.get("plainLyrics") or ""
    return {"synced": False, "lines": [{"time": None, "text": t.strip()} for t in plain.splitlines()]}


def lookup(sources: list[str], on_progress=None) -> dict:
    """Identify the song in `sources` (one file, or stems to mix) and find its lyrics.

    Returns {track, lyrics, instrumental}; raises ValueError/RuntimeError with a
    user-facing message if the audio can't be read or a service is unreachable.
    """
    progress = on_progress or (lambda fraction, message: None)

    progress(0.1, "Fingerprinting audio")
    duration = quota.audio_duration_seconds(sources[0])
    fp = fingerprint(sources)

    track, record = None, None
    try:
        with httpx.Client(timeout=20, headers={"User-Agent": USER_AGENT}) as client:
            progress(0.4, "Identifying song")
            candidates = identify(client, fp, duration)
            progress(0.7, "Finding lyrics")
            for candidate in candidates:
                found = find_lyrics(client, candidate, duration)
                # Keep looking through the candidates for a synced version.
                if found and (record is None or found.get("syncedLyrics")):
                    track, record = candidate, found
                if record and record.get("syncedLyrics"):
                    break
    except (httpx.HTTPError, ValueError) as e:  # ValueError: a non-JSON (error page) response
        raise RuntimeError(f"Couldn't reach the lyrics services ({type(e).__name__}) — try again") from e

    track = track or (candidates[0] if candidates else None)
    instrumental = bool(record and record.get("instrumental"))
    return {
        # None when AcoustID doesn't know the song.
        "track": track and {k: track[k] for k in ("title", "artist", "album", "score")},
        # None when the song was identified but LRCLIB has no lyrics for it.
        "lyrics": _lyrics_payload(record) if record and not instrumental else None,
        "instrumental": instrumental,
    }


# ---------------------------------------------------------------- job entry point
def run_lyric_lookup(job_id: str, input_path: Path) -> None:
    def update(progress: float, message: str):
        jobs.update_job(job_id, status=jobs.JobStatus.PROCESSING, progress=progress, message=message)

    result = lookup([input_path], on_progress=update)
    jobs.update_job(job_id, status=jobs.JobStatus.DONE, progress=1.0, message="Done", result=result)
