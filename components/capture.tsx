"use client";

import { useEffect, useRef, useState } from "react";
import { Necklace } from "./necklace";
import { captureNavigationItems, isPhoneTab } from "./capture-navigation";
import { uploadCapture, uploadTranscript, type CaptureUploadResult } from "./capture-client";
import SparkPrototype from "./spark/spark-prototype";
import { loadLibrary } from "./spark/library-client";
import { useRecorder, type PendingCapture } from "./use-recorder";
import { type Idea, type LibraryData, type Script } from "@/lib/spark-data";

function SoundMark() {
  return <span className="sound-mark" aria-hidden="true">{[12, 24, 43, 58, 32, 18, 10].map((height, i) => <i key={i} style={{ height }} />)}</span>;
}

const MAX_PENDING_CAPTURES = 5;

function CaptureExperience({ onQueued }: { onQueued: (capture: PendingCapture) => boolean }) {
  const recording = useRecorder({ onQueued });
  const [playbackError, setPlaybackError] = useState(false);
  const { phase } = recording;
  const busy = phase === "requesting" || phase === "processing";
  const isRecording = phase === "recording";
  const elapsed = `00:${String(recording.seconds).padStart(2, "0")}`;

  function press() {
    setPlaybackError(false);
    if (isRecording) recording.stop();
    else void recording.start();
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
            {phase === "requesting" ? <button className="text-button" onClick={recording.reset}>Cancel</button> : phase === "error" ? <button className="text-button" onClick={() => void recording.start()}>Record again</button> : <button className="text-button" onClick={() => void recording.start()}>Or try it here <span aria-hidden="true">↗</span></button>}
          </div>}

          {isRecording && <div className="recording-content">
            <p className="state-label">LET IT ALL OUT</p><h2>Listening to you.</h2><p className="panel-copy">No perfect words needed.<br />Just follow your thought.</p>
            <div className="waveform" aria-hidden="true">{recording.levels.map((height, i) => <i key={i} style={{ height }} />)}</div>
            <div className="live-transcript" role="status" aria-label="Live transcript" aria-live="polite">
              {recording.transcript || (recording.liveTranscriptStatus === 'unavailable'
                ? 'Live captions are unavailable; your recording will still be captured.'
                : 'Listening for your words…')}
            </div>
            <div className="recording-time"><span className="red-dot" /> Recording <time>{elapsed}</time></div>
            <button className="primary-button" onClick={recording.stop}><span className="stop-square" /> Finish my thought</button>
            <button className="text-button" onClick={recording.reset}>Cancel</button>
            <p className="small-note">Up to 60 seconds. Just enough for a spark.</p>
          </div>}

          {phase === "processing" && <div className="processing-content" role="status"><div className="orb"><span className="spinner" /></div><p className="state-label">CONNECTING THE DOTS</p><h2>Shaping your idea.</h2><p className="panel-copy">Transcribing your recording and shaping it into something useful.</p><p className="small-note">This usually takes a few seconds…</p><button className="text-button" onClick={recording.reset}>Cancel</button></div>}

          {phase === "done" && <div className="result-content">
            <div className="result-heading"><span className="checkmark">✓</span><h2>Saved on Spark One.</h2><span>{elapsed}</span></div>
            <p className="result-copy">Your idea is ready to sync when you open Phone.</p>
            <div className="audio-label">YOUR RECORDING <span>Stored until synced</span></div>
            <audio aria-label="Your recorded idea" controls src={recording.audioUrl} onError={() => setPlaybackError(true)} />
            {playbackError && <p className="playback-error" role="status">Playback is unavailable. Save the audio to listen on your device.</p>}
            <a className="download-link" href={recording.audioUrl} download="spark-idea">Save audio <span aria-hidden="true">↗</span></a>
            <button className="primary-button" onClick={recording.reset}><span aria-hidden="true">↻</span> Try another idea</button>
          </div>}
          <div className="panel-bottom"><svg viewBox="0 0 16 16" aria-hidden="true"><rect x="4" y="7" width="8" height="6" rx="2" /><path d="M6 7V5a2 2 0 0 1 4 0" /></svg> Audio stays on Spark One until it syncs, then is discarded.</div>
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
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState("");
  const [libraryLoadError, setLibraryLoadError] = useState(libraryError);
  const [pendingCaptures, setPendingCaptures] = useState<PendingCapture[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [syncMessage, setSyncMessage] = useState("");
  const pendingRef = useRef<PendingCapture[]>([]);
  const syncingRef = useRef(false);
  const syncAbort = useRef<AbortController | null>(null);

  useEffect(() => { pendingRef.current = pendingCaptures; }, [pendingCaptures]);
  useEffect(() => () => syncAbort.current?.abort(), []);

  const onIdeaCreated = (idea: Idea) => setIdeas(current => prepend(current, idea));
  const onScriptCreated = (script: Script) => setScripts(current => prepend(current, script));

  async function refreshLibrary() {
    if (refreshing) return;
    setRefreshing(true);
    setRefreshError("");
    setLibraryLoadError(false);
    try {
      const result = await loadLibrary();
      if ("library" in result) {
        setIdeas(result.library.ideas);
        setScripts(result.library.scripts);
      } else {
        setRefreshError(result.error);
      }
    } finally {
      setRefreshing(false);
    }
  }

  function handleCreated(result: CaptureUploadResult) {
    if (result.kind === "idea") onIdeaCreated(result.idea);
    else if (result.kind === "script") onScriptCreated(result.script);
  }

  function queueCapture(capture: PendingCapture) {
    if (pendingRef.current.length >= MAX_PENDING_CAPTURES) return false;
    const next = [...pendingRef.current, capture];
    pendingRef.current = next;
    setPendingCaptures(next);
    setSyncError("");
    setSyncMessage("");
    return true;
  }

  async function syncPendingCaptures() {
    if (syncingRef.current || pendingRef.current.length === 0) return;
    syncingRef.current = true;
    setSyncing(true);
    setSyncError("");
    setSyncMessage("");
    const controller = new AbortController();
    syncAbort.current = controller;
    let remaining = pendingRef.current;
    try {
      while (remaining.length > 0) {
        const capture = remaining[0];
        const result = capture.transcript
          ? await uploadTranscript(capture.transcript, controller.signal)
          : await uploadCapture(capture.audio, controller.signal);
        if (result.kind === "error") {
          setSyncError(result.message);
          return;
        }
        if (result.kind === "no_recent_ideas") setSyncMessage(result.message);
        else handleCreated(result);
        remaining = remaining.slice(1);
        pendingRef.current = remaining;
        setPendingCaptures(remaining);
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) setSyncError("Could not reach Spark. Check your connection and try again.");
    } finally {
      if (syncAbort.current === controller) syncAbort.current = null;
      syncingRef.current = false;
      setSyncing(false);
    }
  }

  function selectTab(nextTab: string) {
    setTab(nextTab);
    if (isPhoneTab(nextTab)) void syncPendingCaptures();
  }

  return (
    <div className="experience">
      <header className="header">
        <a className="brand" href="#capture" aria-label="Spark home">SPARK <span>by PrepVid</span></a>
        <nav className="navigation" aria-label="Main navigation">
          {captureNavigationItems.map(item => <button key={item} aria-pressed={tab === item} className={tab === item ? "selected" : ""} onClick={() => selectTab(item)}>{item}</button>)}
        </nav>
        <p className="header-note">A little space for your next big idea.</p>
      </header>
      {isPhoneTab(tab)
        ? <main aria-label="Phone mock"><SparkPrototype ideas={ideas} scripts={scripts} onIdeaCreated={onIdeaCreated} onScriptCreated={onScriptCreated} libraryError={libraryLoadError} pendingScriptId={pendingScriptId} onPendingScriptConsumed={() => setPendingScriptId(null)} onRefresh={refreshLibrary} refreshing={refreshing} refreshError={refreshError} pendingCaptureCount={pendingCaptures.length} syncing={syncing} syncError={syncError} syncMessage={syncMessage} onRetrySync={() => void syncPendingCaptures()} /></main>
        : <CaptureExperience onQueued={queueCapture} />}
    </div>
  );
}
