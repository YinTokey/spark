"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { Scene } from "./Scene.tsx";
import { Waveform } from "./Waveform.tsx";
import { CaptureList } from "./CaptureList.tsx";
import { useAudioLevels } from "./useAudioLevels.ts";
import { readRecent, clearRingBuffer } from "./ringBuffer.ts";
import { formatMinutesSeconds } from "./format.ts";
import {
  reducer,
  initialMachineState,
  ARMING_BUZZ_MS,
  STOPPING_BUZZ_MS,
  SAVED_MS,
} from "./recorderMachine.ts";
import { START_BUZZ_PATTERN, STOP_BUZZ_PATTERN, scheduleBuzz, vibrateDevice } from "./haptics.ts";

const THUMBNAIL_SAMPLES = 48;

const STATE_LABEL: Record<string, string> = {
  idle: "Standby",
  armingBuzz: "Buzzing — arming",
  recording: "Recording",
  stoppingBuzz: "Buzzing — closing",
  saved: "Capture saved",
};

function getAudioContextClass(): typeof AudioContext | undefined {
  if (typeof window === "undefined") return undefined;
  return window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
}

export function NecklaceDemo() {
  const [state, dispatch] = useReducer(reducer, initialMachineState);
  const [soundOn, setSoundOn] = useState(true);
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  const pendingStopRef = useRef<{ peaks: number[]; simulated: boolean }>({
    peaks: [],
    simulated: false,
  });

  const isRecording = state.status === "recording";
  const { buffer, mode } = useAudioLevels(isRecording, audioContext);

  // Timers that advance armingBuzz -> recording, stoppingBuzz -> saved, and
  // saved -> idle. Owned here (not in the reducer) so they can be cleared on
  // unmount or superseded by a later state change, per the design spec.
  useEffect(() => {
    if (state.status === "armingBuzz") {
      const id = setTimeout(() => dispatch({ type: "BUZZ_END", now: Date.now() }), ARMING_BUZZ_MS);
      return () => clearTimeout(id);
    }
    if (state.status === "stoppingBuzz") {
      const id = setTimeout(() => {
        const { peaks, simulated } = pendingStopRef.current;
        dispatch({ type: "BUZZ_END", now: Date.now(), peaks, simulated });
      }, STOPPING_BUZZ_MS);
      return () => clearTimeout(id);
    }
    if (state.status === "saved") {
      const id = setTimeout(() => dispatch({ type: "SAVE_END" }), SAVED_MS);
      return () => clearTimeout(id);
    }
  }, [state.status]);

  // Repaints the elapsed-time clock while recording. The waveform bars
  // themselves redraw independently inside Waveform's own rAF loop and do
  // not depend on this tick.
  useEffect(() => {
    if (!isRecording || state.startedAt === null) return;
    const startedAt = state.startedAt;
    const id = setInterval(() => setElapsedMs(Date.now() - startedAt), 200);
    return () => clearInterval(id);
  }, [isRecording, state.startedAt]);

  useEffect(() => {
    return () => {
      audioContext?.close().catch(() => {});
    };
  }, [audioContext]);

  // Wipe the waveform history once a session closes so the strip starts
  // flat, rather than showing the previous capture's tail, next time.
  useEffect(() => {
    if (state.status === "idle") {
      clearRingBuffer(buffer.current);
    }
  }, [state.status, buffer]);

  function ensureAudioContext(): AudioContext | null {
    if (audioContext) return audioContext;
    const AudioContextClass = getAudioContextClass();
    if (!AudioContextClass) return null;
    const ctx = new AudioContextClass();
    setAudioContext(ctx);
    return ctx;
  }

  function fireBuzz(pattern: number[]) {
    vibrateDevice(pattern);
    if (!soundOn) return;
    const ctx = ensureAudioContext();
    if (ctx?.state === "suspended") void ctx.resume();
    scheduleBuzz(ctx, pattern);
  }

  function handlePress() {
    const now = Date.now();
    if (state.status === "idle" || state.status === "saved") {
      fireBuzz(START_BUZZ_PATTERN);
      dispatch({ type: "PRESS", now });
    } else if (state.status === "recording") {
      pendingStopRef.current = {
        peaks: readRecent(buffer.current, THUMBNAIL_SAMPLES),
        simulated: mode !== "mic",
      };
      fireBuzz(STOP_BUZZ_PATTERN);
      dispatch({ type: "PRESS", now });
    }
  }

  const isBuzzing = state.status === "armingBuzz" || state.status === "stoppingBuzz";
  const isIdleForInvite = state.status === "idle";
  const stateLabel = STATE_LABEL[state.status];
  const buttonLabel = isRecording ? "Stop recording" : "Start recording";

  const sourceNote =
    state.status !== "recording"
      ? null
      : mode === "mic"
        ? { bold: false, text: "Live microphone · RMS envelope" }
        : mode === "simulated"
          ? { bold: true, text: "Simulated signal — mic unavailable in this frame" }
          : { bold: false, text: "Connecting to microphone…" };

  return (
    <div className="necklace-root">
      <header className="necklace-masthead">
        <div className="necklace-mark">
          Halo One <span>&mdash; capture pendant</span>
        </div>
        <div className="necklace-rig">Prototype build &middot; interaction demo</div>
      </header>

      <div className="necklace-grid">
        <div className="necklace-stage">
          <Scene ledOn={isRecording} buzzing={isBuzzing} idle={isIdleForInvite} />
          <button
            type="button"
            className="necklace-button"
            onClick={handlePress}
            aria-label={buttonLabel}
          >
            <span className="necklace-sr-only">{buttonLabel}</span>
          </button>
          <div className="necklace-caption">Riverside park &middot; side button, single detent</div>
        </div>

        <div className="necklace-panel">
          <div className="necklace-state-row">
            <span
              className={`necklace-dot${
                isRecording ? " is-live" : isBuzzing ? " is-buzzing" : state.status === "saved" ? " is-done" : ""
              }`}
            />
            <span className="necklace-state-label">{stateLabel}</span>
            <span className="necklace-clock">{formatMinutesSeconds(isRecording ? elapsedMs : 0)}</span>
          </div>

          <div>
            <div className="necklace-meter">
              <div className="necklace-meter-top">
                <span className={isRecording ? "is-on" : undefined}>
                  Input &middot; {isRecording ? "live" : "idle"}
                </span>
                <button
                  type="button"
                  className="necklace-sound-toggle"
                  aria-pressed={soundOn}
                  onClick={() => setSoundOn((v) => !v)}
                >
                  Sound {soundOn ? "on" : "off"}
                </button>
              </div>
              <Waveform bufferRef={buffer} active={isRecording} />
            </div>
            {sourceNote && (
              <p className="necklace-src">{sourceNote.bold ? <b>{sourceNote.text}</b> : sourceNote.text}</p>
            )}
          </div>

          <p className="necklace-hint" id="necklace-hint">
            Press the side button on the pendant to arm capture. It buzzes once to start, twice to
            finish. <kbd>Tab</kbd> then <kbd>Space</kbd> works too.
          </p>

          <dl className="necklace-specs">
            <div className="necklace-spec">
              <dt>Actuator</dt>
              <dd>LRA 62 Hz</dd>
            </div>
            <div className="necklace-spec">
              <dt>Arm pulse</dt>
              <dd className={state.status === "armingBuzz" ? "is-hot" : undefined}>
                {ARMING_BUZZ_MS} ms
              </dd>
            </div>
            <div className="necklace-spec">
              <dt>Stop pulse</dt>
              <dd className={state.status === "stoppingBuzz" ? "is-hot" : undefined}>
                90&middot;80&middot;90 ms
              </dd>
            </div>
            <div className="necklace-spec">
              <dt>Mic</dt>
              <dd>16 kHz mono</dd>
            </div>
            <div className="necklace-spec">
              <dt>Mass</dt>
              <dd>42 g</dd>
            </div>
            <div className="necklace-spec">
              <dt>Ingress</dt>
              <dd>IPX5</dd>
            </div>
          </dl>

          <div className="necklace-log">
            <h2>Session captures</h2>
            <CaptureList captures={state.captures} />
          </div>
        </div>
      </div>

      <p className="necklace-sr-only" role="status" aria-live="polite">
        {stateLabel}
      </p>
    </div>
  );
}
