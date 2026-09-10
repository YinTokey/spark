import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server.js';
import { privateJson } from '../../../lib/server/mutation-request.ts';
import { authenticateAccessToken } from '../../../lib/server/session.ts';
import { createSparkRepository } from '../../../lib/server/spark-repository.ts';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const correlationId = randomUUID();
  const startedAt = Date.now();
  let status = 'unauthorized';
  try {
    const token = request.cookies.get('spark-access-token')?.value;
    if (!token || !(await authenticateAccessToken(token))) {
      return privateJson({ error: 'Please sign in to continue.' }, 401);
    }
    const library = await createSparkRepository(token).loadLibrary();
    status = 'loaded';
    return privateJson(library);
  } catch {
    status = 'unavailable';
    return privateJson({ error: 'Could not load your library. Check your connection and try again.' }, 503);
  } finally {
    console.info('library.read.completed', { status, durationMs: Date.now() - startedAt, correlationId });
  }
}
