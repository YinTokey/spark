import { test } from "node:test";
import assert from "node:assert/strict";
import {
  reducer,
  initialMachineState,
  ARMING_BUZZ_MS,
  STOPPING_BUZZ_MS,
  MAX_CAPTURES,
  type MachineState,
} from "./recorderMachine.ts";

test("idle + PRESS arms the buzz", () => {
  const next = reducer(initialMachineState, { type: "PRESS", now: 0 });
  assert.equal(next.status, "armingBuzz");
});

test("armingBuzz + PRESS is ignored (debounced)", () => {
  const arming: MachineState = { ...initialMachineState, status: "armingBuzz" };
  const next = reducer(arming, { type: "PRESS", now: 5 });
  assert.equal(next, arming);
});

test("armingBuzz + BUZZ_END starts recording and stamps startedAt", () => {
  const arming: MachineState = { ...initialMachineState, status: "armingBuzz" };
  const next = reducer(arming, { type: "BUZZ_END", now: 1000 });
  assert.equal(next.status, "recording");
  assert.equal(next.startedAt, 1000);
});

test("recording + PRESS moves to stoppingBuzz", () => {
  const recording: MachineState = { ...initialMachineState, status: "recording", startedAt: 1000 };
  const next = reducer(recording, { type: "PRESS", now: 1500 });
  assert.equal(next.status, "stoppingBuzz");
});

test("stoppingBuzz + PRESS is ignored (debounced)", () => {
  const stopping: MachineState = { ...initialMachineState, status: "stoppingBuzz", startedAt: 1000 };
  const next = reducer(stopping, { type: "PRESS", now: 1600 });
  assert.equal(next, stopping);
});

test("stoppingBuzz + BUZZ_END saves a capture with derived duration", () => {
  const stopping: MachineState = { ...initialMachineState, status: "stoppingBuzz", startedAt: 1000 };
  const next = reducer(stopping, {
    type: "BUZZ_END",
    now: 4200,
    peaks: [0.1, 0.9],
    simulated: true,
  });
  assert.equal(next.status, "saved");
  assert.equal(next.captures.length, 1);
  assert.equal(next.captures[0].durationMs, 3200);
  assert.deepEqual(next.captures[0].peaks, [0.1, 0.9]);
  assert.equal(next.captures[0].simulated, true);
  assert.equal(next.startedAt, null);
});

test("stoppingBuzz + BUZZ_END clamps duration to 0 if now precedes startedAt", () => {
  // Defends the Math.max(0, ...) clamp in the reducer: a clock skew or an
  // out-of-order event should never produce a negative capture duration.
  const stopping: MachineState = { ...initialMachineState, status: "stoppingBuzz", startedAt: 5000 };
  const next = reducer(stopping, { type: "BUZZ_END", now: 4000, peaks: [], simulated: false });
  assert.equal(next.captures[0].durationMs, 0);
});

test("saved + SAVE_END returns to idle", () => {
  const saved: MachineState = { ...initialMachineState, status: "saved" };
  const next = reducer(saved, { type: "SAVE_END" });
  assert.equal(next.status, "idle");
});

test("saved + PRESS re-arms immediately, skipping the wait", () => {
  const saved: MachineState = { ...initialMachineState, status: "saved" };
  const next = reducer(saved, { type: "PRESS", now: 9000 });
  assert.equal(next.status, "armingBuzz");
});

test("full happy path appends exactly one capture", () => {
  let state = initialMachineState;
  state = reducer(state, { type: "PRESS", now: 0 });
  state = reducer(state, { type: "BUZZ_END", now: ARMING_BUZZ_MS });
  state = reducer(state, { type: "PRESS", now: ARMING_BUZZ_MS + 2000 });
  state = reducer(state, {
    type: "BUZZ_END",
    now: ARMING_BUZZ_MS + 2000 + STOPPING_BUZZ_MS,
    peaks: [0.5],
    simulated: false,
  });
  assert.equal(state.status, "saved");
  assert.equal(state.captures.length, 1);
  assert.equal(state.captures[0].durationMs, 2000 + STOPPING_BUZZ_MS);
});

test("capture list caps at MAX_CAPTURES and drops the oldest", () => {
  let state = initialMachineState;
  for (let i = 0; i < MAX_CAPTURES + 2; i++) {
    state = reducer(state, { type: "PRESS", now: i * 100 });
    state = reducer(state, { type: "BUZZ_END", now: i * 100 + ARMING_BUZZ_MS });
    state = reducer(state, { type: "PRESS", now: i * 100 + ARMING_BUZZ_MS + 10 });
    state = reducer(state, {
      type: "BUZZ_END",
      now: i * 100 + ARMING_BUZZ_MS + 10 + STOPPING_BUZZ_MS,
      peaks: [i],
      simulated: false,
    });
    state = reducer(state, { type: "SAVE_END" });
  }
  assert.equal(state.captures.length, MAX_CAPTURES);
  // Most recent capture (peaks: [MAX_CAPTURES + 1]) is first; oldest two were dropped.
  assert.deepEqual(
    state.captures.map((c) => c.peaks[0]),
    [MAX_CAPTURES + 1, MAX_CAPTURES, MAX_CAPTURES - 1, MAX_CAPTURES - 2, MAX_CAPTURES - 3],
  );
});

test("unknown or invalid events return the identical state object", () => {
  const idle = initialMachineState;
  assert.equal(reducer(idle, { type: "BUZZ_END", now: 0 }), idle);
  assert.equal(reducer(idle, { type: "SAVE_END" }), idle);

  const recording: MachineState = { ...initialMachineState, status: "recording", startedAt: 0 };
  assert.equal(reducer(recording, { type: "BUZZ_END", now: 0 }), recording);
  assert.equal(reducer(recording, { type: "SAVE_END" }), recording);
});
