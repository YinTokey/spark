const MAX_EVENT_BYTES = 64 * 1024;
const MAX_TRANSCRIPT_CHARACTERS = 8_000;

type TranscriptDelta = { type: 'conversation.item.input_audio_transcription.delta'; item_id: string; delta: string };
type TranscriptCompleted = { type: 'conversation.item.input_audio_transcription.completed'; item_id: string; transcript: string };

function eventValue(value: string): TranscriptDelta | TranscriptCompleted | null {
  if (new TextEncoder().encode(value).byteLength > MAX_EVENT_BYTES) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { return null; }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  const event = parsed as Record<string, unknown>;
  if (typeof event.item_id !== 'string' || event.item_id.length === 0 || event.item_id.length > 128) return null;
  if (event.type === 'conversation.item.input_audio_transcription.delta' && typeof event.delta === 'string') {
    return { type: event.type, item_id: event.item_id, delta: event.delta };
  }
  if (event.type === 'conversation.item.input_audio_transcription.completed' && typeof event.transcript === 'string') {
    return { type: event.type, item_id: event.item_id, transcript: event.transcript };
  }
  return null;
}

export class LiveTranscriptAccumulator {
  #items = new Map<string, string>();
  #completed = new Set<string>();

  get text() {
    return [...this.#items.values()].join('');
  }

  get completedText() {
    return this.#items.size > 0 && this.#completed.size === this.#items.size ? this.text.trim() || null : null;
  }

  accept(value: string) {
    const event = eventValue(value);
    if (!event || this.#completed.has(event.item_id)) return false;
    const next = event.type === 'conversation.item.input_audio_transcription.delta'
      ? `${this.#items.get(event.item_id) ?? ''}${event.delta}`
      : event.transcript;
    const currentLength = this.text.length - (this.#items.get(event.item_id)?.length ?? 0) + next.length;
    if (currentLength > MAX_TRANSCRIPT_CHARACTERS) return false;
    this.#items.set(event.item_id, next);
    if (event.type === 'conversation.item.input_audio_transcription.completed') this.#completed.add(event.item_id);
    return true;
  }
}
