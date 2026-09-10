"use client";

import { useState } from "react";
import Link from "next/link";
import { Necklace } from "./necklace";
import { captureNavigationItems, isPhoneTab } from "./capture-navigation";
import type { CaptureUploadResult } from "./capture-client";
import SparkPrototype from "./spark/spark-prototype";
import { useRecorder } from "./use-recorder";
import { scriptParagraphs, type Idea, type LibraryData, type Script } from "@/lib/spark-data";

function SoundMark() {
  return <span className="sound-mark" aria-hidden="true">{[12, 24, 43, 58, 32, 18, 10].map((height, i) => <i key={i} style={{ height }} />)}</span>;
}

function CaptureExperience({ onCreated, onViewScript }: { onCreated: (result: CaptureUploadResult) => void; onViewScript: (scriptId: string) => void }) {
  const recording = useRecorder({ onCreated });
  const [playbackError, setPlaybackError] = useState(false);
  const { phase, result } = recording;
  const busy = phase === "requesting" || phase === "processing";
  const isRecording = phase === "recording";
  const elapsed = `00:${String(recording.seconds).padStart(2, "0")}`;
  const failure = result?.kind === "error" ? result : null;

  function press() {
    setPlaybackError(false);
    if (isRecording) recording.stop();
    else void recording.start();
  }

  function recoveryControl() {
    if (!failure || failure.recovery === "retry") return <button className="text-button" onClick={recording.retryUpload}>Try again</button>;
    if (failure.recovery === "record_again") return <button className="text-button" onClick={() => void recording.start()}>Record again</button>;
    if (failure.recovery === "sign_in") return <Link className="text-button" href="/">Sign in again</Link>;
    return <button className="text-button" onClick={recording.reset}>Back</button>;
  }

  return (
    <>
      <main id="capture" className="hero">
        <section className="intro">
          <p className="eyebrow"><span /> YOUR IDEAS. UNINTERRUPTED.</p>
          <h1>Capture ideas<br />in the moment.</h1>
          <p className="intro-copy">Speak the thought.<br />Spark shapes it.</p>
          <div className="intro-foot"><span className="tiny-spark">✳</span><p>A wearable AI companion<br />for the way creators think.</p></div>
        </section>

        <div className="product-stage">
          <Necklace recording={isRecording} busy={busy} onPress={press} />
          <div className="product-caption"><span>SPARK ONE</span><span>Made for the moment.</span></div>
        </div>

        <section id="capture-panel" className={`capture-panel phase-${phase}`} tabIndex={-1} aria-label="Voice capture">
          <div className="panel-top"><span><i className={isRecording ? "red-dot" : "green-dot"} />{isRecording ? "Microphone on" : "Interactive demo"}</span><span className="battery" aria-label="Simulated battery 80 percent"><svg viewBox="0 0 26 14" aria-hidden="true"><rect x="1" y="1" width="21" height="12" rx="3" /><path d="M25 5v4" /><rect className="battery-fill" x="4" y="4" width="14" height="6" rx="1" /></svg>80%</span></div>

          {(phase === "ready" || phase === "requesting" || phase === "error") && <div className="ready-content">
            <div className={`orb ${phase === "requesting" ? "waiting" : ""}`}><SoundMark /></div>
            <div aria-live="polite"><p className="state-label">{phase === "requesting" ? "ONE LITTLE PERMISSION" : phase === "error" ? "LET’S TRY THAT AGAIN" : "A THOUGHT WORTH KEEPING"}</p>
              <h2>{phase === "requesting" ? "Let’s hear your idea." : phase === "error" ? "Check your microphone." : "Ready when you are."}</h2></div>
            {phase === "error" ? <p className="error-message" role="alert">{recording.error}</p> : <p className="panel-copy">{phase === "requesting" ? "Allow microphone access in your browser to start capturing." : <>An idea just hit you?<br />Press the side button and start talking.</>}</p>}
            {phase === "requesting" ? <button className="text-button" onClick={recording.reset}>Cancel</button> : phase === "error" ? recoveryControl() : <button className="text-button" onClick={() => void recording.start()}>Or try it here <span aria-hidden="true">↗</span></button>}
          </div>}

          {isRecording && <div className="recording-content">
            <p className="state-label">LET IT ALL OUT</p><h2>Listening to you.</h2><p className="panel-copy">No perfect words needed.<br />Just follow your thought.</p>
            <div className="waveform" aria-hidden="true">{recording.levels.map((height, i) => <i key={i} style={{ height }} />)}</div>
            <div className="recording-time"><span className="red-dot" /> Recording <time>{elapsed}</time></div>
            <button className="primary-button" onClick={recording.stop}><span className="stop-square" /> Finish my thought</button>
            <button className="text-button" onClick={recording.reset}>Cancel</button>
            <p className="small-note">Up to 60 seconds. Just enough for a spark.</p>
          </div>}

          {phase === "processing" && <div className="processing-content" role="status"><div className="orb"><span className="spinner" /></div><p className="state-label">CONNECTING THE DOTS</p><h2>Shaping your idea.</h2><p className="panel-copy">Transcribing your recording and shaping it into something useful.</p><p className="small-note">This usually takes a few seconds…</p><button className="text-button" onClick={recording.reset}>Cancel</button></div>}

          {phase === "done" && result && <div className="result-content">
            {result.kind === "idea" ? <>
              <div className="result-heading"><span className="checkmark">✓</span><h2>Your idea, captured.</h2><span>{elapsed}</span></div>
              <h3>{result.idea.title}</h3>
              <p className="result-copy">{result.idea.note}</p>
            </> : result.kind === "script" ? <>
              <div className="result-heading"><span className="checkmark">✓</span><h2>Your script, ready.</h2><span>{elapsed}</span></div>
              <h3>{result.script.title}</h3>
              <p className="result-copy">{scriptParagraphs(result.script.text)[0] ?? result.script.title}</p>
              <button className="primary-button" onClick={() => onViewScript(result.script.id)}><span aria-hidden="true">↗</span> View it in Phone → Scripts</button>
            </> : <>
              <div className="result-heading"><span className="checkmark">✓</span><h2>Almost there.</h2><span>{elapsed}</span></div>
              <p className="result-copy">{result.message}</p>
            </>}
            <div className="audio-label">YOUR RECORDING <span>Transcribed, not stored</span></div>
            <audio aria-label="Your recorded idea" controls src={recording.audioUrl} onError={() => setPlaybackError(true)} />
            {playbackError && <p className="playback-error" role="status">Playback is unavailable. Save the audio to listen on your device.</p>}
            <a className="download-link" href={recording.audioUrl} download="spark-idea">Save audio <span aria-hidden="true">↗</span></a>
            <button className="primary-button" onClick={recording.reset}><span aria-hidden="true">↻</span> Try another idea</button>
          </div>}
          <div className="panel-bottom"><svg viewBox="0 0 16 16" aria-hidden="true"><rect x="4" y="7" width="8" height="6" rx="2" /><path d="M6 7V5a2 2 0 0 1 4 0v2" /></svg> Audio is transcribed to capture your idea, then discarded.</div>
        </section>
      </main>
      <footer className="footer"><span className="footer-index">01 — CAPTURE THE SPARK</span><p><span /> MORE TALKING. LESS TYPING.</p><span className="footer-right">Thought → possibility</span></footer>
    </>
  );
}

function prepend<T extends { id: string }>(list: T[], item: T): T[] {
  return [item, ...list.filter(existing => existing.id !== item.id)];
}

export default function Capture({ initialLibrary, libraryError }: { initialLibrary?: LibraryData; libraryError: boolean }) {
  const [tab, setTab] = useState("Capture");
  const [ideas, setIdeas] = useState<Idea[]>(initialLibrary?.ideas ?? []);
  const [scripts, setScripts] = useState<Script[]>(initialLibrary?.scripts ?? []);
  const [pendingScriptId, setPendingScriptId] = useState<string | null>(null);

  const onIdeaCreated = (idea: Idea) => setIdeas(current => prepend(current, idea));
  const onScriptCreated = (script: Script) => setScripts(current => prepend(current, script));

  function handleCreated(result: CaptureUploadResult) {
    if (result.kind === "idea") onIdeaCreated(result.idea);
    else if (result.kind === "script") onScriptCreated(result.script);
  }

  function openScript(scriptId: string) {
    setTab("Phone");
    setPendingScriptId(scriptId);
  }

  return (
    <div className="experience">
      <header className="header">
        <a className="brand" href="#capture" aria-label="Spark home">SPARK <span>by PrepVid</span></a>
        <nav className="navigation" aria-label="Main navigation">
          {captureNavigationItems.map(item => <button key={item} aria-pressed={tab === item} className={tab === item ? "selected" : ""} onClick={() => setTab(item)}>{item}</button>)}
        </nav>
        <p className="header-note">A little space for your next big idea.</p>
      </header>
      {isPhoneTab(tab)
        ? <main aria-label="Phone mock"><SparkPrototype ideas={ideas} scripts={scripts} onIdeaCreated={onIdeaCreated} libraryError={libraryError} pendingScriptId={pendingScriptId} onPendingScriptConsumed={() => setPendingScriptId(null)} /></main>
        : <CaptureExperience onCreated={handleCreated} onViewScript={openScript} />}
    </div>
  );
}
