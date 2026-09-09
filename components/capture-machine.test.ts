import assert from "node:assert/strict";
import { test } from "node:test";
import { initialPhase, reducePhase } from "./capture-machine.ts";

function run(events: Parameters<typeof reducePhase>[1][]) {
  return events.reduce(reducePhase, initialPhase);
}

test("recording flows through processing to done", () => {
  assert.equal(run([{ type: "REQUESTED" }, { type: "RECORDING" }, { type: "STOPPED" }, { type: "SUCCEEDED" }]), "done");
});

test("a failure during processing recovers through retry to done", () => {
  assert.equal(run([
    { type: "REQUESTED" }, { type: "RECORDING" }, { type: "STOPPED" },
    { type: "FAILED" }, { type: "RETRY" }, { type: "SUCCEEDED" },
  ]), "done");
});

test("processing can be reset back to ready", () => {
  assert.equal(run([{ type: "REQUESTED" }, { type: "RECORDING" }, { type: "STOPPED" }, { type: "RESET" }]), "ready");
});

test("a stale success after reset cannot move ready", () => {
  const reset = reducePhase(reducePhase(initialPhase, { type: "REQUESTED" }), { type: "RESET" });
  assert.equal(reducePhase(reset, { type: "SUCCEEDED" }), "ready");
});

test("requesting can fail to error and start over through requesting", () => {
  assert.equal(run([{ type: "REQUESTED" }, { type: "FAILED" }, { type: "REQUESTED" }]), "requesting");
});

test("done can start a new capture directly", () => {
  assert.equal(run([{ type: "REQUESTED" }, { type: "RECORDING" }, { type: "STOPPED" }, { type: "SUCCEEDED" }, { type: "REQUESTED" }]), "requesting");
});

test("invalid events return the identical phase", () => {
  assert.equal(reducePhase("ready", { type: "RECORDING" }), "ready");
  assert.equal(reducePhase("recording", { type: "SUCCEEDED" }), "recording");
  assert.equal(reducePhase("done", { type: "RETRY" }), "done");
});
