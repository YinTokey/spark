import assert from "node:assert/strict";
import test from "node:test";

import { scriptBody, scriptParagraphs, toIdea, toScript } from "./spark-data.ts";

test("maps a database idea into phone presentation without duplicated stored fields", () => {
  const idea = toIdea({
    id: "11111111-1111-4111-8111-111111111111",
    text: "Walking without headphones gives unfinished thoughts room to connect.",
    created_at: "2026-09-08T04:42:00.000Z",
  }, new Date("2026-09-08T05:00:00.000Z"));

  assert.equal(idea.title, "Walking without headphones gives unfinished thoughts…");
  assert.equal(idea.note, "Walking without headphones gives unfinished thoughts room to connect.");
  assert.equal(idea.date, "Today");
  assert.equal(idea.status, "Raw");
});

test("keeps the full script text and derives its display title from the first non-empty line", () => {
  const text = "\nWhy walking unlocks ideas\n\nYour best idea may be one walk away.\n\nLeave the desk for ten minutes.";
  const script = toScript({
    id: "22222222-2222-4222-8222-222222222222",
    text,
    idea_ids: ["11111111-1111-4111-8111-111111111111"],
    created_at: "2026-09-08T04:55:00.000Z",
  });

  assert.equal(script.title, "Why walking unlocks ideas");
  assert.equal(script.text, text);
  assert.equal(scriptBody(script.text), "Your best idea may be one walk away.\n\nLeave the desk for ten minutes.");
  assert.deepEqual(scriptParagraphs(script.text), ["Your best idea may be one walk away.", "Leave the desk for ten minutes."]);
});
