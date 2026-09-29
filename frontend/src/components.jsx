import { useRef, useState } from "react";

export function Dropzone({ onFile, accept = "audio/*" }) {
  const inputRef = useRef();
  const [drag, setDrag] = useState(false);

  const handleFiles = (files) => files?.[0] && onFile(files[0]);

  return (
    <div
      className={`dropzone ${drag ? "drag" : ""}`}
      onClick={() => inputRef.current.click()}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); handleFiles(e.dataTransfer.files); }}
    >
      <p>Drop an audio file here, or click to browse</p>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        hidden
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  );
}

export function JobProgress({ job }) {
  if (!job) return null;
  return (
    <div className="job-progress">
      <div className="bar-track">
        <div className="bar-fill" style={{ width: `${(job.progress * 100).toFixed(0)}%` }} />
      </div>
      <span className="job-msg">{job.status} — {job.message}</span>
    </div>
  );
}

export function ErrorBox({ error }) {
  if (!error) return null;
  return <div className="error-box">{error}</div>;
}
