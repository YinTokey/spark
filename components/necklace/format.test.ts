import { test } from "node:test";
import assert from "node:assert/strict";
import { formatMinutesSeconds } from "./format.ts";

test("formats zero as 00:00", () => {
  assert.equal(formatMinutesSeconds(0), "00:00");
});

test("pads single-digit seconds", () => {
  assert.equal(formatMinutesSeconds(9000), "00:09");
});

test("rolls seconds into minutes at the 60s boundary", () => {
  assert.equal(formatMinutesSeconds(60000), "01:00");
  assert.equal(formatMinutesSeconds(59999), "00:59");
});

test("truncates partial seconds rather than rounding", () => {
  assert.equal(formatMinutesSeconds(1999), "00:01");
});
