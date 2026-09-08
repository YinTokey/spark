import assert from "node:assert/strict";
import test from "node:test";

import { toIdea, toScript } from "./spark-data.ts";

test("maps a database idea into phone presentation without duplicated stored fields", () => {
  const idea = toIdea({
    id: "11111111-1111-4111-8111-111111111111",
    transcript: "Walking without headphones gives unfinished thoughts room to connect.",
    created_at: "2026-09-08T04:42:00.000Z",
  }, new Date("2026-09-08T05:00:00.000Z"));

  assert.equal(idea.title, "Walking without headphones gives unfinished thoughts…");
  assert.equal(idea.note, "Walking without headphones gives unfinished thoughts room to connect.");
  assert.equal(idea.date, "Today");
  assert.equal(idea.status, "Raw");
});

test("maps script body paragraphs for the detail view and teleprompter", () => {
  const script = toScript({
    id: "22222222-2222-4222-8222-222222222222",
    title: "Why walking unlocks ideas",
    hook: "Your best idea may be one walk away.",
    body: "Leave the desk for ten minutes.\n\nLet the unfinished thought move with you.",
    outro: "Take the walk and keep the thought.",
    idea_ids: ["11111111-1111-4111-8111-111111111111"],
    created_at: "2026-09-08T04:55:00.000Z",
  });

  assert.deepEqual(script.points, [
    "Leave the desk for ten minutes.",
    "Let the unfinished thought move with you.",
  ]);
});
