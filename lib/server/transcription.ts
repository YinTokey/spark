import { z } from 'zod';
import { readBoundedJson } from './bounded-response.ts';

const WHISPER_ENDPOINT = 'https://api.openai.com/v1/audio/transcriptions';
const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 64 * 1024;
const MAX_TRANSCRIPT_CHARACTERS = 8_000;
const REQUEST_TIMEOUT_MS = 30_000;
const allowedAudioTypes = new Set(['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav']);
const whisperResponse = z.object({ text: z.string() }).strict();

export type TranscriptionOptions = { correlationId?: string };

export class TranscriptionError extends Error {
  readonly code: 'not_configured' | 'invalid_audio' | 'upstream_unavailable' | 'upstream_invalid';

  constructor(code: 'not_configured' | 'invalid_audio' | 'upstream_unavailable' | 'upstream_invalid') {
    super(code);
    this.name = 'TranscriptionError';
    this.code = code;
  }
}

function validCorrelationId(value: string | undefined) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 128 ? trimmed : undefined;
}

function logResult(status: number, startedAt: number, correlationId: string | undefined) {
  console.info('transcription.completed', { status, durationMs: Date.now() - startedAt, correlationId });
}

export async function transcribeAudio(file: File, options: TranscriptionOptions = {}): Promise<string> {
  if (!(file instanceof File) || file.size === 0 || file.size > MAX_AUDIO_BYTES || !allowedAudioTypes.has(file.type)) {
    throw new TranscriptionError('invalid_audio');
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (typeof apiKey !== 'string' || apiKey.trim().length === 0 || apiKey.length > 8_192) throw new TranscriptionError('not_configured');

  const form = new FormData();
  form.set('file', file);
  form.set('model', 'whisper-1');
  const startedAt = Date.now();
  const correlationId = validCorrelationId(options.correlationId);
  let response: Response;
  try {
    response = await fetch(WHISPER_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: 'no-store',
      redirect: 'error',
    });
  } catch {
    logResult(0, startedAt, correlationId);
    throw new TranscriptionError('upstream_unavailable');
  }

  logResult(response.status, startedAt, correlationId);
  if (response.status === 429 || response.status >= 500) throw new TranscriptionError('upstream_unavailable');
  if (!response.ok) throw new TranscriptionError('upstream_invalid');
  const parsed = whisperResponse.safeParse(await readBoundedJson(response, MAX_RESPONSE_BYTES));
  if (!parsed.success) throw new TranscriptionError('upstream_invalid');
  const transcript = parsed.data.text.trim();
  if (transcript.length === 0 || transcript.length > MAX_TRANSCRIPT_CHARACTERS) throw new TranscriptionError('upstream_invalid');
  return transcript;
}
