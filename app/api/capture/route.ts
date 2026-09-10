import { NextRequest } from 'next/server.js';
import { CaptureWorkflowError, processCapture } from '../../../lib/server/capture-workflow.ts';
import { authorizeMutation, MutationError, mutationFailure, privateJson, readMutationBody } from '../../../lib/server/mutation-request.ts';
import { parseMultipartFormData } from '../../../lib/server/multipart.ts';
import { demoRateLimiter } from '../../../lib/server/rate-limit.ts';
import { createSparkRepository } from '../../../lib/server/spark-repository.ts';
import { validateAudio } from '../../../lib/server/transcription.ts';

export const runtime = 'nodejs';
const MAX_BODY_BYTES = 8.5 * 1024 * 1024;
const MAX_AUDIO_BYTES = 8 * 1024 * 1024;

async function readAudio(request: NextRequest) {
  if (!/^multipart\/form-data(?:;|$)/i.test(request.headers.get('content-type') ?? '')) {
    throw new MutationError('invalid_audio', 400, 'Send one supported audio recording.');
  }
  const body = await readMutationBody(request, MAX_BODY_BYTES);
  let form: FormData | null;
  try { form = await parseMultipartFormData(body, request.headers.get('content-type') ?? ''); } catch { form = null; }
  if (!form) {
    throw new MutationError('invalid_audio', 400, 'Could not read this recording. Please record again.');
  }
  const entries = [...form.entries()];
  const file = form.get('audio');
  if (entries.length !== 1 || !(file instanceof File)) {
    throw new MutationError('invalid_audio', 400, 'Send one supported audio recording.');
  }
  if (file.size > MAX_AUDIO_BYTES) throw new MutationError('audio_too_large', 413, 'Recording is too large. Please record a shorter idea.');
  try { validateAudio(file); } catch { throw new MutationError('invalid_audio', 400, 'Send one supported audio recording.'); }
  return file;
}

export async function POST(request: NextRequest) {
  try {
    const session = await authorizeMutation(request, MAX_BODY_BYTES);
    const file = await readAudio(request);
    const result = await processCapture(file, {
      repository: createSparkRepository(session.token),
      consumeCaptureSlot: () => demoRateLimiter.consume(session.userId, 'ai_capture', 20),
      signal: request.signal,
    });
    return privateJson(result);
  } catch (error) {
    if (error instanceof CaptureWorkflowError) return privateJson({ code: error.code, error: error.message }, error.status);
    return mutationFailure(error, 'capture');
  }
}
