import { useEffect, useRef, useState } from "react";
import type { Script } from "@/lib/spark-data";
import { Icon } from "./icon";

export function Teleprompter({ script, onClose }: { script: Script; onClose: () => void }) {
  const [running, setRunning] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [speed, setSpeed] = useState(1);
  const prompt = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const active = running && seconds < 600;
  useEffect(() => { closeButton.current?.focus(); }, []);
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setSeconds(value => Math.min(value + 1, 600)), 1000);
    const scroll = window.setInterval(() => { prompt.current?.scrollBy(0, speed); }, 50);
    return () => { window.clearInterval(timer); window.clearInterval(scroll); };
  }, [active, speed]);
  function reset() {
    setRunning(false);
    setSeconds(0);
    prompt.current?.scrollTo(0, 0);
  }
  return (
    <section className="recorder" aria-label="Teleprompter rehearsal" onKeyDown={event => { if (event.key === "Escape") onClose(); }}>
      <div className="record-toolbar">
        <button ref={closeButton} className="icon-button" aria-label="Close teleprompter" onClick={onClose}><Icon name="close" /></button>
        <div className="record-time"><span className={active ? "record-dot live" : "record-dot"} /><span role="timer" aria-label="Rehearsal time">{String(Math.floor(seconds / 60)).padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")}</span></div>
        <span className="demo-pill">DEMO</span>
      </div>
      <div className="prompt-window" ref={prompt} tabIndex={0} aria-label="Script to read">
        <p className="prompt-hook">{script.hook}</p>
        {script.points.map(point => <p key={point}>{point}</p>)}
        <p>{script.outro}</p>
        <p className="prompt-end">You’ve got this.</p>
      </div>
      <div className="preview-placeholder" aria-hidden="true"><div className="viewfinder"><Icon name="video" size={30} /></div><span>Your space to create.</span></div>
      <div className="record-bottom">
        <p className="rehearsal-state" role="status">{seconds >= 600 ? "Rehearsal complete. Reset to begin again." : active ? "Rehearsing…" : seconds > 0 ? "Paused. Take your time." : "Take a breath. Make it yours."}</p>
        <div className="record-controls">
          <button className="round-control" aria-label="Reading speed" onClick={() => setSpeed(value => value >= 2 ? 0.75 : value + 0.25)}>{speed}×</button>
          <button className={`record-button ${active ? "is-recording" : ""}`} aria-label={active ? "Pause rehearsal" : "Start rehearsal"} disabled={seconds >= 600} onClick={() => setRunning(value => !value)}><span /></button>
          <button className="round-control" aria-label="Reset rehearsal" onClick={reset}><Icon name="reset" size={21} /></button>
        </div>
        <p className="demo-notice">Demo mode · No video or audio is captured</p>
      </div>
    </section>
  );
}
