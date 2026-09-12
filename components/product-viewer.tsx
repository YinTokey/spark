'use client';

import Image from 'next/image';
import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import backImage from '@/public/images/spark-pendant-back.png';
import frontImage from '@/public/images/spark-pendant-front.png';
import sideImage from '@/public/images/spark-pendant-side.png';

const angles = [
  {
    name: 'Front',
    image: frontImage,
    title: 'A quiet surface for a fast idea.',
    copy: 'The ceramic face stays simple, so your attention can stay with the thought.',
  },
  {
    name: 'Side',
    image: sideImage,
    title: 'One button, right where you need it.',
    copy: 'Press once to capture an idea while you are already in motion.',
  },
  {
    name: 'Back',
    image: backImage,
    title: 'Smooth against the everyday.',
    copy: 'A soft, considered back keeps Spark close and out of the way.',
  },
] as const;

export function ProductViewer() {
  const [angleIndex, setAngleIndex] = useState(0);
  const pointerStart = useRef<number | null>(null);
  const angle = angles[angleIndex];

  function selectAngle(index: number) {
    setAngleIndex((index + angles.length) % angles.length);
  }

  function changeAngle(direction: -1 | 1) {
    selectAngle(angleIndex + direction);
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    pointerStart.current = event.clientX;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    const start = pointerStart.current;
    pointerStart.current = null;
    if (start === null) return;
    const distance = event.clientX - start;
    if (Math.abs(distance) < 42) return;
    changeAngle(distance > 0 ? -1 : 1);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    changeAngle(event.key === 'ArrowLeft' ? -1 : 1);
  }

  return <section id="product" className="product section-panel" aria-labelledby="product-title">
    <div className="product-heading">
      <p className="product-kicker">Made to move with you</p>
      <h2 id="product-title">Close to your thoughts.<br />Easy on everything else.</h2>
    </div>
    <div className="product-grid">
      <div
        className="product-viewer-stage"
        role="group"
        tabIndex={0}
        aria-label="Spark pendant angle viewer. Use the left and right arrow keys, or swipe horizontally, to change the view."
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => { pointerStart.current = null; }}
      >
        <Image key={angle.name} className="product-image" src={angle.image} alt={`Spark pendant, ${angle.name.toLowerCase()} view`} sizes="(max-width: 767px) 90vw, (max-width: 1100px) 48vw, 520px" />
      </div>
      <div className="product-copy" aria-live="polite">
        <p className="product-view-label">{angle.name} view</p>
        <h3>{angle.title}</h3>
        <p>{angle.copy}</p>
        <div className="product-controls" role="group" aria-label="Spark pendant views">
          {angles.map((item, index) => <button
            type="button"
            key={item.name}
            aria-pressed={angleIndex === index}
            className={angleIndex === index ? 'is-active' : ''}
            onClick={() => selectAngle(index)}
          >{item.name}</button>)}
        </div>
        <p id="product-view-description" className="product-finish">Smoky titanium body · ceramic face</p>
      </div>
    </div>
  </section>;
}
