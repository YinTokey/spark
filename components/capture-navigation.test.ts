import assert from "node:assert/strict";
import { test } from "node:test";
import { captureNavigationItems, isPhoneTab } from "./capture-navigation.ts";

test("capture navigation offers Capture and Phone only", () => {
  assert.deepEqual(captureNavigationItems, ["Capture", "Phone"]);
});

test("Phone selects the phone mock while Capture selects the capture view", () => {
  assert.equal(isPhoneTab("Phone"), true);
  assert.equal(isPhoneTab("Capture"), false);
});
