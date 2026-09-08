import { test } from "node:test";
import assert from "node:assert/strict";
import { ARMING_BUZZ_MS, STOPPING_BUZZ_MS } from "./recorderMachine.ts";
import {
  activatePendant,
  START_BUZZ_PATTERN,
  STOP_BUZZ_PATTERN,
  patternDurationMs,
  scheduleBuzz,
  vibrateDevice,
  type AudioBuzzContext,
} from "./haptics.ts";

test("start and stop patterns are distinguishable", () => {
  assert.notDeepEqual(START_BUZZ_PATTERN, STOP_BUZZ_PATTERN);
  assert.equal(START_BUZZ_PATTERN.length, 1);
  assert.equal(STOP_BUZZ_PATTERN.length, 3);
});

test("start pattern duration matches the armingBuzz state duration", () => {
  assert.equal(patternDurationMs(START_BUZZ_PATTERN), ARMING_BUZZ_MS);
});

test("stop pattern duration matches the stoppingBuzz state duration", () => {
  assert.equal(patternDurationMs(STOP_BUZZ_PATTERN), STOPPING_BUZZ_MS);
});

test("patternDurationMs sums pulses and gaps", () => {
  assert.equal(patternDurationMs([90, 80, 90]), 260);
  assert.equal(patternDurationMs([]), 0);
});

function fakeAudioContext() {
  const created: { type?: string; frequency?: number; gain: number[] }[] = [];
  const ctx: AudioBuzzContext = {
    currentTime: 0,
    destination: {} as AudioDestinationNode,
    createGain: () =>
      ({
        gain: {
          setValueAtTime: () => {},
          exponentialRampToValueAtTime: () => {},
        },
        connect: () => {},
      }) as unknown as GainNode,
    createOscillator: () => {
      const node: { type: string; frequency: { value: number }; connect: () => void; start: () => void; stop: () => void } = {
        type: "",
        frequency: { value: 0 },
        connect: () => {},
        start: () => {
          created.push({ type: node.type, frequency: node.frequency.value, gain: [] });
        },
        stop: () => {},
      };
      return node as unknown as OscillatorNode;
    },
  };
  return { ctx, created };
}

test("scheduleBuzz is a no-op when there is no audio context", () => {
  assert.doesNotThrow(() => scheduleBuzz(null, START_BUZZ_PATTERN));
});

test("scheduleBuzz starts an oscillator per tone per pulse", () => {
  const { ctx, created } = fakeAudioContext();
  scheduleBuzz(ctx, STOP_BUZZ_PATTERN);
  // 2 tones x 2 pulses (STOP_BUZZ_PATTERN has 2 pulse entries at indices 0 and 2)
  assert.equal(created.length, 4);
});

test("vibrateDevice does not throw when navigator.vibrate is absent", () => {
  assert.doesNotThrow(() => vibrateDevice(START_BUZZ_PATTERN));
});

test("activatePendant buzzes once for start, twice for stop, and invokes the action", () => {
  const calls: { actions: number; patterns: number[][] } = { actions: 0, patterns: [] };
  const onPress = () => { calls.actions += 1; };
  const buzz = (pattern: number[]) => { calls.patterns.push(pattern); };

  activatePendant(false, onPress, buzz);
  activatePendant(true, onPress, buzz);

  assert.equal(calls.actions, 2);
  assert.deepEqual(calls.patterns, [[180], [90, 80, 90]]);
});
