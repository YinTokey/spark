"use client";

import { useEffect, useRef, useState } from "react";
import { sampleIdeas, sampleScripts, type Idea, type Script } from "@/lib/spark-data";
import { Icon } from "./icon";
import { Teleprompter } from "./teleprompter";

type Screen = { kind: "library" } | { kind: "new" } | { kind: "idea"; idea: Idea } | { kind: "script" | "record"; script: Script };

function Badge({ status }: { status: Idea["status"] | Script["status"] }) {
  return <span className={`badge ${status === "Ready to record" ? "ready" : status === "Shaped" || status === "Editing" ? "shaped" : "raw"}`}>{status}</span>;
}

function IdeaForm({ onSave, onCancel, full }: { onSave: (title: string, note: string) => void; onCancel: () => void; full: boolean }) {
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const titleInput = useRef<HTMLInputElement>(null);
  return <form className="idea-form" noValidate onSubmit={event => {
    event.preventDefault();
    if (!title.trim()) { setError("Give your idea a title."); titleInput.current?.focus(); return; }
    if (title.trim().length > 100 || note.length > 2000) { setError("Keep the title under 101 characters and your thought under 2,001."); return; }
    if (full) { setError("This demo holds up to 50 ideas. Reload to start a fresh session."); return; }
    onSave(title.trim(), note.trim());
  }}>
    <p className="form-intro">Big things start with a little thought.</p>
    <label htmlFor="idea-title">Title</label>
    <input ref={titleInput} id="idea-title" value={title} maxLength={100} placeholder="What’s on your mind?" aria-invalid={!!error} aria-describedby={error ? "idea-error" : undefined} onChange={event => { setTitle(event.target.value); setError(""); }} />
    <label htmlFor="idea-note">Your thought <span>optional</span></label>
    <textarea id="idea-note" value={note} maxLength={2000} placeholder="Catch it before it disappears…" onChange={event => setNote(event.target.value)} />
    <span className="character-count">{note.length.toLocaleString()} / 2,000</span>
    {error && <p id="idea-error" className="form-error" role="alert">{error}</p>}
    <p className="local-note">Saved for this demo session. Refreshing resets your ideas.</p>
    <button className="primary-button" type="submit"><Icon name="check" size={20} />Save idea</button>
    <button className="text-button" type="button" onClick={onCancel}>Cancel</button>
  </form>;
}

export default function SparkPrototype() {
  const [ideas, setIdeas] = useState(sampleIdeas);
  const [tab, setTab] = useState<"Ideas" | "Scripts">("Ideas");
  const [screen, setScreen] = useState<Screen>({ kind: "library" });
  const heading = useRef<HTMLHeadingElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);
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
            {screen.kind === "library" ? <>
              <header className="library-header"><div><h1 ref={heading} tabIndex={-1}>Spark<span className="brand-period" aria-hidden="true">.</span></h1><p>Capture thoughts. Create better videos.</p></div><button className="add-button" aria-label="Add idea" onClick={() => setScreen({ kind: "new" })}><Icon name="plus" size={25} /></button></header>
              <div className="segmented-control" role="group" aria-label="Library view">{(["Ideas", "Scripts"] as const).map(name => <button key={name} aria-pressed={tab === name} className={tab === name ? "selected" : ""} onClick={() => setTab(name)}>{name}</button>)}</div>
              {tab === "Ideas" ? <div className="idea-groups">{dates.map(date => <section className="date-group" key={date}><div className="group-heading"><h2>{date}</h2><span>{ideas.filter(idea => idea.date === date).length} ideas</span></div><div>{ideas.filter(idea => idea.date === date).map(idea => <button className="library-row" key={idea.id} aria-label={idea.title} onClick={() => setScreen({ kind: "idea", idea })}><span className={`row-icon ${idea.id === "walking" ? "warm" : ""}`}><Icon name="bulb" size={23} /></span><span className="row-content"><span className="row-title">{idea.title}</span><span className="row-meta">{idea.time}<span className="meta-dot">·</span><Badge status={idea.status} /></span></span><span className="row-more" aria-hidden="true">···</span></button>)}</div></section>)}</div> : <div className="scripts-list"><div className="group-heading"><h2>Your scripts</h2><span>{sampleScripts.length} scripts</span></div>{sampleScripts.map(script => <button className="library-row script-row" key={script.id} aria-label={script.title} onClick={() => setScreen({ kind: "script", script })}><span className="row-icon"><Icon name="script" size={24} /></span><span className="row-content"><span className="row-title">{script.title}</span><span className="row-meta">{script.ideaIds.length} ideas<span className="meta-dot">·</span><Badge status={script.status} /></span></span><span className="row-more" aria-hidden="true">···</span></button>)}<div className="library-footnote"><span className="small-spark">✧</span><p>A few thoughts. A new perspective.</p></div></div>}
            </> : <>
              <nav className="detail-nav" aria-label="Back navigation"><button className="back-button" aria-label={screen.kind === "idea" ? "Back to ideas" : screen.kind === "new" ? "Back to ideas" : "Back to scripts"} onClick={goHome}><Icon name="back" size={22} /><span>{screen.kind === "script" ? "Scripts" : "Ideas"}</span></button><span>{screen.kind === "new" ? "NEW IDEA" : screen.kind === "idea" ? "YOUR THOUGHT" : "SCRIPT"}</span></nav>
              {screen.kind === "new" ? <><h1 className="detail-title" ref={heading} tabIndex={-1}>Catch a spark.</h1><IdeaForm full={ideas.length >= 50} onCancel={goHome} onSave={(title, note) => { setIdeas(current => [{ id: crypto.randomUUID(), title, note, date: "Today", time: "Just now", status: "Raw" }, ...current]); setTab("Ideas"); goHome(); }} /></> : screen.kind === "idea" ? <>
                <div className="idea-detail-icon row-icon"><Icon name="bulb" size={28} /></div><h1 className="detail-title" ref={heading} tabIndex={-1}>{screen.idea.title}</h1><div className="detail-meta"><Badge status={screen.idea.status} /><span>{screen.idea.date} · {screen.idea.time}</span></div>
                <section className="thought-card"><h2>The thought</h2><p>{screen.idea.note || "No extra notes yet. Sometimes a title is all you need."}</p></section>
                {sampleScripts.filter(script => script.ideaIds.includes(screen.idea.id)).map(script => <button className="linked-script" key={script.id} onClick={() => setScreen({ kind: "script", script })}><Icon name="script" size={23} /><span><small>PART OF A SCRIPT</small>{script.title}</span><Icon name="arrow" size={19} /></button>)}
              </> : <>
                <h1 className="detail-title" ref={heading} tabIndex={-1}>{screen.script.title}</h1>
                <section className="script-section"><h2>Script <span>Made from your thoughts</span></h2><div className="script-card"><div><h3><span className="section-dot" />Hook</h3><p>{screen.script.hook}</p></div><div><h3><span className="section-dot" />Key points</h3><ol>{screen.script.points.map(point => <li key={point}>{point}</li>)}</ol></div><div><h3><span className="section-dot" />Outro</h3><p>{screen.script.outro}</p></div></div></section>
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
