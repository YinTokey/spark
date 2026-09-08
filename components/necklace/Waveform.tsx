"use client";

import { useEffect, useRef } from "react";
import { readRecent, type RingBuffer } from "./ringBuffer.ts";

type WaveformProps = {
  bufferRef: React.RefObject<RingBuffer>;
  /** While false the strip freezes on its last frame instead of animating. */
  active: boolean;
};

const STRIDE = 5;
const BAR_WIDTH = 3;
const PANEL_HEIGHT = 74;

/**
 * Canvas bar meter. Reads samples from a ring buffer ref every animation
 * frame rather than through React state or props, so the waveform can
 * redraw at display refresh rate without re-rendering the component tree.
 */
export function Waveform({ bufferRef, active }: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let frameId: number;

    function fitCanvasToDisplaySize() {
      const el = canvasRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      el.width = Math.max(1, Math.round(rect.width * dpr));
      el.height = Math.max(1, Math.round(PANEL_HEIGHT * dpr));
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    fitCanvasToDisplaySize();
    const resizeObserver = new ResizeObserver(fitCanvasToDisplaySize);
    resizeObserver.observe(canvas);

    function draw() {
      const el = canvasRef.current;
      if (!el) return;
      const width = el.clientWidth;
      const mid = PANEL_HEIGHT / 2;
      const barCount = Math.floor(width / STRIDE);
      const buffer = bufferRef.current;
      const values = readRecent(buffer, Math.min(barCount, buffer.capacity));

      ctx!.clearRect(0, 0, width, PANEL_HEIGHT);

      if (!active && !values.some((v) => v > 0)) {
        ctx!.fillStyle = "#2A2D33";
        ctx!.fillRect(0, mid - 1, width, 2);
      } else {
        for (let i = 0; i < values.length; i++) {
          const level = values[i];
          const barHeight = Math.max(2, level * (PANEL_HEIGHT - 10));
          ctx!.globalAlpha = 0.5 + 0.5 * level;
          ctx!.fillStyle = active ? "#FFB020" : "#C77D08";
          ctx!.fillRect(width - (values.length - i) * STRIDE, mid - barHeight / 2, BAR_WIDTH, barHeight);
        }
        ctx!.globalAlpha = 1;
      }

      if (active) {
        frameId = requestAnimationFrame(draw);
      }
    }

    draw();

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
    };
  }, [active, bufferRef]);

  return <canvas ref={canvasRef} className="necklace-waveform-canvas" />;
}
