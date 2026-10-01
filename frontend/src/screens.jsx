import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { createJob, pollJob, fileUrl, inputUrl, getJobLyrics, getTrackLyrics } from "./api";
import { useAuth } from "./auth";
import { deleteTrack, getTrack, stemUrls, useTracks } from "./tracks";
import { useUpload } from "./upload";
import { StemPlayer } from "./stemPlayer";
import { Dropzone, JobProgress, ErrorBox } from "./components";

// ------------------------------------------------------------------ shared hook
// MIDI / lyrics jobs aren't saved to accounts yet — only stem separation is.
function useJobFlow(jobType) {
  const [job, setJob] = useState(null);
  const [error, setError] = useState(null);
  const [running, setRunning] = useState(false);

  const start = async (file, extra = {}) => {
    setError(null);
    setJob(null);
    setRunning(true);
    try {
      const { jobId } = await createJob(jobType, file, extra);
      const final = await pollJob(jobId, setJob);
      setJob(final);
    } catch (e) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  };

  return { job, error, running, start };
}

// ------------------------------------------------------------------ Home
export function Home() {
  const { user } = useAuth();
  return user ? <Dashboard /> : <Landing />;
}

/** New / logged-out visitors: one big drop target. */
function Landing() {
  const { upload, uploading, error } = useUpload();
  return (
    <div className="landing">
      <Dropzone className="hero-drop" onFile={upload}>
        <span className="hero-plus">+</span>
        <span className="hero-label">{uploading ? "uploading…" : "upload"}</span>
        <span className="muted">drop an audio file or click to browse</span>
      </Dropzone>
      <ErrorBox error={error} />
    </div>
  );
}

const formatBytes = (n) =>
  n < 1024 ** 2
    ? `${(n / 1024).toFixed(0)} KB`
    : n < 1024 ** 3
      ? `${(n / 1024 ** 2).toFixed(1)} MB`
      : `${(n / 1024 ** 3).toFixed(2)} GB`;

const formatDate = (iso) =>
  new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

const stemsLabel = (t) =>
  t.status === "done" ? `${t.stems.length}/${t.stems.length}` : t.status === "error" ? "failed" : "processing…";

/** Returning users: their saved tracks. */
function Dashboard() {
  const { tracks, error, refresh, storage } = useTracks();
  const [deleteError, setDeleteError] = useState(null);
  const stemTracks = tracks.filter((t) => t.type === "stem_separation");
  const midiCount = tracks.filter((t) => t.type === "midi_transcription").length;

  useEffect(() => {
    refresh();
  }, [refresh]);

  const remove = async (track) => {
    if (!confirm(`Delete ${track.name}? This removes its stems permanently.`)) return;
    setDeleteError(null);
    try {
      await deleteTrack(track);
    } catch (e) {
      setDeleteError(`Couldn't delete ${track.name}: ${e.message}`);
    }
    refresh();
  };

  return (
    <div className="dashboard">
      <ErrorBox error={error ?? deleteError} />
      <table className="file-table">
        <thead>
          <tr>
            <th>File</th>
            <th>Date</th>
            <th>Stems</th>
            <th>Options</th>
          </tr>
        </thead>
        <tbody>
          {stemTracks.length === 0 && (
            <tr>
              <td colSpan={4} className="empty muted">
                no uploads yet — hit <strong>+ upload</strong> up top
              </td>
            </tr>
          )}
          {stemTracks.map((t) => (
            <tr key={t.id}>
              <td className="file-name" title={t.name}>{t.name}</td>
              <td>{formatDate(t.created_at)}</td>
              <td title={t.error ?? undefined}>{stemsLabel(t)}</td>
              <td className="options">
                <Link to={`/track/${t.id}`}>open</Link>
                <button className="link-btn danger" onClick={() => remove(t)}>
                  delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <footer className="dash-stats">
        <StorageMeter {...storage} />
        <span>MIDI files generated: <strong>{midiCount}</strong></span>
      </footer>
    </div>
  );
}

/** "69 MB of 500 MB" plus a bar that turns amber at 80% and red when full. */
function StorageMeter({ used, quota, full }) {
  if (quota == null) return <span>Storage used: <strong>{formatBytes(used)}</strong></span>;
  const pct = Math.min(used / quota, 1);
  const level = full ? "full" : pct >= 0.8 ? "warn" : "";
  return (
    <div className={`storage-meter ${level}`}>
      <span>
        Storage used: <strong>{formatBytes(used)}</strong> of {formatBytes(quota)}
        {full && <span className="storage-full-note"> — full, delete a track to upload more</span>}
      </span>
      <div
        className="storage-track"
        role="progressbar"
        aria-label="Storage used"
        aria-valuemin={0}
        aria-valuemax={quota}
        aria-valuenow={used}
      >
        <div className="storage-fill" style={{ width: `${pct * 100}%` }} />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Login / sign up
export function Login() {
  const { user, enabled, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState("login"); // "login" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      if (mode === "login") {
        await signIn({ email, password });
        navigate("/");
      } else {
        const { needsConfirmation } = await signUp({ email, password });
        if (needsConfirmation) setNotice(`Check ${email.trim()} for a confirmation link, then log in.`);
        else navigate("/");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const switchMode = (m) => {
    setMode(m);
    setError(null);
    setNotice(null);
  };

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-tabs">
          <button type="button" className={mode === "login" ? "active" : ""} onClick={() => switchMode("login")}>
            log in
          </button>
          <button type="button" className={mode === "signup" ? "active" : ""} onClick={() => switchMode("signup")}>
            create account
          </button>
        </div>
        <label>
          email
          <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          password
          <input
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            minLength={mode === "signup" ? 6 : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        <ErrorBox error={error ?? (enabled ? null : "Accounts aren't configured yet (missing Supabase env vars)")} />
        {notice && <div className="notice-box">{notice}</div>}
        <button className="btn" disabled={busy || !enabled}>
          {busy ? "…" : mode === "login" ? "log in" : "create account"}
        </button>
      </form>
    </div>
  );
}

// ------------------------------------------------------------------ stem results
// Display order, top to bottom; unknown stems (e.g. from other models) go last.
const STEM_ORDER = ["vocals", "drums", "bass", "guitar", "piano", "other"];
const stemRank = (name) => (STEM_ORDER.includes(name) ? STEM_ORDER.indexOf(name) : STEM_ORDER.length);
const sortStems = (stems) => [...stems].sort((a, b) => stemRank(a.name) - stemRank(b.name));

const STARTING = { progress: 0, status: "queued", message: "Starting" };

/** Poll a backend job; returns the latest job object (null until the first poll lands). */
function useJob(jobId, { onError } = {}) {
  const [job, setJob] = useState(null);
  useEffect(() => {
    if (!jobId) return;
    setJob(null);
    let cancelled = false;
    pollJob(jobId, (j) => !cancelled && setJob(j))
      .then((j) => !cancelled && setJob(j))
      .catch((e) => !cancelled && onError?.(e));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);
  return job;
}

/** A signed-in user's saved track, played from Supabase Storage. */
export function Track() {
  const { trackId, view } = useParams();
  const { accessToken } = useAuth();
  const { state } = useLocation();
  const [track, setTrack] = useState(null);
  const [stems, setStems] = useState(null);
  const [error, setError] = useState(null);

  const load = async () => {
    try {
      const t = await getTrack(trackId);
      setTrack(t);
      if (t.status === "done") setStems(sortStems(await stemUrls(t)));
      if (t.status === "error") setError(t.error || "Separation failed");
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => {
    setTrack(null);
    setStems(null);
    setError(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackId]);

  // While processing, show live progress from the backend job, then reload the
  // row once the job is done (the backend marks the row done before the job).
  const processing = track?.status === "processing";
  const job = useJob(processing ? track.job_id : null, {
    onError: (e) =>
      setError(
        e.message.includes("404")
          ? "Processing was interrupted (the backend restarted). Delete this track and upload it again."
          : e.message,
      ),
  });
  useEffect(() => {
    if (job?.status === "done") load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.status]);

  const title = track?.name ?? state?.name ?? "";
  const lyrics = useLyrics(trackId, view === "lyrics" && !!stems, () => getTrackLyrics(trackId, accessToken));

  return (
    <div className="screen wide">
      <ErrorBox error={error} />
      {!stems && !error && (
        <>
          <h2 className="track-title">{title}</h2>
          <JobProgress job={job ?? STARTING} />
        </>
      )}
      {stems && <StemPlayer stems={stems} title={title} panel={view === "lyrics" ? lyricsPanel(lyrics) : null} />}
    </div>
  );
}

/** A guest's unsaved job, played straight from the backend. */
export function GuestJob() {
  const { jobId, view } = useParams();
  const { state } = useLocation();
  const [error, setError] = useState(null);
  const job = useJob(jobId, {
    onError: (e) =>
      setError(e.message.includes("404") ? "This track is no longer on the server (was the backend restarted?)" : e.message),
  });

  const done = job?.status === "done";
  const stems = useMemo(
    () => (done ? sortStems(job.result.stems).map((s) => ({ name: s.name, url: fileUrl(jobId, s.file) })) : null),
    [done, job, jobId],
  );
  const title = state?.name ?? "untitled";
  const lyrics = useLyrics(jobId, view === "lyrics" && done, () => getJobLyrics(jobId));

  return (
    <div className="screen wide">
      <ErrorBox error={error} />
      {!done && !error && (
        <>
          <h2 className="track-title">{title}</h2>
          <JobProgress job={job ?? STARTING} />
        </>
      )}
      {stems && (
        <>
          <StemPlayer stems={stems} title={title} panel={view === "lyrics" ? lyricsPanel(lyrics) : null} />
          <p className="muted small guest-note">
            <Link to="/login">Log in</Link> to keep your stems — guest results disappear when the server restarts.
          </p>
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ MIDI Grabber
export function MidiGrabber() {
  const { job, error, running, start } = useJobFlow("midi_transcription");
  const done = job?.status === "done";
  const [notes, setNotes] = useState(null);

  useEffect(() => {
    if (done && job.result.notes_file) {
      fetch(fileUrl(job.job_id, job.result.notes_file))
        .then((r) => r.json())
        .then(setNotes)
        .catch(() => setNotes(null));
    }
  }, [done, job]);

  return (
    <div className="screen">
      <h2>MIDI Grabber</h2>
      {!running && !done && <Dropzone onFile={(f) => start(f)} />}
      {running && <JobProgress job={job} />}
      <ErrorBox error={error} />
      {done && (
        <div className="results">
          <p>{job.result.note_count} notes transcribed.</p>
          <a className="btn" href={fileUrl(job.job_id, job.result.midi_file)} download>
            Download .mid
          </a>
          {notes && <PianoRollPlaceholder notes={notes} />}
        </div>
      )}
    </div>
  );
}

/** Barebones piano roll: absolutely-positioned divs on a fixed grid. */
function PianoRollPlaceholder({ notes }) {
  const maxT = Math.max(...notes.map((n) => n.end), 1);
  const pitches = notes.map((n) => n.pitch);
  const lo = Math.min(...pitches) - 2;
  const hi = Math.max(...pitches) + 2;
  const H = 160;
  return (
    <div className="piano-roll" style={{ height: H }}>
      {notes.map((n, i) => (
        <div
          key={i}
          className="pr-note"
          style={{
            left: `${(n.start / maxT) * 100}%`,
            width: `${((n.end - n.start) / maxT) * 100}%`,
            top: `${(1 - (n.pitch - lo) / (hi - lo)) * (H - 10)}px`,
          }}
          title={`pitch ${n.pitch}`}
        />
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ Lyric Cast
// The backend identifies the song from its audio fingerprint (AcoustID) and
// looks up time-synced lyrics for it (LRCLIB) — nothing for the user to paste.
export function LyricCast() {
  const { job, error, running, start } = useJobFlow("lyric_alignment");
  const done = job?.status === "done";
  const audioRef = useRef();
  const time = useAudioTime(audioRef);

  const seek = (t) => {
    audioRef.current.currentTime = t;
    audioRef.current.play();
  };

  return (
    <div className="screen">
      <h2>Lyric Cast</h2>
      {!running && <Dropzone onFile={(f) => start(f)}>{done && <p>Drop another song</p>}</Dropzone>}
      {running && <JobProgress job={job} />}
      <ErrorBox error={error} />
      {done && (
        <div className="results">
          <audio ref={audioRef} controls src={inputUrl(job.job_id)} />
          <LyricsView result={job.result} time={time} onSeek={seek} />
        </div>
      )}
    </div>
  );
}

/** An <audio> element's position, sampled every frame — timeupdate only fires
 * ~4x a second, which makes lyric line changes visibly late. */
function useAudioTime(audioRef) {
  const [time, setTime] = useState(0);
  useEffect(() => {
    let frame;
    const tick = () => {
      setTime(audioRef.current?.currentTime ?? 0);
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [audioRef]);
  return time;
}

/** Look up lyrics for a track/job the first time they're wanted. Returns { result, error }. */
function useLyrics(id, wanted, fetchLyrics) {
  const [state, setState] = useState({});
  const requested = useRef(null);
  useEffect(() => {
    if (!wanted || requested.current === id) return;
    requested.current = id;
    setState({});
    fetchLyrics()
      .then((result) => requested.current === id && setState({ result }))
      .catch((e) => requested.current === id && setState({ error: e.message }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, wanted]);
  return state;
}

/** StemPlayer `panel` render function: lyrics in place of the waveforms, synced to the stems. */
const lyricsPanel = ({ result, error }) => ({ time, seek }) => {
  if (error) return <ErrorBox error={error} />;
  if (!result) return <p className="muted lyrics-status">identifying song and finding lyrics…</p>;
  return <LyricsView result={result} time={time} onSeek={seek} />;
};

/** A lyric lookup result: which song it is, and its lyrics (synced if available). */
function LyricsView({ result: { track, lyrics, instrumental }, time, onSeek }) {
  return (
    <>
      <div className="song-match">
        {track ? (
          <>
            <h3>{track.title}</h3>
            <span className="muted">
              {track.artist}
              {track.album && ` · ${track.album}`}
            </span>
          </>
        ) : (
          <span className="muted">Couldn't identify this song, so there are no lyrics to show.</span>
        )}
      </div>
      {lyrics?.synced && <SyncedLyrics lines={lyrics.lines} time={time} onSeek={onSeek} />}
      {lyrics && !lyrics.synced && (
        <>
          <p className="muted small">No time-synced lyrics for this song — showing plain lyrics.</p>
          <div className="karaoke plain">
            {lyrics.lines.map((l, i) => (
              <span key={i} className="lyric-line">{l.text}</span>
            ))}
          </div>
        </>
      )}
      {track && !lyrics && (
        <p className="muted">{instrumental ? "This track is instrumental." : "No lyrics found for this song."}</p>
      )}
    </>
  );
}

/** Karaoke view: the line being sung is highlighted and kept centered. Click a line to jump to it. */
function SyncedLyrics({ lines, time, onSeek }) {
  const active = lines.findLastIndex((l) => l.time <= time);
  const boxRef = useRef();
  const activeRef = useRef();

  useEffect(() => {
    const box = boxRef.current;
    const line = activeRef.current;
    box.scrollTop = line ? line.offsetTop - box.clientHeight / 2 + line.clientHeight / 2 : 0;
  }, [active]);

  return (
    <div className="karaoke" ref={boxRef}>
      {lines.map((l, i) => (
        <button
          key={i}
          ref={i === active ? activeRef : null}
          className={`lyric-line ${i === active ? "active" : i < active ? "past" : ""}`}
          onClick={() => onSeek(l.time)}
        >
          {l.text || "♪"}
        </button>
      ))}
    </div>
  );
}
