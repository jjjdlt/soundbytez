import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { createJob, getJob, pollJob, fileUrl, inputUrl } from "./api";
import { useAuth } from "./auth";
import { addEntry, getLibrary, removeEntry, updateEntry, useLibrary } from "./library";
import { useUpload } from "./upload";
import { StemPlayer } from "./stemPlayer";
import { Dropzone, JobProgress, ErrorBox } from "./components";

// ------------------------------------------------------------------ shared hook
function useJobFlow(jobType) {
  const { user } = useAuth();
  const [job, setJob] = useState(null);
  const [error, setError] = useState(null);
  const [running, setRunning] = useState(false);

  const start = async (file, extra = {}) => {
    setError(null);
    setJob(null);
    setRunning(true);
    try {
      const jobId = await createJob(jobType, file, extra);
      if (user) addEntry(user.id, { jobId, type: jobType, name: file.name, size: file.size });
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
  return user ? <Dashboard user={user} /> : <Landing />;
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

const formatDate = (ms) =>
  new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

const stemsLabel = (stems) =>
  typeof stems === "number" ? `${stems}/4` : { error: "failed", missing: "unavailable" }[stems] ?? "processing…";

/** Returning users: their uploads. */
function Dashboard({ user }) {
  const entries = useLibrary(user.id);
  const stemJobs = entries.filter((e) => e.type === "stem_separation");
  const storageUsed = entries.reduce((sum, e) => sum + (e.size ?? 0), 0);
  const midiCount = entries.filter((e) => e.type === "midi_transcription").length;

  // Backfill stem counts for jobs that finished while the user was on another page.
  const pendingKey = stemJobs.filter((e) => e.stems == null).map((e) => e.jobId).join();
  useEffect(() => {
    if (!pendingKey) return;
    let cancelled = false;
    const ids = pendingKey.split(",");
    const check = () =>
      ids.forEach((jobId) =>
        getJob(jobId)
          .then((job) => {
            if (cancelled) return;
            if (job.status === "done") updateEntry(user.id, jobId, { stems: job.result.stems.length });
            if (job.status === "error") updateEntry(user.id, jobId, { stems: "error" });
          })
          // 404 = job gone from the server; anything else (e.g. backend down) just retries next tick
          .catch((e) => !cancelled && e.message.includes("404") && updateEntry(user.id, jobId, { stems: "missing" })),
      );
    check();
    const t = setInterval(check, 2000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [pendingKey, user.id]);

  return (
    <div className="dashboard">
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
          {stemJobs.length === 0 && (
            <tr>
              <td colSpan={4} className="empty muted">
                no uploads yet — hit <strong>+ upload</strong> up top
              </td>
            </tr>
          )}
          {stemJobs.map((e) => (
            <tr key={e.jobId}>
              <td className="file-name" title={e.name}>{e.name}</td>
              <td>{formatDate(e.createdAt)}</td>
              <td>{stemsLabel(e.stems)}</td>
              <td className="options">
                <Link to={`/track/${e.jobId}`} state={{ name: e.name }}>open</Link>
                <button
                  className="link-btn danger"
                  onClick={() => confirm(`Delete ${e.name}?`) && removeEntry(user.id, e.jobId)}
                >
                  delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <footer className="dash-stats">
        <span>Storage used: <strong>{formatBytes(storageUsed)}</strong></span>
        <span>MIDI files generated: <strong>{midiCount}</strong></span>
      </footer>
    </div>
  );
}

// ------------------------------------------------------------------ Login / sign up
export function Login() {
  const { user, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState("login"); // "login" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await (mode === "login" ? signIn : signUp)({ email, password });
      navigate("/");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const switchMode = (m) => {
    setMode(m);
    setError(null);
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
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        <ErrorBox error={error} />
        <button className="btn" disabled={busy}>
          {busy ? "…" : mode === "login" ? "log in" : "create account"}
        </button>
        <p className="muted small">mock auth — accounts live in this browser only</p>
      </form>
    </div>
  );
}

// ------------------------------------------------------------------ Track (stem results)
export function Track() {
  const { jobId } = useParams();
  const { state } = useLocation();
  const { user } = useAuth();
  const [job, setJob] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setJob(null);
    setError(null);
    pollJob(jobId, setJob)
      .then((final) => {
        setJob(final);
        if (user) updateEntry(user.id, jobId, { stems: final.result.stems.length });
      })
      .catch((e) =>
        setError(e.message.includes("404") ? "This track is no longer on the server (was the backend restarted?)" : e.message),
      );
  }, [jobId, user]);

  const done = job?.status === "done";
  const stems = useMemo(
    () => (done ? job.result.stems.map((s) => ({ name: s.name, url: fileUrl(jobId, s.file) })) : null),
    [done, job, jobId],
  );
  const title = state?.name ?? (user && getLibrary(user.id).find((e) => e.jobId === jobId)?.name) ?? "untitled";

  return (
    <div className="screen wide">
      <ErrorBox error={error} />
      {!done && !error && (
        <>
          <h2 className="track-title">{title}</h2>
          <JobProgress job={job ?? { progress: 0, status: "queued", message: "Starting" }} />
        </>
      )}
      {stems && <StemPlayer stems={stems} title={title} />}
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
export function LyricCast() {
  const { job, error, running, start } = useJobFlow("lyric_alignment");
  const done = job?.status === "done";
  const [file, setFile] = useState(null);
  const [lyrics, setLyrics] = useState("");
  const [alignment, setAlignment] = useState(null);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef();

  useEffect(() => {
    if (done && job.result.alignment_file) {
      fetch(fileUrl(job.job_id, job.result.alignment_file))
        .then((r) => r.json())
        .then(setAlignment)
        .catch(() => setAlignment(null));
    }
  }, [done, job]);

  const activeIdx = alignment
    ? alignment.findIndex((w) => currentTime >= w.start_time && currentTime < w.end_time)
    : -1;

  return (
    <div className="screen">
      <h2>Lyric Cast</h2>
      {!running && !done && (
        <>
          <Dropzone onFile={setFile} />
          {file && <p className="muted">selected: {file.name}</p>}
          <textarea
            className="lyrics-input"
            rows={6}
            placeholder="Paste lyrics here..."
            value={lyrics}
            onChange={(e) => setLyrics(e.target.value)}
          />
          <button
            className="btn"
            disabled={!file || !lyrics.trim()}
            onClick={() => start(file, { lyrics })}
          >
            Align lyrics
          </button>
        </>
      )}
      {running && <JobProgress job={job} />}
      <ErrorBox error={error} />
      {done && (
        <div className="results">
          <audio
            ref={audioRef}
            controls
            src={inputUrl(job.job_id)}
            onTimeUpdate={(e) => setCurrentTime(e.target.currentTime)}
          />
          <div className="karaoke">
            {alignment?.map((w, i) => (
              <span key={i} className={i === activeIdx ? "word active" : "word"}>
                {w.word}{" "}
              </span>
            ))}
          </div>
          <div className="notation-placeholder">
            {/* Milestone 5: OpenSheetMusicDisplay renders job.result.musicxml_file here */}
            <p className="muted">
              [ sheet music placeholder — MusicXML ready at:{" "}
              <a href={fileUrl(job.job_id, job.result.musicxml_file)}>melody.musicxml</a> ]
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
