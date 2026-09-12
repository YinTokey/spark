import Image from 'next/image';
import { Icon } from '@/components/icon';
import { ActionButton } from '@/components/landing-interactions';
import { ProductViewer } from '@/components/product-viewer';

const problems: { title: string; copy: string; image: string; alt: string }[] = [
  { title: 'Ideas happen away from the desk.', copy: 'On a walk, at the gym, in the shower, inspiration doesn’t wait for your laptop.', image: 'walk-photo', alt: 'A creator wearing Spark on a walk through a sunlit park' },
  { title: 'Typing breaks the flow.', copy: 'By the time you open an app and type it out, the momentum is gone.', image: 'typing-photo', alt: 'Hands typing an idea into a phone' },
  { title: 'Fragments get lost.', copy: 'Ideas end up in random notes, voice memos, or just slip away.', image: 'notes-photo', alt: 'Video ideas scattered across a notebook and loose notes' },
];
const steps: { title: string; copy: string; image: string; alt: string; status: string; detail: string }[] = [
  { title: 'Press the side button', copy: 'Click the side button to start recording. Spark buzzes to let you know it’s listening.', image: '/images/3-1.webp', alt: 'A finger pressing the side button on a black Spark pendant', status: 'Buzz', detail: 'Recording mode on' },
  { title: 'Speak naturally', copy: 'Share your thoughts out loud. No phone. No typing. Just ideas as they come.', image: 'speak-photo', alt: 'A creator speaking their idea out loud in the park', status: 'Capturing your ideas', detail: 'Real-time audio input' },
  { title: 'AI shapes your ideas', copy: 'Spark turns your raw thoughts into structured ideas, outlines, hooks, and key points.', image: '', alt: '', status: 'Idea shaped', detail: 'Outline · Hooks · Key points' },
  { title: 'Turn into videos', copy: 'Use the built-in teleprompter to record naturally. Turn your ideas into real content.', image: '/images/3-4.webp', alt: 'A creator recording a video with a phone teleprompter', status: 'Ready to record', detail: 'Teleprompter · Record · Share' },
];
const moments = [
  { title: 'Walk. Think. Create.', image: '/images/1-0.webp', alt: 'A creator wearing Spark while walking outside' },
  { title: 'Capture the moment.', image: '/images/1-1.webp', alt: 'A creator wearing Spark in the city' },
  { title: 'Ideas on the go.', image: '/images/1-2.webp', alt: 'A creator wearing Spark while moving through the city' },
  { title: 'Less friction. More flow.', image: '/images/1-3.webp', alt: 'A creator wearing Spark in warm afternoon light' },
  { title: 'Your ideas deserve to be heard.', image: '/images/1-4.webp', alt: 'A creator wearing Spark while sharing an idea' },
];

function ReferencePhoto({ image, alt, source }: { image: string; alt: string; source: 'problem' | 'process' }) {
  // CSS crops retain the supplied photography without regenerating the subjects.
  if (image.startsWith('/')) return <div className="reference-photo"><Image className="direct-photo" src={image} alt={alt} fill sizes="(max-width: 767px) 100vw, (max-width: 1279px) 50vw, 25vw" /></div>;
  return <div className={`reference-photo ${image}`}><Image src={`/images/${source}-reference.webp`} alt={alt} width={source === 'problem' ? 2990 : 3038} height={source === 'problem' ? 2006 : 1946} sizes="(max-width: 700px) 320vw, 110vw" /></div>;
}

export default function Home() {
  return <>
    <a className="skip-link" href="#main">Skip to content</a>
    <main id="main">
      <section id="capture" className="hero" aria-labelledby="hero-title">
        <header className="site-header">
          <a href="#capture" className="brand" aria-label="Spark by PrepVid home"><strong>Spark</strong><span>by PrepVid</span></a>
        </header>
        <div className="hero-stage">
        <div className="hero-visual">
          <Image className="scene-photo hero-photo" src="/images/hero-v5.webp" alt="A creator wearing the Spark pendant beside a calm river" fill sizes="100vw" preload />
        </div>
        <div className="hero-copy">
          <p className="hero-eyebrow">Wearable AI for creators</p>
          <h1 id="hero-title">Ideas move<br /> with you.</h1>
          <p>Capture thoughts anywhere.<br />Let AI shape them into content.</p>
          <ActionButton variant="demo" />
        </div>
        </div>
      </section>

      <ProductViewer />

      <section id="problem" className="problem section-panel" aria-labelledby="problem-title">
        <div className="section-heading"><h2 id="problem-title">For content creators, great ideas don’t wait.</h2><p>Inspiration shows up anytime, anywhere, but it’s too easy to lose it.</p></div>
        <div className="problem-grid">{problems.map((problem) => <article key={problem.title}>
          <div className="problem-image"><ReferencePhoto image={problem.image} alt={problem.alt} source="problem" /></div>
          <div className="card-copy"><h3>{problem.title}</h3><p>{problem.copy}</p></div>
        </article>)}</div>
      </section>

      <section id="how-it-works" className="how section-panel" aria-labelledby="how-title">
        <div className="section-heading"><h2 id="how-title">From a thought to a video.</h2><p>Capture, let AI shape it, and turn it into something you can create.</p></div>
        <div className="steps-grid">{steps.map((step, i) => <article className="step" key={step.title}>
          <div className="step-image">{step.image ? <ReferencePhoto image={step.image} alt={step.alt} source="process" /> : <div className="thinking-card">
            <div className="thinking-title"><Icon name="sparkle" />Spark is thinking<span className="thinking-dots">...</span></div>
            <blockquote>“A video idea about how I organize my workspace to stay focused...”</blockquote>
            <ul>{['Transcript', 'Context', 'Structure', 'Insights'].map((label) => <li key={label}><span><Icon name="check" /></span>{label}</li>)}</ul>
          </div>}
          {i === 1 && <div className="recording-overlay"><span><i />Speak naturally <time>00:12</time></span><div className="waveform" aria-hidden="true">{Array.from({ length: 36 }, (_, n) => <b key={n} style={{ height: `${5 + (n * 13 % 24)}px`, animationDelay: `${n * 0.07}s` }} />)}</div><small>Recording...</small></div>}
          </div>
          <h3><span className="step-number">{i + 1}</span>{step.title}</h3><p className="step-copy">{step.copy}</p>
          <div className={`step-status ${i < 2 ? 'recording-status' : ''}`}><div><strong>{step.status}</strong><span>{step.detail}</span></div></div>
        </article>)}</div>
      </section>

      <section className="moments section-panel" aria-label="Ideas in motion">
        <div className="section-heading"><h2>Ideas move when you do.</h2></div>
        <div className="moments-grid" tabIndex={0} aria-label="Five ideas in motion. Scroll horizontally to explore.">{moments.map((moment) => <article className="moment-card" key={moment.title}>
          <Image src={moment.image} alt={moment.alt} fill sizes="(max-width: 348px) 272px, (max-width: 767px) 78vw, (max-width: 1288px) calc((100vw - 68px) / 5), 244px" />
          <h3>{moment.title}</h3>
        </article>)}</div>
        <div className="moments-cta"><ActionButton variant="access" /></div>
      </section>
    </main>
  </>;
}
