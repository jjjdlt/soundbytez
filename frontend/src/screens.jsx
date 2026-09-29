import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { createJob, pollJob, fileUrl, inputUrl } from "./api";
import { Dropzone, JobProgress, ErrorBox } from "./components";

// ------------------------------------------------------------------ shared hook
function useJobFlow(jobType) {
  const [job, setJob] = useState(null);
  const [error, setError] = useState(null);
  const [running, setRunning] = useState(false);

  const start = async (file, extra = {}) => {
    setError(null);
    setJob(null);
    setRunning(true);
    try {
      const jobId = await createJob(jobType, file, extra);
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
  return (
    <div className="screen">
      <h1>soundbytez</h1>
      <p className="muted">pick a tool</p>
      <nav className="tool-grid">
        <Link className="tool-card" to="/stems">Stem Splitter</Link>
        <Link className="tool-card" to="/midi">MIDI Grabber</Link>
        <Link className="tool-card" to="/lyrics">Lyric Cast</Link>
      </nav>
    </div>
  );
}

// ------------------------------------------------------------------ Stem Splitter
export function StemSplitter() {
  const { job, error, running, start } = useJobFlow("stem_separation");
  const done = job?.status === "done";

  return (
    <div className="screen">
      <h2>Stem Splitter</h2>
      {!running && !done && <Dropzone onFile={(f) => start(f)} />}
      {running && <JobProgress job={job} />}
      <ErrorBox error={error} />
      {done && (
        <div className="results">
          {job.result.stems.map((s) => (
            <div key={s.name} className="stem-row">
              <span className="stem-name">{s.name}</span>
              <audio controls src={fileUrl(job.job_id, s.file)} />
              <a href={fileUrl(job.job_id, s.file)} download>download</a>
            </div>
          ))}
        </div>
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
