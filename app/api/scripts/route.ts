import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server.js';
import { z } from 'zod';
import { generateScriptFromIdeas, ScriptAgentError } from '../../../lib/server/script-agent.ts';
import { authorizeMutation, MutationError, mutationFailure, privateJson, readMutationBody } from '../../../lib/server/mutation-request.ts';
import { demoRateLimiter } from '../../../lib/server/rate-limit.ts';
import { createSparkRepository, RepositoryError } from '../../../lib/server/spark-repository.ts';

export const runtime = 'nodejs';

const MAX_BODY_BYTES = 16 * 1024;
const input = z.object({ ideaIds: z.array(z.uuid()).min(1).max(12).refine((ids) => new Set(ids).size === ids.length) }).strict();

async function readInput(request: NextRequest) {
  if (!/^application\/json(?:;|$)/i.test(request.headers.get('content-type') ?? '')) throw new MutationError('invalid_script_request', 400, 'Select between 1 and 12 ideas.');
  const body = await readMutationBody(request, MAX_BODY_BYTES);
  let value: unknown;
  try { value = JSON.parse(await body.text()); } catch { throw new MutationError('invalid_script_request', 400, 'Select between 1 and 12 ideas.'); }
  const parsed = input.safeParse(value);
  if (!parsed.success) throw new MutationError('invalid_script_request', 400, 'Select between 1 and 12 ideas.');
  return parsed.data;
}

export async function POST(request: NextRequest) {
  const correlationId = randomUUID();
  const startedAt = Date.now();
  let status = 'rejected';
  try {
    const session = await authorizeMutation(request, MAX_BODY_BYTES);
    const selected = await readInput(request);
    const repository = createSparkRepository(session.token);
    if (!demoRateLimiter.consume(session.userId, 'script_generation', 20)) throw new MutationError('rate_limited', 429, 'Too many scripts. Please wait an hour before trying again.');
    const ideas = await repository.findIdeasByIds(selected.ideaIds, request.signal);
    const generated = await generateScriptFromIdeas({ ideas, correlationId, signal: request.signal });
    if (generated === null) throw new MutationError('script_generation_failed', 502, 'Could not create a script. Please try again.');
    const script = await repository.insertScript(generated, request.signal);
    status = 'created';
    return privateJson({ script });
  } catch (error) {
    const mapped = error instanceof MutationError ? error
      : error instanceof ScriptAgentError && error.code === 'not_configured' ? new MutationError('ai_not_configured', 503, 'Script creation is temporarily unavailable. Please try again later.')
        : error instanceof ScriptAgentError || error instanceof RepositoryError ? new MutationError('script_generation_failed', 502, 'Could not create a script. Please try again.')
          : error;
    status = mapped instanceof MutationError ? mapped.code : 'service_unavailable';
    return mutationFailure(mapped, 'script_generation');
  } finally {
    console.info('script_creation.completed', { status, durationMs: Date.now() - startedAt, correlationId });
  }
}
