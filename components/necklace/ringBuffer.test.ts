import { test } from "node:test";
import assert from "node:assert/strict";
import { createRingBuffer, pushSample, readRecent, clearRingBuffer } from "./ringBuffer.ts";

test("empty buffer returns no samples", () => {
  const buf = createRingBuffer(4);
  assert.deepEqual(readRecent(buf, 4), []);
});

test("partially filled buffer returns only what was pushed, oldest first", () => {
  const buf = createRingBuffer(4);
  pushSample(buf, 1);
  pushSample(buf, 2);
  assert.deepEqual(readRecent(buf, 4), [1, 2]);
});

test("exactly full buffer returns all samples in push order", () => {
  const buf = createRingBuffer(3);
  pushSample(buf, 1);
  pushSample(buf, 2);
  pushSample(buf, 3);
  assert.deepEqual(readRecent(buf, 3), [1, 2, 3]);
});

test("pushing beyond capacity overwrites the oldest sample", () => {
  const buf = createRingBuffer(3);
  pushSample(buf, 1);
  pushSample(buf, 2);
  pushSample(buf, 3);
  pushSample(buf, 4);
  assert.deepEqual(readRecent(buf, 3), [2, 3, 4]);
});

test("requesting fewer samples than are stored returns only the most recent", () => {
  const buf = createRingBuffer(5);
  [1, 2, 3, 4].forEach((v) => pushSample(buf, v));
  assert.deepEqual(readRecent(buf, 2), [3, 4]);
});

test("requesting more samples than capacity is clamped to capacity", () => {
  const buf = createRingBuffer(3);
  [1, 2, 3, 4, 5].forEach((v) => pushSample(buf, v));
  assert.deepEqual(readRecent(buf, 10), [3, 4, 5]);
});

test("clearRingBuffer empties a full buffer back to its initial state", () => {
  const buf = createRingBuffer(3);
  [1, 2, 3, 4].forEach((v) => pushSample(buf, v));
  clearRingBuffer(buf);
  assert.deepEqual(readRecent(buf, 3), []);
  pushSample(buf, 9);
  assert.deepEqual(readRecent(buf, 3), [9]);
});
