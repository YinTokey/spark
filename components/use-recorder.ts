"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { initialPhase, reducePhase } from "./capture-machine";
import { useLiveTranscript } from './use-live-transcript';

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_SECONDS = 60;

export type PendingCapture = { id: string; audio: Blob; transcript: string | null };

export function useRecorder(options: { onQueued?: (capture: PendingCapture) => boolean } = {}) {
  const [phase, dispatch] = useReducer(reducePhase, initialPhase);
  const [error, setError] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [levels, setLevels] = useState<number[]>(Array(32).fill(4));
  const [audioUrl, setAudioUrl] = useState("");
  const live = useLiveTranscript();
  const resetLive = live.reset;

  const session = useRef(0);
  const release = useRef<() => void>(() => {});
  const stopRecording = useRef<() => void>(() => {});
  const onQueued = useRef(options.onQueued);
  useEffect(() => { onQueued.current = options.onQueued; });

  useEffect(() => () => {
    session.current += 1;
    release.current();
    resetLive();
  }, [resetLive]);

  function reset() {
    session.current += 1;
    release.current();
    release.current = () => {};
    stopRecording.current = () => {};
    setAudioUrl("");
    setSeconds(0);
    setError("");
    resetLive();
    dispatch({ type: "RESET" });
  }

  async function start() {
    reset();
    const id = session.current;
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder || !window.AudioContext) {
      setError("Use a current browser on HTTPS or localhost to record audio.");
      dispatch({ type: "FAILED" });
      return;
    }
    dispatch({ type: "REQUESTED" });
    let stream: MediaStream | undefined;
    let recorder: MediaRecorder | undefined;
    let context: AudioContext | undefined;
    let ticker: ReturnType<typeof setInterval> | undefined;
    let url = "";
    let chunks: Blob[] = [];
    let size = 0;
    const current = () => session.current === id;
    const clearMedia = () => {
      clearInterval(ticker);
      if (recorder) {
        recorder.ondataavailable = null;
        recorder.onstop = null;
        recorder.onerror = null;
        if (recorder.state !== "inactive") recorder.stop();
      }
      stream?.getTracks().forEach(track => { track.onended = null; track.stop(); });
      if (context && context.state !== "closed") void context.close().catch(() => {});
    };
    const permissionTimer = setTimeout(() => {
      if (current()) fail("Microphone permission is taking a while. Check your browser’s permission prompt and try again.");
    }, 20000);
    release.current = () => {
      clearTimeout(permissionTimer);
      clearMedia();
      chunks = [];
      if (url) URL.revokeObjectURL(url);
    };
    function fail(message: string) {
      if (!current()) return;
      session.current += 1;
      release.current();
      resetLive();
      setError(message);
      dispatch({ type: "FAILED" });
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!current()) { stream.getTracks().forEach(track => track.stop()); return; }
      clearTimeout(permissionTimer);
      context = new AudioContext();
      await context.resume();
      if (!current()) { clearMedia(); return; }
      const analyser = context.createAnalyser();
      analyser.fftSize = 128;
      context.createMediaStreamSource(stream).connect(analyser);
      const samples = new Uint8Array(analyser.frequencyBinCount);
      recorder = new MediaRecorder(stream);
      recorder.ondataavailable = event => {
        if (!current() || !event.data.size) return;
        size += event.data.size;
        if (size > MAX_BYTES) { fail("This recording is too large. Try a shorter idea."); return; }
        chunks.push(event.data);
      };
      recorder.onerror = () => fail("Recording was interrupted. Check your microphone and try again.");
      stream.getTracks().forEach(track => {
        track.onended = () => fail("Your microphone disconnected. Reconnect it and try again.");
      });
      recorder.onstop = async () => {
        if (!current()) return;
        const blobData = new Blob(chunks, { type: recorder?.mimeType || "audio/webm" });
        clearMedia();
        chunks = [];
        if (!blobData.size) { fail("No audio was captured. Try recording again."); return; }
        const finalTranscript = await live.stop();
        if (!current()) return;
        const queued = onQueued.current?.({ id: crypto.randomUUID(), audio: blobData, transcript: finalTranscript }) ?? false;
        if (!queued) { fail("Spark One is full. Open Phone to sync your saved ideas first."); return; }
        url = URL.createObjectURL(blobData);
        setAudioUrl(url);
        dispatch({ type: "SUCCEEDED" });
      };
      const startedAt = Date.now();
      stopRecording.current = () => {
        if (current() && recorder?.state === "recording") {
          clearInterval(ticker);
          dispatch({ type: "STOPPED" });
          recorder.stop();
          stream?.getTracks().forEach(track => { track.onended = null; track.stop(); });
        }
      };
      recorder.start(250);
      dispatch({ type: "RECORDING" });
      void live.start(stream);
      ticker = setInterval(() => {
        if (!current()) return;
        const elapsed = Math.floor((Date.now() - startedAt) / 1000);
        setSeconds(Math.min(elapsed, MAX_SECONDS));
        analyser.getByteFrequencyData(samples);
        setLevels(Array.from({ length: 32 }, (_, index) => 4 + (samples[index * 2] / 255) * 56));
        if (elapsed >= MAX_SECONDS) stopRecording.current();
      }, 80);
    } catch (cause) {
      fail(cause instanceof DOMException && cause.name === "NotAllowedError"
        ? "Allow microphone access in your browser’s site settings, then try again."
        : "Couldn’t open your microphone. Check that it is connected and available, then try again.");
    }
  }

  return { phase, error, seconds, levels, audioUrl, transcript: live.transcript, liveTranscriptStatus: live.status, start, stop: () => stopRecording.current(), reset };
}
