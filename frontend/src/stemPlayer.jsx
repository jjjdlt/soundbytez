import { useEffect, useMemo, useRef, useState } from "react";

const STEM_COLORS = {
  vocals: "#e0479e",
  drums: "#f0932b",
  bass: "#3f86e0",
  guitar: "#e5c643",
  piano: "#a879e6",
  other: "#2ec4b6",
};
const BAR_COUNT = 140;

const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** Downsample a buffer to BAR_COUNT raw peak amplitudes. */
function computePeaks(buffer) {
  const data = buffer.getChannelData(0);
  const step = Math.floor(data.length / BAR_COUNT) || 1;
  const peaks = [];
  for (let i = 0; i < BAR_COUNT; i++) {
    let max = 0;
    for (let j = i * step; j < (i + 1) * step && j < data.length; j += 16) {
      const v = Math.abs(data[j]);
      if (v > max) max = v;
    }
    peaks.push(max);
  }
  return peaks;
}

/** Scale every lane against the loudest stem so a quiet stem *looks* quiet. */
function normalizePeaks(lanes) {
  const top = Math.max(...lanes.flat(), 0.01);
  return lanes.map((peaks) => peaks.map((p) => Math.max(p / top, 0.04)));
}

/**
 * Plays all stems in lockstep through one AudioContext. Each stem gets its own
 * GainNode so mute/solo is instant and sample-accurate.
 */
function useStemEngine(stems) {
  const ctxRef = useRef(null);
  const gainsRef = useRef([]);
  const sourcesRef = useRef([]);
  const startedAtRef = useRef(0); // ctx time corresponding to track position 0
  const offsetRef = useRef(0);    // paused position
  const [buffers, setBuffers] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);

  // load + decode
  useEffect(() => {
    let cancelled = false;
    const ctx = new AudioContext();
    ctxRef.current = ctx;
    gainsRef.current = stems.map(() => {
      const g = ctx.createGain();
      g.connect(ctx.destination);
      return g;
    });
    Promise.all(
      stems.map((s) =>
        fetch(s.url)
          .then((r) => {
            if (!r.ok) throw new Error(`Couldn't load ${s.name} (${r.status})`);
            return r.arrayBuffer();
          })
          .then((ab) => ctx.decodeAudioData(ab)),
      ),
    )
      .then((bufs) => !cancelled && setBuffers(bufs))
      .catch((e) => !cancelled && setLoadError(e.message));
    return () => {
      cancelled = true;
      sourcesRef.current.forEach((s) => s.stop());
      ctx.close();
    };
  }, [stems]);

  const duration = buffers ? Math.max(...buffers.map((b) => b.duration)) : 0;

  const stopSources = () => {
    sourcesRef.current.forEach((s) => {
      s.onended = null;
      s.stop();
    });
    sourcesRef.current = [];
  };

  const finish = () => {
    stopSources();
    offsetRef.current = 0;
    setTime(0);
    setPlaying(false);
  };

  const startAt = (offset) => {
    const ctx = ctxRef.current;
    ctx.resume();
    stopSources();
    sourcesRef.current = buffers.map((buf, i) => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(gainsRef.current[i]);
      src.start(0, offset);
      return src;
    });
    // End detection lives on the audio graph, not the rAF loop, so it still
    // fires when the tab is in the background and rAF is paused.
    const longest = buffers.indexOf(buffers.find((b) => b.duration === duration));
    sourcesRef.current[longest].onended = finish;
    startedAtRef.current = ctx.currentTime - offset;
    setPlaying(true);
  };

  const pause = () => {
    offsetRef.current = Math.min(ctxRef.current.currentTime - startedAtRef.current, duration);
    stopSources();
    setPlaying(false);
  };

  const toggle = () => {
    if (playing) return pause();
    startAt(offsetRef.current >= duration ? 0 : offsetRef.current);
  };

  const seek = (t) => {
    offsetRef.current = t;
    setTime(t);
    if (playing) startAt(t);
  };

  // playhead clock (visual only)
  useEffect(() => {
    if (!playing) return;
    let raf;
    const tick = () => {
      setTime(Math.min(ctxRef.current.currentTime - startedAtRef.current, duration));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, duration]);

  const setGains = (levels) =>
    levels.forEach((v, i) => gainsRef.current[i]?.gain.setTargetAtTime(v, ctxRef.current.currentTime, 0.01));

  return { buffers, loadError, playing, time, duration, toggle, seek, setGains };
}

export function StemPlayer({ stems, title }) {
  const engine = useStemEngine(stems);
  const [muted, setMuted] = useState(() => new Set());
  const [soloed, setSoloed] = useState(() => new Set());
  const peaks = useMemo(() => engine.buffers && normalizePeaks(engine.buffers.map(computePeaks)), [engine.buffers]);

  // solo wins over mute; if nothing is soloed, everything not muted plays
  const audible = stems.map((s) => (soloed.size ? soloed.has(s.name) : !muted.has(s.name)));
  const { setGains } = engine;
  const audibleKey = audible.join();
  useEffect(() => {
    if (engine.buffers) setGains(audible.map((a) => (a ? 1 : 0)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audibleKey, engine.buffers]);

  const flip = (setter, name) =>
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  if (engine.loadError) return <div className="error-box">{engine.loadError}</div>;

  const progress = engine.duration ? engine.time / engine.duration : 0;

  const onSeek = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    engine.seek(((e.clientX - rect.left) / rect.width) * engine.duration);
  };

  return (
    <div className="stem-player">
      {stems.map((s, i) => {
        const color = STEM_COLORS[s.name] ?? "#9b8cff";
        return (
          <div key={s.name} className={`stem-lane ${audible[i] ? "" : "silent"}`}>
            <div className="stem-controls">
              <span className="stem-label">{s.name}</span>
              <div className="stem-buttons">
                <button
                  className={`round-btn ${muted.has(s.name) ? "on" : ""}`}
                  title="mute"
                  onClick={() => flip(setMuted, s.name)}
                >
                  M
                </button>
                <button
                  className={`round-btn ${soloed.has(s.name) ? "on" : ""}`}
                  title="solo"
                  onClick={() => flip(setSoloed, s.name)}
                >
                  S
                </button>
                <a className="round-btn" title="download" href={s.downloadUrl ?? s.url} download>
                  ↓
                </a>
              </div>
            </div>
            <div className="stem-wave" style={{ "--c": color }} onClick={onSeek}>
              {peaks ? (
                peaks[i].map((p, b) => (
                  <span
                    key={b}
                    className={b / BAR_COUNT < progress ? "played" : ""}
                    style={{ height: `${p * 100}%` }}
                  />
                ))
              ) : (
                <span className="wave-loading">loading waveform…</span>
              )}
              <div className="playhead" style={{ left: `${progress * 100}%` }} />
            </div>
          </div>
        );
      })}

      <div className="transport">
        <button className="play-btn" disabled={!engine.buffers} onClick={engine.toggle}>
          {engine.playing ? "❚❚" : "▶"}
        </button>
        <div>
          <div className="transport-title">{title}</div>
          <div className="muted">{fmt(engine.time)} / {fmt(engine.duration)}</div>
        </div>
      </div>
    </div>
  );
}
