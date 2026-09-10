"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { LiveTranscriptAccumulator } from './live-transcript';
import { readRealtimeAnswer, requestRealtimeToken } from './live-transcript-client';

export type LiveTranscriptStatus = 'idle' | 'connecting' | 'live' | 'unavailable';

type Connection = { peer: RTCPeerConnection; channel: RTCDataChannel; controller: AbortController };
const FINAL_TRANSCRIPT_TIMEOUT_MS = 5_000;

function close(connection: Connection | null) {
  if (!connection) return;
  connection.controller.abort();
  connection.channel.close();
  connection.peer.close();
}

export function useLiveTranscript() {
  const [transcript, setTranscript] = useState('');
  const [status, setStatus] = useState<LiveTranscriptStatus>('idle');
  const current = useRef(0);
  const connection = useRef<Connection | null>(null);
  const accumulator = useRef<LiveTranscriptAccumulator | null>(null);
  const completionWaiter = useRef<(() => void) | null>(null);

  const reset = useCallback(() => {
    current.current += 1;
    completionWaiter.current?.();
    completionWaiter.current = null;
    close(connection.current);
    connection.current = null;
    accumulator.current = null;
    setTranscript('');
    setStatus('idle');
  }, []);

  const start = useCallback(async (stream: MediaStream) => {
    reset();
    const id = current.current;
    const controller = new AbortController();
    const nextAccumulator = new LiveTranscriptAccumulator();
    accumulator.current = nextAccumulator;
    setStatus('connecting');
    let stage = 'token';
    let httpStatus: number | undefined;
    try {
      const token = await requestRealtimeToken(controller.signal);
      if (current.current !== id) return;
      stage = 'peer_connection';
      const peer = new RTCPeerConnection();
      const channel = peer.createDataChannel('oai-events');
      const nextConnection = { peer, channel, controller };
      connection.current = nextConnection;
      stream.getAudioTracks().forEach(track => peer.addTrack(track, stream));
      channel.addEventListener('message', event => {
        if (current.current !== id || typeof event.data !== 'string' || !nextAccumulator.accept(event.data)) return;
        setTranscript(nextAccumulator.text);
        if (nextAccumulator.completedText) {
          console.info('live_transcription.completed', { status: 'transcript_completed' });
          completionWaiter.current?.();
        }
      });
      peer.addEventListener('connectionstatechange', () => {
        if (current.current === id && ['failed', 'disconnected', 'closed'].includes(peer.connectionState)) {
          console.warn('live_transcription.failed', { stage: 'connection_state', status: peer.connectionState });
          setStatus('unavailable');
        }
      });
      stage = 'local_offer';
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      stage = 'remote_offer';
      const answer = await fetch('https://api.openai.com/v1/realtime/calls', {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/sdp' }, body: offer.sdp, signal: controller.signal,
      });
      httpStatus = answer.status;
      if (!answer.ok) throw new Error('realtime_connection_unavailable');
      stage = 'remote_answer';
      const sdp = await readRealtimeAnswer(answer);
      if (!sdp || current.current !== id) throw new Error('realtime_connection_invalid');
      await peer.setRemoteDescription({ type: 'answer', sdp });
      if (current.current === id) {
        console.info('live_transcription.completed', { status: 'live' });
        setStatus('live');
      }
    } catch {
      if (current.current === id) {
        console.warn('live_transcription.failed', { stage, httpStatus });
        close(connection.current);
        connection.current = null;
        setStatus('unavailable');
      }
    }
  }, [reset]);

  const stop = useCallback(async () => {
    const id = current.current;
    const active = connection.current;
    const activeAccumulator = accumulator.current;
    let committed = false;
    if (active?.channel.readyState === 'open') {
      try {
        active.channel.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
        console.info('live_transcription.completed', { status: 'audio_committed' });
        committed = true;
      } catch {
        console.warn('live_transcription.failed', { stage: 'audio_commit', status: 'send_failed' });
      }
    }
    if (committed && activeAccumulator && !activeAccumulator.completedText) {
      await new Promise<void>(resolve => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          completionWaiter.current = null;
          resolve();
        };
        const timeout = window.setTimeout(finish, FINAL_TRANSCRIPT_TIMEOUT_MS);
        completionWaiter.current = finish;
      });
      if (!activeAccumulator.completedText) {
        console.warn('live_transcription.failed', { stage: 'completion', status: 'timeout' });
      }
    }
    const finalText = current.current === id ? activeAccumulator?.completedText ?? null : null;
    current.current += 1;
    close(connection.current);
    connection.current = null;
    setStatus('idle');
    return finalText;
  }, []);

  useEffect(() => reset, [reset]);

  return { transcript, status, start, stop, reset };
}
