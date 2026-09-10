import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server.js';
import { z } from 'zod';
import { CaptureWorkflowError, processTranscript } from '../../../../lib/server/capture-workflow.ts';
import { authorizeMutation, MutationError, mutationFailure, privateJson, readMutationBody } from '../../../../lib/server/mutation-request.ts';
import { demoRateLimiter } from '../../../../lib/server/rate-limit.ts';
import { createSparkRepository } from '../../../../lib/server/spark-repository.ts';

export const runtime = 'nodejs';
const MAX_BODY_BYTES = 16 * 1024;
const transcriptInput = z.object({ transcript: z.string().trim().min(1).max(8_000) }).strict();

async function readTranscript(request: NextRequest) {
  if (!/^application\/json(?:;|$)/i.test(request.headers.get('content-type') ?? '')) {
    throw new MutationError('invalid_transcript', 400, 'Send a transcript between 1 and 8,000 characters.');
  }
  const body = await readMutationBody(request, MAX_BODY_BYTES);
  let input: unknown;
  try { input = JSON.parse(await body.text()); } catch { throw new MutationError('invalid_transcript', 400, 'Send a transcript between 1 and 8,000 characters.'); }
  const parsed = transcriptInput.safeParse(input);
  if (!parsed.success) throw new MutationError('invalid_transcript', 400, 'Send a transcript between 1 and 8,000 characters.');
  return parsed.data.transcript;
}

export async function POST(request: NextRequest) {
  const correlationId = randomUUID();
  const startedAt = Date.now();
  let status = 'rejected';
  try {
    const session = await authorizeMutation(request, MAX_BODY_BYTES);
    const transcript = await readTranscript(request);
    const result = await processTranscript(transcript, {
      repository: createSparkRepository(session.token),
      consumeCaptureSlot: () => demoRateLimiter.consume(session.userId, 'ai_capture', 20),
      signal: request.signal,
    });
    status = 'completed';
    return privateJson(result);
  } catch (error) {
    status = error instanceof CaptureWorkflowError ? error.code : error instanceof MutationError ? error.code : 'service_unavailable';
    if (error instanceof CaptureWorkflowError) return privateJson({ code: error.code, error: error.message }, error.status);
    return mutationFailure(error, 'capture');
  } finally {
    console.info('capture_transcript.completed', { status, durationMs: Date.now() - startedAt, correlationId });
  }
}
