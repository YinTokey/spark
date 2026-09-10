import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LiveTranscriptAccumulator } from './live-transcript.ts';

test('accumulates transcript deltas and replaces each item with its completed text', () => {
  const transcript = new LiveTranscriptAccumulator();
  assert.equal(transcript.accept(JSON.stringify({ type: 'conversation.item.input_audio_transcription.delta', item_id: 'item-1', delta: 'A spoken ' })), true);
  assert.equal(transcript.accept(JSON.stringify({ type: 'conversation.item.input_audio_transcription.delta', item_id: 'item-1', delta: 'idea' })), true);
  assert.equal(transcript.text, 'A spoken idea');
  assert.equal(transcript.completedText, null);
  assert.equal(transcript.accept(JSON.stringify({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'item-1', transcript: 'A spoken idea, finalized.' })), true);
  assert.equal(transcript.text, 'A spoken idea, finalized.');
  assert.equal(transcript.completedText, 'A spoken idea, finalized.');
});

test('ignores malformed, unknown, oversized, and stale events', () => {
  const transcript = new LiveTranscriptAccumulator();
  assert.equal(transcript.accept('not json'), false);
  assert.equal(transcript.accept(JSON.stringify({ type: 'unknown', text: 'private' })), false);
  assert.equal(transcript.accept('x'.repeat(65_537)), false);
  assert.equal(transcript.accept(JSON.stringify({ type: 'conversation.item.input_audio_transcription.delta', item_id: '', delta: 'private' })), false);
  assert.equal(transcript.text, '');
  assert.equal(transcript.completedText, null);
});

test('caps displayed transcription text at 8,000 characters', () => {
  const transcript = new LiveTranscriptAccumulator();
  assert.equal(transcript.accept(JSON.stringify({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'item-1', transcript: 'x'.repeat(8_001) })), false);
  assert.equal(transcript.text, '');
});

test('keeps completed transcript items immutable when late events arrive', () => {
  const transcript = new LiveTranscriptAccumulator();
  assert.equal(transcript.accept(JSON.stringify({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'item-1', transcript: 'Final text' })), true);
  assert.equal(transcript.accept(JSON.stringify({ type: 'conversation.item.input_audio_transcription.delta', item_id: 'item-1', delta: ' altered' })), false);
  assert.equal(transcript.accept(JSON.stringify({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'item-1', transcript: 'Replacement' })), false);
  assert.equal(transcript.text, 'Final text');
  assert.equal(transcript.completedText, 'Final text');
});
