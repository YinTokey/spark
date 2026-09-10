import { isRecord, readBoundedText } from '../lib/client-http.ts';

const MAX_RESPONSE_BYTES = 8 * 1024;
const MAX_SDP_BYTES = 64 * 1024;

export async function readRealtimeAnswer(response: Response): Promise<string | null> {
  const answer = await readBoundedText(response, MAX_SDP_BYTES);
  return answer?.startsWith('v=0') ? answer : null;
}

export async function requestRealtimeToken(signal?: AbortSignal): Promise<string> {
  const response = await fetch('/api/realtime-token', { method: 'POST', signal });
  if (!response.ok) {
    console.warn('live_transcription.failed', { stage: 'token_request', httpStatus: response.status });
    throw new Error('realtime_token_unavailable');
  }
  const body = await readBoundedText(response, MAX_RESPONSE_BYTES);
  if (body === null) throw new Error('realtime_token_invalid');
  let value: unknown;
  try { value = JSON.parse(body); } catch { throw new Error('realtime_token_invalid'); }
  if (!isRecord(value) || typeof value.value !== 'string' || !value.value.startsWith('ek_') || value.value.length > 4_096 || typeof value.expiresAt !== 'number') {
    throw new Error('realtime_token_invalid');
  }
  return value.value;
}
