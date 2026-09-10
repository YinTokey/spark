import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server.js';
import { authenticateAccessToken } from './session.ts';

export class MutationError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, status: number, message: string) {
    super(message);
    this.name = 'MutationError';
    this.code = code;
    this.status = status;
  }
}

export function privateJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
}

export async function authorizeMutation(request: NextRequest, maxBytes: number) {
  // Browser mutations always send Origin; absence is rejected along with mismatches.
  if (request.headers.get('origin') !== request.nextUrl.origin) throw new MutationError('origin_rejected', 403, 'Request not allowed.');
  const token = request.cookies.get('spark-access-token')?.value;
  const user = token ? await authenticateAccessToken(token) : null;
  if (!token || !user) throw new MutationError('unauthorized', 401, 'Please sign in to continue.');
  const declaredLength = request.headers.get('content-length');
  if (declaredLength !== null && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > maxBytes)) {
    throw new MutationError('body_too_large', 413, 'Request is too large.');
  }
  if (request.signal.aborted) throw new MutationError('request_cancelled', 409, 'Request was cancelled.');
  return { token, userId: user.id };
}

export async function readMutationBody(request: NextRequest, maxBytes: number): Promise<Blob> {
  if (!request.body) return new Blob();
  const reader = request.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let total = 0;
  const deadline = new AbortController();
  const timeout = setTimeout(() => deadline.abort(), 15_000);
  const signal = AbortSignal.any([request.signal, deadline.signal]);
  let abort: (() => void) | undefined;
  const interrupted = new Promise<never>((_resolve, reject) => {
    abort = () => reject(request.signal.aborted
      ? new MutationError('request_cancelled', 409, 'Request was cancelled.')
      : new MutationError('request_timeout', 408, 'Upload timed out. Please try again.'));
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
  try {
    while (true) {
      const chunk = await Promise.race([reader.read(), interrupted]);
      if (request.signal.aborted) throw new MutationError('request_cancelled', 409, 'Request was cancelled.');
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > maxBytes) throw new MutationError('body_too_large', 413, 'Request is too large.');
      if (chunk.value.byteLength > 0) chunks.push(Uint8Array.from(chunk.value));
    }
    return new Blob(chunks, { type: request.headers.get('content-type') ?? '' });
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error instanceof MutationError ? error : new MutationError('invalid_body', 400, 'Could not read this request. Please try again.');
  } finally {
    clearTimeout(timeout);
    if (abort) signal.removeEventListener('abort', abort);
    reader.releaseLock();
  }
}

export function mutationFailure(error: unknown, operation: 'capture' | 'idea_write') {
  const mapped = error instanceof MutationError ? error : new MutationError('service_unavailable', 503, 'This service is temporarily unavailable. Please try again later.');
  console.info('mutation.rejected', { operation, status: mapped.code, correlationId: randomUUID() });
  return privateJson({ code: mapped.code, error: mapped.message }, mapped.status);
}
