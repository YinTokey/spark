'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from './icon';

const demoSteps = [
  { title: 'Press the side button', text: 'One press. One little buzz. Spark is ready to catch your next idea.', icon: 'buzz' },
  { title: 'Speak naturally', text: '“A video idea about how I organize my workspace to stay focused…”', icon: 'wave' },
  { title: 'AI shapes your ideas', text: 'Hook: A clearer desk. A clearer mind.\nOutline: Remove distractions → Create zones → Find your flow.', icon: 'sparkle' },
  { title: 'Turn into videos', text: 'Your idea is ready for the teleprompter. Take a breath, look into the camera, and make it yours.', icon: 'video' },
] as const;

export function ActionButton({ variant }: { variant: 'demo' | 'access' }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [step, setStep] = useState(0);
  const current = demoSteps[step] ?? demoSteps[0];
  const isDemo = variant === 'demo';
  return <>
    <button className="pill-button" onClick={() => { setStep(0); dialog.current?.showModal(); }}>
      {isDemo ? 'Try the demo' : 'Get Early Access'}<Icon name="arrow" />
    </button>
    <dialog ref={dialog} className="spark-dialog" aria-labelledby={`${variant}-title`}>
      <button className="dialog-close" aria-label="Close dialog" onClick={() => dialog.current?.close()}><Icon name="close" /></button>
      <p className="eyebrow">{isDemo ? 'A LITTLE SPARK · INTERACTIVE WALKTHROUGH' : 'SPARK · EARLY ACCESS'}</p>
      {isDemo ? <>
        <div className="demo-orb"><Icon name={current.icon} /></div>
        <p className="demo-count">0{step + 1} / 04</p>
        <div aria-live="polite"><h2 id="demo-title">{current.title}</h2><p className="demo-copy">{current.text}</p></div>
        <div className="demo-dots" aria-hidden="true">{demoSteps.map((item, i) => <span className={i === step ? 'active' : ''} key={item.title} />)}</div>
        <button className="pill-button" onClick={() => setStep((step + 1) % demoSteps.length)}>{step === 3 ? 'Try again' : 'Next step'}<Icon name="arrow" /></button>
        <small>An illustrated demo. No microphone or camera access needed.</small>
      </> : <>
        <div className="demo-orb"><Icon name="sparkle" /></div>
        <h2 id="access-title">Good things are taking shape.</h2>
        <p className="demo-copy">Sign-ups aren’t open yet. Come back soon for early access to Spark.</p>
        <button className="pill-button" onClick={() => dialog.current?.close()}>Got it<Icon name="check" /></button>
      </>}
    </dialog>
  </>;
}

export function RevealMotion() {
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (media.matches || !('IntersectionObserver' in window)) return;
    const elements = document.querySelectorAll<HTMLElement>('[data-reveal]');
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    elements.forEach((element) => { element.classList.add('will-reveal'); observer.observe(element); });
    return () => { observer.disconnect(); elements.forEach((element) => element.classList.remove('will-reveal')); };
  }, []);
  return null;
}
