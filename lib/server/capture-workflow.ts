import { randomUUID } from 'node:crypto';
import type { Idea, Script } from '../spark-data.ts';
import { generateScript, ScriptAgentError } from './script-agent.ts';
import { parseScriptCommand } from './script-command.ts';
import type { createSparkRepository } from './spark-repository.ts';
import { transcribeAudio, TranscriptionError } from './transcription.ts';

export type CaptureResult =
  | { kind: 'idea'; idea: Idea }
  | { kind: 'script'; script: Script }
  | { kind: 'no_recent_ideas'; message: string };

const failures = {
  rate_limited: [429, 'Too many captures. Please wait an hour before trying again.'],
  rate_limit_unavailable: [503, 'Capture is temporarily unavailable. Please try again later.'],
  ai_not_configured: [503, 'AI capture is temporarily unavailable. Please try again later.'],
  transcription_failed: [502, 'Could not transcribe this recording. Please try again.'],
  idea_save_failed: [502, 'Could not confirm that your idea was saved. Check your library before trying again.'],
  script_generation_failed: [502, 'Could not create a script. Please try again.'],
  script_save_failed: [502, 'Could not confirm that your script was saved. Check your library before trying again.'],
  capture_cancelled: [409, 'Capture was cancelled.'],
} as const;
type FailureCode = keyof typeof failures;

export class CaptureWorkflowError extends Error {
  readonly code: FailureCode;
  readonly status: number;
  constructor(code: FailureCode) {
    super(failures[code][1]);
    this.name = 'CaptureWorkflowError';
    this.code = code;
    this.status = failures[code][0];
  }
}

type Dependencies = {
  repository: Pick<ReturnType<typeof createSparkRepository>, 'consumeAiRequest' | 'insertIdea' | 'findRecentIdeas' | 'insertScript'>;
  transcribeAudio?: typeof transcribeAudio;
  parseScriptCommand?: typeof parseScriptCommand;
  generateScript?: typeof generateScript;
  signal?: AbortSignal;
};

export async function processCapture(file: File, deps: Dependencies): Promise<CaptureResult> {
  const correlationId = randomUUID();
  const startedAt = Date.now();
  let stage: FailureCode = 'rate_limit_unavailable';
  let status = 'failed';
  const assertActive = () => { if (deps.signal?.aborted) throw new CaptureWorkflowError('capture_cancelled'); };
  try {
    assertActive();
    if (!await deps.repository.consumeAiRequest()) throw new CaptureWorkflowError('rate_limited');
    assertActive();
    stage = 'transcription_failed';
    const transcript = await (deps.transcribeAudio ?? transcribeAudio)(file, { correlationId });
    assertActive();
    const command = (deps.parseScriptCommand ?? parseScriptCommand)(transcript);
    if (!command.isCommand) {
      stage = 'idea_save_failed';
      const idea = await deps.repository.insertIdea(transcript);
      status = 'idea_saved';
      return { kind: 'idea', idea };
    }
    stage = 'script_generation_failed';
    const generated = await (deps.generateScript ?? generateScript)({ command: transcript, hint: command.hint, repository: deps.repository, correlationId });
    assertActive();
    if (generated === null) {
      status = 'no_recent_ideas';
      return { kind: 'no_recent_ideas', message: 'Capture a relevant idea first, then ask for a script within the next hour.' };
    }
    stage = 'script_save_failed';
    const script = await deps.repository.insertScript(generated);
    status = 'script_saved';
    return { kind: 'script', script };
  } catch (error) {
    const mapped = error instanceof CaptureWorkflowError ? error : new CaptureWorkflowError(
      (error instanceof TranscriptionError || error instanceof ScriptAgentError) && error.code === 'not_configured' ? 'ai_not_configured' : stage,
    );
    status = mapped.code;
    throw mapped;
  } finally {
    console.info('capture.completed', { status, durationMs: Date.now() - startedAt, correlationId });
  }
}
