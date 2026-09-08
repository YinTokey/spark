import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseScriptCommand } from './script-command.ts';

for (const transcript of [
  'Create a script about creator burnout',
  'Could you make me a YouTube script using my focus ideas?',
  'Draft a video script from what I just said about walking',
  'Turn my recent ideas about AI management into a script',
]) {
  test(`recognizes command: ${transcript}`, () => {
    assert.equal(parseScriptCommand(transcript).isCommand, true);
  });
}

for (const transcript of [
  'My idea is a video about why scripts often sound generic',
  'I rewrote the script today and the hook feels stronger',
  'Creators need ideas before they need a script',
]) {
  test(`keeps ordinary idea: ${transcript}`, () => {
    assert.deepEqual(parseScriptCommand(transcript), { isCommand: false });
  });
}

test('rejects blank input and input beyond the transcript limit', () => {
  assert.deepEqual(parseScriptCommand(' \n\t '), { isCommand: false });
  assert.deepEqual(parseScriptCommand('Create a script about ' + 'a'.repeat(8_000)), { isCommand: false });
});

test('normalizes case, punctuation, unicode, and whitespace', () => {
  assert.deepEqual(parseScriptCommand('  ＣＲＥＡＴＥ\u00a0a VIDEO-SCRIPT — about\u00a0deep work?! '), {
    isCommand: true,
    hint: 'deep work',
  });
});

test('extracts only the topic hint from command framing', () => {
  assert.deepEqual(parseScriptCommand('Create a script about creator burnout.'), {
    isCommand: true,
    hint: 'creator burnout',
  });
  assert.deepEqual(parseScriptCommand('Could you make me a YouTube script using my focus ideas?'), {
    isCommand: true,
    hint: 'my focus ideas',
  });
  assert.deepEqual(parseScriptCommand('Turn my recent ideas about AI management into a script'), {
    isCommand: true,
    hint: 'my recent ideas about ai management',
  });
});

test('recognizes explicit commands without a topic', () => {
  assert.deepEqual(parseScriptCommand('Please generate a YouTube script.'), {
    isCommand: true,
    hint: '',
  });
});

test('bounds the extracted hint', () => {
  const topic = 'focus '.repeat(100);
  const result = parseScriptCommand(`Write a video script about ${topic}`);
  assert.equal(result.isCommand, true);
  if (result.isCommand) assert.ok(result.hint.length <= 240);
});

test('does not classify an isolated script reference as a command', () => {
  assert.deepEqual(parseScriptCommand('The script is ready for review.'), { isCommand: false });
});
