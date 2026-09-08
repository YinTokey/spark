import { useEffect, useRef, useState } from "react";
import type { Script } from "@/lib/spark-data";
import { Icon } from "./icon";

export function Teleprompter({ script, onClose }: { script: Script; onClose: () => void }) {
  const [running, setRunning] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [cameraError, setCameraError] = useState("");
  const prompt = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const active = running && seconds < 600;

  useEffect(() => { closeButton.current?.focus(); }, []);

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | undefined;
    const request = navigator.mediaDevices?.getUserMedia
      ? navigator.mediaDevices.getUserMedia({ video: true })
      : Promise.reject(new Error("Camera isn't available in this browser."));
    request
      .then(camera => {
        if (cancelled) { camera.getTracks().forEach(track => track.stop()); return; }
        stream = camera;
        if (video.current) {
          video.current.srcObject = camera;
          void video.current.play().catch(() => {});
        }
        setCameraError("");
      })
      .catch(cause => {
        if (!cancelled) setCameraError(cause instanceof DOMException && cause.name === "NotAllowedError"
          ? "Camera permission was blocked. Reading along without video."
          : "Couldn't open your camera. Reading along without video.");
      });
    return () => {
      cancelled = true;
      stream?.getTracks().forEach(track => track.stop());
    };
  }, []);

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

  function scrollScript(amount: number) {
    prompt.current?.scrollBy({ top: amount, behavior: "smooth" });
  }

  return (
    <section className="recorder" aria-label="Teleprompter rehearsal" onKeyDown={event => { if (event.key === "Escape") onClose(); }}>
      <video ref={video} className="camera-feed" autoPlay playsInline muted aria-hidden="true" />
      <div className="record-toolbar">
        <button ref={closeButton} className="icon-button" aria-label="Close teleprompter" onClick={onClose}><Icon name="close" /></button>
        <div className="scroll-controls">
          <button className="icon-button" aria-label="Scroll script up" onClick={() => scrollScript(-90)}>↑</button>
          <button className="icon-button" aria-label="Scroll script down" onClick={() => scrollScript(90)}>↓</button>
        </div>
        <div className="toolbar-end">
          <div className="record-time"><span className={active ? "record-dot live" : "record-dot"} /><span role="timer" aria-label="Rehearsal time">{String(Math.floor(seconds / 60)).padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")}</span></div>
          <span className="demo-pill">DEMO</span>
        </div>
      </div>
      <div className="prompt-overlay">
        <div className="prompt-window" ref={prompt} tabIndex={0} aria-label="Script to read">
          <p className="prompt-hook">{script.hook}</p>
          {script.points.map(point => <p key={point}>{point}</p>)}
          <p>{script.outro}</p>
          <p className="prompt-end">You’ve got this.</p>
        </div>
      </div>
      {cameraError && <p className="camera-fallback" role="status">{cameraError}</p>}
      <div className="record-bottom">
        <p className="rehearsal-state" role="status">{seconds >= 600 ? "Rehearsal complete. Reset to begin again." : active ? "Rehearsing…" : seconds > 0 ? "Paused. Take your time." : "Take a breath. Make it yours."}</p>
        <div className="record-controls">
          <button className="round-control" aria-label="Reading speed" onClick={() => setSpeed(value => value >= 2 ? 0.75 : value + 0.25)}>{speed}×</button>
          <button className={`record-button ${active ? "is-recording" : ""}`} aria-label={active ? "Pause rehearsal" : "Start rehearsal"} disabled={seconds >= 600} onClick={() => setRunning(value => !value)}><span /></button>
          <button className="round-control" aria-label="Reset rehearsal" onClick={reset}><Icon name="reset" size={21} /></button>
        </div>
        <p className="demo-notice">Live preview · Nothing is recorded or saved</p>
      </div>
    </section>
  );
}
