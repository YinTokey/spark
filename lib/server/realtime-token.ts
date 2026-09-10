import { z } from 'zod';
import { readBoundedJson } from './bounded-response.ts';

const REALTIME_CLIENT_SECRETS_ENDPOINT = 'https://api.openai.com/v1/realtime/client_secrets';
const MAX_RESPONSE_BYTES = 64 * 1024;
const REQUEST_TIMEOUT_MS = 10_000;
const SECRET_TTL_SECONDS = 60;
const clientSecretResponse = z.object({
  value: z.string(),
  expires_at: z.number().int(),
  session: z.object({ type: z.literal('transcription') }).passthrough(),
}).passthrough();

export type RealtimeTokenOptions = { correlationId?: string; signal?: AbortSignal };

export class RealtimeTokenError extends Error {
  readonly code: 'not_configured' | 'upstream_unavailable' | 'upstream_invalid' | 'cancelled';

  constructor(code: 'not_configured' | 'upstream_unavailable' | 'upstream_invalid' | 'cancelled') {
    super(code);
    this.name = 'RealtimeTokenError';
    this.code = code;
  }
}

function validCorrelationId(value: string | undefined) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 128 ? trimmed : undefined;
}

function logResult(status: number, startedAt: number, correlationId: string | undefined) {
  console.info('realtime_token.upstream_completed', { status, durationMs: Date.now() - startedAt, correlationId });
}

function validExpiry(expiresAt: number) {
  const now = Math.floor(Date.now() / 1_000);
  return expiresAt > now && expiresAt <= now + 7_200;
}

export async function createRealtimeClientSecret(options: RealtimeTokenOptions = {}): Promise<{ value: string; expiresAt: number }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (typeof apiKey !== 'string' || apiKey.trim().length === 0 || apiKey.length > 8_192) throw new RealtimeTokenError('not_configured');
  if (options.signal?.aborted) throw new RealtimeTokenError('cancelled');

  const startedAt = Date.now();
  const correlationId = validCorrelationId(options.correlationId);
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  let response: Response;
  try {
    response = await fetch(REALTIME_CLIENT_SECRETS_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expires_after: { anchor: 'created_at', seconds: SECRET_TTL_SECONDS },
        session: {
          type: 'transcription',
          audio: { input: { transcription: { model: 'gpt-realtime-whisper' }, turn_detection: null } },
        },
      }),
      signal,
      cache: 'no-store',
      redirect: 'error',
    });
  } catch {
    logResult(0, startedAt, correlationId);
    throw new RealtimeTokenError(options.signal?.aborted ? 'cancelled' : 'upstream_unavailable');
  }

  if (options.signal?.aborted) {
    logResult(0, startedAt, correlationId);
    throw new RealtimeTokenError('cancelled');
  }
  logResult(response.status, startedAt, correlationId);
  if (response.status === 429 || response.status >= 500) throw new RealtimeTokenError('upstream_unavailable');
  if (!response.ok) throw new RealtimeTokenError('upstream_invalid');

  const parsed = clientSecretResponse.safeParse(await readBoundedJson(response, MAX_RESPONSE_BYTES));
  if (!parsed.success || !parsed.data.value.startsWith('ek_') || parsed.data.value.length > 4_096 || !validExpiry(parsed.data.expires_at)) {
    throw new RealtimeTokenError('upstream_invalid');
  }
  return { value: parsed.data.value, expiresAt: parsed.data.expires_at };
}
