"use client";

import { useEffect, useRef, useState } from "react";
import { createIdea } from "./library-client";
import { scriptParagraphs, type Idea, type Script } from "@/lib/spark-data";
import { Icon } from "./icon";
import { Teleprompter } from "./teleprompter";

type Screen = { kind: "library" } | { kind: "new" } | { kind: "idea"; idea: Idea } | { kind: "script" | "record"; script: Script };

type Props = {
  ideas: Idea[];
  scripts: Script[];
  onIdeaCreated: (idea: Idea) => void;
  libraryError: boolean;
  pendingScriptId?: string | null;
  onPendingScriptConsumed?: () => void;
};

function Badge({ status }: { status: Idea["status"] | Script["status"] }) {
  return <span className={`badge ${status === "Ready to record" ? "ready" : status === "Shaped" || status === "Editing" ? "shaped" : "raw"}`}>{status}</span>;
}

function IdeaForm({ onCreated, onCancel }: { onCreated: (idea: Idea) => void; onCancel: () => void }) {
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    if (!transcript.trim()) { setError("Enter an idea before saving."); input.current?.focus(); return; }
    setSaving(true);
    setError("");
    const controller = new AbortController();
    abort.current = controller;
    try {
      const result = await createIdea(transcript, controller.signal);
      if ("idea" in result) {
        onCreated(result.idea);
      } else {
        setError(result.error);
        setSaving(false);
      }
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setError("Could not reach Spark. Check your connection and try again.");
      setSaving(false);
    }
  }

  return <form className="idea-form" noValidate onSubmit={submit}>
    <p className="form-intro">Big things start with a little thought.</p>
    <label htmlFor="idea-transcript">Your idea</label>
    <textarea ref={input} id="idea-transcript" value={transcript} maxLength={8000} autoFocus placeholder="Catch it before it disappears…" aria-invalid={!!error} aria-describedby={error ? "idea-error" : undefined} onChange={event => { setTranscript(event.target.value); setError(""); }} />
    <span className="character-count">{transcript.length.toLocaleString()} / 8,000</span>
    {error && <p id="idea-error" className="form-error" role="alert">{error}</p>}
    <p className="local-note">Saved to your Spark library.</p>
    <button className="primary-button" type="submit" disabled={saving}>{saving ? "Saving…" : "Save idea"}</button>
    <button className="text-button" type="button" onClick={onCancel}>Cancel</button>
  </form>;
}

export default function SparkPrototype({ ideas, scripts, onIdeaCreated, libraryError, pendingScriptId, onPendingScriptConsumed }: Props) {
  const [tab, setTab] = useState<"Ideas" | "Scripts">(pendingScriptId ? "Scripts" : "Ideas");
  const [screen, setScreen] = useState<Screen>(() => {
    const script = pendingScriptId ? scripts.find(item => item.id === pendingScriptId) : undefined;
    return script ? { kind: "script", script } : { kind: "library" };
  });
  const heading = useRef<HTMLHeadingElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);

  useEffect(() => {
    if (pendingScriptId) onPendingScriptConsumed?.();
  }, [pendingScriptId, onPendingScriptConsumed]);

  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    heading.current?.focus({ preventScroll: true });
    content.current?.scrollTo(0, 0);
  }, [screen]);

  const goHome = () => setScreen({ kind: "library" });
  const recording = screen.kind === "record";
  const dates = Array.from(new Set(ideas.map(idea => idea.date)));

  return <div className="prototype-stage">
    <div className="device-wrap">
      <div className={`iphone ${recording ? "dark-phone" : ""}`}>
        <span className="hardware-button silent-switch" /><span className="hardware-button volume-up" /><span className="hardware-button volume-down" /><span className="hardware-button power-button" />
        <div className="phone-screen">
          <div className="status-bar" aria-hidden="true"><span>9:41</span><div className="dynamic-island"><i /></div><div className="status-icons"><span className="signal"><i /><i /><i /><i /></span><svg width="17" height="14" viewBox="0 0 20 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 5q8-7 16 0M5 8q5-5 10 0M8 11q2-2 4 0" /><circle cx="10" cy="14" r="1" fill="currentColor" stroke="none" /></svg><span className="battery" /></div></div>
          {recording ? <Teleprompter script={screen.script} onClose={() => setScreen({ kind: "script", script: screen.script })} /> : <div className="app-content" ref={content}>
            {libraryError && <p className="library-error" role="alert">Couldn’t load your library. Check your connection and try again.</p>}
            {screen.kind === "library" ? <>
              <header className="library-header"><div><h1 ref={heading} tabIndex={-1}>Spark<span className="brand-period" aria-hidden="true">.</span></h1><p>Capture thoughts. Create better videos.</p></div><button className="add-button" aria-label="Add idea" onClick={() => setScreen({ kind: "new" })}><Icon name="plus" size={25} /></button></header>
              <div className="segmented-control" role="group" aria-label="Library view">{(["Ideas", "Scripts"] as const).map(name => <button key={name} aria-pressed={tab === name} className={tab === name ? "selected" : ""} onClick={() => setTab(name)}>{name}</button>)}</div>
              {tab === "Ideas" ? (ideas.length === 0 ? <div className="empty-state"><span className="small-spark">✧</span><p>No ideas yet</p><span>Press the pendant to capture one, or add it below.</span></div> : <div className="idea-groups">{dates.map(date => <section className="date-group" key={date}><div className="group-heading"><h2>{date}</h2><span>{ideas.filter(idea => idea.date === date).length} ideas</span></div><div>{ideas.filter(idea => idea.date === date).map(idea => <button className="library-row" key={idea.id} aria-label={idea.title} onClick={() => setScreen({ kind: "idea", idea })}><span className="row-icon"><Icon name="bulb" size={23} /></span><span className="row-content"><span className="row-title">{idea.title}</span><span className="row-meta">{idea.time}<span className="meta-dot">·</span><Badge status={idea.status} /></span></span><span className="row-more" aria-hidden="true">···</span></button>)}</div></section>)}</div>) : (scripts.length === 0 ? <div className="empty-state"><span className="small-spark">✧</span><p>No scripts yet</p><span>Capture an idea, then ask for a script within the hour.</span></div> : <div className="scripts-list"><div className="group-heading"><h2>Your scripts</h2><span>{scripts.length} scripts</span></div>{scripts.map(script => <button className="library-row script-row" key={script.id} aria-label={script.title} onClick={() => setScreen({ kind: "script", script })}><span className="row-icon"><Icon name="script" size={24} /></span><span className="row-content"><span className="row-title">{script.title}</span><span className="row-meta">{script.ideaIds.length} ideas<span className="meta-dot">·</span><Badge status={script.status} /></span></span><span className="row-more" aria-hidden="true">···</span></button>)}<div className="library-footnote"><span className="small-spark">✧</span><p>A few thoughts. A new perspective.</p></div></div>)}
            </> : <>
              <nav className="detail-nav" aria-label="Back navigation"><button className="back-button" aria-label={screen.kind === "idea" || screen.kind === "new" ? "Back to ideas" : "Back to scripts"} onClick={goHome}><Icon name="back" size={22} /><span>{screen.kind === "script" ? "Scripts" : "Ideas"}</span></button><span>{screen.kind === "new" ? "NEW IDEA" : screen.kind === "idea" ? "YOUR THOUGHT" : "SCRIPT"}</span></nav>
              {screen.kind === "new" ? <><h1 className="detail-title" ref={heading} tabIndex={-1}>Catch a spark.</h1><IdeaForm onCancel={goHome} onCreated={idea => { onIdeaCreated(idea); setTab("Ideas"); goHome(); }} /></> : screen.kind === "idea" ? <>
                <div className="idea-detail-icon row-icon"><Icon name="bulb" size={28} /></div><h1 className="detail-title" ref={heading} tabIndex={-1}>{screen.idea.title}</h1><div className="detail-meta"><Badge status={screen.idea.status} /><span>{screen.idea.date} · {screen.idea.time}</span></div>
                <section className="thought-card"><h2>The thought</h2><p>{screen.idea.note || "No extra notes yet. Sometimes a title is all you need."}</p></section>
                {scripts.filter(script => script.ideaIds.includes(screen.idea.id)).map(script => <button className="linked-script" key={script.id} onClick={() => setScreen({ kind: "script", script })}><Icon name="script" size={23} /><span><small>PART OF A SCRIPT</small>{script.title}</span><Icon name="arrow" size={19} /></button>)}
              </> : <>
                <h1 className="detail-title" ref={heading} tabIndex={-1}>{screen.script.title}</h1>
                <section className="script-section"><h2>Script <span>Made from your thoughts</span></h2><div className="script-card">{scriptParagraphs(screen.script.text).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div></section>
                <div className="record-action"><button className="primary-button" onClick={() => { if (screen.kind === "script") setScreen({ kind: "record", script: screen.script }); }}><Icon name="video" size={21} />Record with Teleprompter</button><span>Find your flow. One take at a time.</span></div>
              </>}
            </>}
          </div>}
          <div className="home-indicator" aria-hidden="true" />
        </div>
      </div>
      <div className="prototype-caption"><span className="caption-dot" />Interactive prototype<span className="caption-divider">/</span>Made for your next idea</div>
    </div>
  </div>;
}
