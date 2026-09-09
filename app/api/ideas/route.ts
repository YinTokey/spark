import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server.js';
import { z } from 'zod';
import { authorizeMutation, MutationError, mutationFailure, privateJson, readMutationBody } from '../../../lib/server/mutation-request.ts';
import { createSparkRepository } from '../../../lib/server/spark-repository.ts';

export const runtime = 'nodejs';
const MAX_BODY_BYTES = 64 * 1024;
const ideaInput = z.object({ transcript: z.string().trim().min(1).max(8_000) }).strict();

export async function POST(request: NextRequest) {
  const correlationId = randomUUID();
  const startedAt = Date.now();
  let status = 'rejected';
  try {
    const token = await authorizeMutation(request, MAX_BODY_BYTES);
    if (!/^application\/json(?:;|$)/i.test(request.headers.get('content-type') ?? '')) throw new MutationError('invalid_idea', 400, 'Send an idea as JSON.');
    const body = await readMutationBody(request, MAX_BODY_BYTES);
    let input: unknown;
    try { input = JSON.parse(await body.text()); } catch { throw new MutationError('invalid_idea', 400, 'Enter an idea between 1 and 8,000 characters.'); }
    const parsed = ideaInput.safeParse(input);
    if (!parsed.success) throw new MutationError('invalid_idea', 400, 'Enter an idea between 1 and 8,000 characters.');
    const repository = createSparkRepository(token);
    let allowed: boolean;
    try { allowed = await repository.consumeIdeaWrite(); } catch { throw new MutationError('rate_limit_unavailable', 503, 'Saving ideas is temporarily unavailable. Please try again later.'); }
    if (!allowed) throw new MutationError('rate_limited', 429, 'Too many saved ideas. Please wait an hour before trying again.');
    if (request.signal.aborted) throw new MutationError('request_cancelled', 409, 'Request was cancelled.');
    try {
      const idea = await repository.insertIdea(parsed.data.transcript);
      status = 'saved';
      return privateJson({ idea });
    } catch { throw new MutationError('idea_save_failed', 502, 'Could not confirm that your idea was saved. Check your library before trying again.'); }
  } catch (error) {
    status = error instanceof MutationError ? error.code : 'service_unavailable';
    return mutationFailure(error, 'idea_write');
  } finally {
    console.info('idea_write.completed', { status, durationMs: Date.now() - startedAt, correlationId });
  }
}
