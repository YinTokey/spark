export type ScriptCommandResult =
  | { isCommand: false }
  | { isCommand: true; hint: string };

const MAX_TRANSCRIPT_LENGTH = 8_000;
const MAX_HINT_LENGTH = 240;
const COMMAND_VERBS = '(?:create|write|make|draft|generate)';
const SCRIPT_OBJECT = '(?:(?:youtube|video)\\s+)?script';
const HINT_CONNECTOR = '(?:about|on|for|using|from|with|based\\s+on)';

function normalizeTranscript(transcript: string): string {
  return transcript
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function boundedHint(hint: string): string {
  return hint.trim().slice(0, MAX_HINT_LENGTH).trim();
}

export function parseScriptCommand(transcript: string): ScriptCommandResult {
  if (transcript.length > MAX_TRANSCRIPT_LENGTH) return { isCommand: false };

  const normalized = normalizeTranscript(transcript);
  if (!normalized) return { isCommand: false };

  const imperative = normalized.match(
    new RegExp(
      `^(?:(?:please|could you(?:\\s+please)?|can you(?:\\s+please)?|would you(?:\\s+please)?)\\s+)?${COMMAND_VERBS}\\s+(?:(?:me|us)\\s+)?(?:(?:a|an|the)\\s+)?${SCRIPT_OBJECT}(?:\\s+${HINT_CONNECTOR}(?:\\s+(.*))?)?$`,
    ),
  );
  if (imperative) return { isCommand: true, hint: boundedHint(imperative[1] ?? '') };

  const turnIntoScript = normalized.match(
    new RegExp(`^turn\\s+(.+?)\\s+into\\s+(?:a\\s+)?${SCRIPT_OBJECT}$`),
  );
  if (turnIntoScript) return { isCommand: true, hint: boundedHint(turnIntoScript[1]) };

  const useIdeasForScript = normalized.match(
    new RegExp(`^use\\s+(.+?)\\s+ideas?\\s+(?:to|for)\\s+${COMMAND_VERBS}\\s+(?:a\\s+)?${SCRIPT_OBJECT}$`),
  );
  if (useIdeasForScript) return { isCommand: true, hint: boundedHint(`${useIdeasForScript[1]} ideas`) };

  return { isCommand: false };
}
