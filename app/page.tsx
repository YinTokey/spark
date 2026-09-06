import Image from 'next/image';
import { Icon, type IconName } from '@/components/icon';
import { ActionButton, RevealMotion } from '@/components/landing-interactions';

const problems: { title: string; copy: string; icon: IconName; image: string; alt: string }[] = [
  { title: 'Ideas happen away from the desk.', copy: 'On a walk, at the gym, in the shower — inspiration doesn’t wait for your laptop.', icon: 'walk', image: 'walk-photo', alt: 'A creator wearing Spark on a walk through a sunlit park' },
  { title: 'Typing breaks the flow.', copy: 'By the time you open an app and type it out, the momentum is gone.', icon: 'keyboard', image: 'typing-photo', alt: 'Hands typing an idea into a phone' },
  { title: 'Fragments get lost.', copy: 'Ideas end up in random notes, voice memos, or just slip away.', icon: 'note', image: 'notes-photo', alt: 'Video ideas scattered across a notebook and loose notes' },
];
const steps: { title: string; copy: string; image: string; alt: string; icon: IconName; status: string; detail: string }[] = [
  { title: 'Press the side button', copy: 'Click the side button to start recording. Spark buzzes to let you know it’s listening.', image: 'press-photo', alt: 'A finger pressing the side button on a black Spark pendant', icon: 'buzz', status: 'Buzz', detail: 'Recording mode on' },
  { title: 'Speak naturally', copy: 'Share your thoughts out loud. No phone. No typing. Just ideas as they come.', image: 'speak-photo', alt: 'A creator speaking their idea out loud in the park', icon: 'wave', status: 'Capturing your ideas', detail: 'Real-time audio input' },
  { title: 'AI shapes your ideas', copy: 'Spark turns your raw thoughts into structured ideas — outlines, hooks, and key points.', image: '', alt: '', icon: 'sparkle', status: 'Idea shaped', detail: 'Outline · Hooks · Key points' },
  { title: 'Turn into videos', copy: 'Use the built-in teleprompter to record naturally. Turn your ideas into real content.', image: 'record-photo', alt: 'A creator recording a video with a phone teleprompter', icon: 'video', status: 'Ready to record', detail: 'Teleprompter · Record · Share' },
];

function Benefits({ closing = false }: { closing?: boolean }) {
  const items: { icon: IconName; label: string }[] = closing
    ? [{ icon: 'bolt', label: 'Capture\nanytime' }, { icon: 'brain', label: 'AI\nshapes it' }, { icon: 'video', label: 'Turn into\nvideos' }]
    : [{ icon: 'mic', label: 'Capture\nby voice' }, { icon: 'sparkle', label: 'AI shapes\nyour ideas' }, { icon: 'note', label: 'Turn into\nvideos' }];
  return <ul className="benefits">{items.map(({ icon, label }) => <li key={icon}><Icon name={icon} /><span>{label}</span></li>)}</ul>;
}

function ReferencePhoto({ image, alt, source }: { image: string; alt: string; source: 'problem' | 'process' }) {
  // CSS crops retain the supplied photography without regenerating the subjects.
  return <div className={`reference-photo ${image}`}><Image src={`/images/${source}-reference.webp`} alt={alt} width={source === 'problem' ? 2990 : 3038} height={source === 'problem' ? 2006 : 1946} sizes="(max-width: 700px) 320vw, 110vw" /></div>;
}

export default function Home() {
  return <>
    <a className="skip-link" href="#main">Skip to content</a>
    <RevealMotion />
    <main id="main">
      <section id="capture" className="hero" aria-labelledby="hero-title">
        <Image className="scene-photo hero-photo" src="/images/hero-sharp.webp" alt="A creator wearing the Spark pendant beside a sunlit river" fill sizes="100vw" preload />
        <header className="site-header">
          <a href="#capture" className="brand" aria-label="Spark by PrepVid home"><strong>Spark</strong><span>by PrepVid</span></a>
        </header>
        <div className="handwritten hero-note">Good ideas<br />happen everywhere.<span /></div>
        <div className="hero-copy">
          <h1 id="hero-title">Ideas <br />move with you.</h1>
          <p>Capture thoughts anywhere.<br />Let AI shape them into content.</p>
          <ActionButton variant="demo" />
        </div>
        <div className="pendant-detail" aria-hidden="true"><div className="reference-photo pendant-photo"><Image src="/images/hero-sharp.webp" alt="" width={1536} height={1024} sizes="100vw" /></div></div>
        <div className="press-note handwritten" aria-hidden="true">Press<br />here<svg viewBox="0 0 150 90" fill="none"><path d="M144 5C110 59 75 83 10 70m0 0 14-7M10 70l12 10" stroke="currentColor" strokeWidth="2" /></svg></div>
        <div className="hero-benefits"><Benefits /></div>
        <div className="section-signoff hero-signoff"><span />MORE TALKING. LESS TYPING.</div>
      </section>

      <section id="problem" className="problem section-panel" aria-labelledby="problem-title">
        <div className="section-heading" data-reveal><p className="eyebrow">THE PROBLEM</p><h2 id="problem-title">Great ideas don’t wait.</h2><p>Inspiration shows up anytime, anywhere — but it’s too easy to lose it.</p></div>
        <div className="problem-grid">{problems.map((problem) => <article key={problem.title} data-reveal>
          <div className="problem-image"><ReferencePhoto image={problem.image} alt={problem.alt} source="problem" /><span className="icon-badge"><Icon name={problem.icon} /></span></div>
          <div className="card-copy"><h3>{problem.title}</h3><p>{problem.copy}</p></div>
        </article>)}</div>
        <div className="problem-end" data-reveal><span className="small-rule" /><h3>Spark lets creators think out loud instead.</h3><p className="eyebrow">SAME IDEAS. A BRIGHTER TOMORROW.</p></div>
      </section>

      <section id="how-it-works" className="how section-panel" aria-labelledby="how-title">
        <div className="section-heading" data-reveal><p className="eyebrow">HOW IT WORKS</p><h2 id="how-title">From a thought to a video.</h2><p>Capture, let AI shape it, and turn it into something you can create.</p></div>
        <div className="steps-grid">{steps.map((step, i) => <article className="step" key={step.title} data-reveal>
          <div className="step-image">{step.image ? <ReferencePhoto image={step.image} alt={step.alt} source="process" /> : <div className="thinking-card">
            <div className="thinking-title"><Icon name="sparkle" />Spark is thinking<span className="thinking-dots">...</span></div>
            <blockquote>“A video idea about<br />how I organize my workspace<br />to stay focused...”</blockquote>
            <ul>{['Transcribing audio', 'Understanding context', 'Structuring the idea', 'Generating insights'].map((label) => <li key={label}><span><Icon name="check" /></span>{label}</li>)}</ul>
          </div>}
          {i === 1 && <div className="recording-overlay"><span><i />Speak naturally <time>00:12</time></span><div className="waveform" aria-hidden="true">{Array.from({ length: 36 }, (_, n) => <b key={n} style={{ height: `${5 + (n * 13 % 24)}px`, animationDelay: `${n * 0.07}s` }} />)}</div><small>Recording...</small></div>}
          </div>
          <h3><span className="step-number">{i + 1}</span>{step.title}</h3><p className="step-copy">{step.copy}</p>
          <div className={`step-status ${i < 2 ? 'recording-status' : ''}`}><Icon name={step.icon} /><div><strong>{step.status}</strong><span>{step.detail}</span></div></div>
          {i < 3 && <Icon name="arrow" className="step-arrow" />}
        </article>)}</div>
        <div className="section-signoff"><span />IDEAS MOVE WITH YOU.</div>
      </section>

      <section id="early-access" className="closing" aria-labelledby="closing-title">
        <Image className="scene-photo closing-photo" src="/images/closing.webp" alt="A woman wearing Spark looking toward the sunset over the city" fill sizes="100vw" />
        <span className="closing-brand">SPARK</span>
        <div className="closing-copy" data-reveal><h2 id="closing-title">Capture today.<br />A brighter tomorrow.</h2><ActionButton variant="access" /><Benefits closing /></div>
        <div className="handwritten closing-note">Ideas<br /><span>move with you.</span><i /></div>
        <a className="closing-wordmark" href="#capture" aria-label="Spark, back to top"><span />SPARK</a>
      </section>
    </main>
  </>;
}
