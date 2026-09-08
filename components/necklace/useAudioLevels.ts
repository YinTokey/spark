"use client";

import { useEffect, useRef, useState } from "react";
import { createRingBuffer, pushSample, type RingBuffer } from "./ringBuffer.ts";

export type AudioLevelMode = "idle" | "mic" | "simulated";

const RING_CAPACITY = 180;
const SAMPLE_INTERVAL_MS = 33;

function readMicLevel(analyser: AnalyserNode, timeDomain: Float32Array<ArrayBuffer>): number {
  analyser.getFloatTimeDomainData(timeDomain);
  let sumSquares = 0;
  for (let i = 0; i < timeDomain.length; i++) {
    sumSquares += timeDomain[i] * timeDomain[i];
  }
  const rms = Math.sqrt(sumSquares / timeDomain.length);
  return Math.min(1, rms * 3.6);
}

function makeSimulatedLevelReader(): () => number {
  let phase = 0;
  return () => {
    phase += 0.135;
    const syllable = Math.pow(Math.abs(Math.sin(phase)), 0.55);
    const pause = Math.sin(phase * 0.13) > 0.82 ? 0.06 : 1;
    const jitter = 0.45 + Math.random() * 0.5;
    return Math.max(0, Math.min(1, syllable * pause * jitter));
  };
}

/**
 * Streams amplitude samples into a ring buffer at ~30 Hz without going
 * through React state, so the waveform can redraw every frame without
 * forcing a re-render. Tries the microphone first; falls back to a
 * speech-shaped synthetic signal if permission is denied, no device exists,
 * or the browser lacks the required APIs. `mode` reports which is active.
 */
export function useAudioLevels(active: boolean, sharedAudioContext: AudioContext | null) {
  // Only ever "mic" or "simulated"; the hook reports "idle" whenever
  // `active` is false, computed below rather than stored, so the effect
  // never needs to call setState synchronously on its own entry.
  const [dataMode, setDataMode] = useState<Exclude<AudioLevelMode, "idle">>("simulated");
  // Lazy-init: createRingBuffer allocates a Float32Array, and useRef's
  // argument is otherwise evaluated (then discarded) on every render.
  const bufferRef = useRef<RingBuffer | null>(null);
  if (bufferRef.current === null) {
    bufferRef.current = createRingBuffer(RING_CAPACITY);
  }
  const buffer = bufferRef as React.RefObject<RingBuffer>;

  useEffect(() => {
    if (!active) return;

    let cancelled = false;
    let stream: MediaStream | null = null;
    let analyser: AnalyserNode | null = null;
    let sourceNode: MediaStreamAudioSourceNode | null = null;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    const simulatedLevel = makeSimulatedLevelReader();

    function startSampling(readLevel: () => number) {
      intervalId = setInterval(() => {
        pushSample(bufferRef.current!, readLevel());
      }, SAMPLE_INTERVAL_MS);
    }

    async function start() {
      const canUseMic =
        sharedAudioContext &&
        typeof navigator !== "undefined" &&
        navigator.mediaDevices?.getUserMedia;

      if (!canUseMic) {
        setDataMode("simulated");
        startSampling(simulatedLevel);
        return;
      }

      try {
        const acquired = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          acquired.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = acquired;
        analyser = sharedAudioContext.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.6;
        sourceNode = sharedAudioContext.createMediaStreamSource(stream);
        sourceNode.connect(analyser);
        const timeDomain = new Float32Array(analyser.fftSize);
        setDataMode("mic");
        startSampling(() => readMicLevel(analyser!, timeDomain));
      } catch {
        if (cancelled) return;
        setDataMode("simulated");
        startSampling(simulatedLevel);
      }
    }

    void start();

    return () => {
      cancelled = true;
      if (intervalId !== null) clearInterval(intervalId);
      sourceNode?.disconnect();
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [active, sharedAudioContext]);

  return { buffer, mode: active ? dataMode : ("idle" as const) };
}
