import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server.js';
import { authorizeMutation, MutationError, mutationFailure, privateJson } from '../../../lib/server/mutation-request.ts';
import { demoRateLimiter } from '../../../lib/server/rate-limit.ts';
import { createRealtimeClientSecret, RealtimeTokenError } from '../../../lib/server/realtime-token.ts';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const correlationId = randomUUID();
  const startedAt = Date.now();
  let status = 'rejected';
  try {
    const session = await authorizeMutation(request, 1_024);
    if (!demoRateLimiter.consume(session.userId, 'realtime_session', 20)) {
      throw new MutationError('rate_limited', 429, 'Too many live transcription sessions. Please wait an hour before trying again.');
    }
    const token = await createRealtimeClientSecret({ correlationId, signal: request.signal });
    status = 'created';
    return privateJson(token);
  } catch (error) {
    if (error instanceof RealtimeTokenError) {
      const mapped = error.code === 'cancelled'
        ? new MutationError('request_cancelled', 409, 'Request was cancelled.')
        : new MutationError(error.code, 503, 'Live captions are temporarily unavailable. Your recording can still be captured.');
      status = mapped.code;
      return mutationFailure(mapped, 'realtime_session');
    }
    status = error instanceof MutationError ? error.code : 'service_unavailable';
    return mutationFailure(error, 'realtime_session');
  } finally {
    console.info('realtime_token.completed', { status, durationMs: Date.now() - startedAt, correlationId });
  }
}
