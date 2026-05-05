import { test } from "node:test";
import assert from "node:assert/strict";
import { normalize } from "./scoring.ts";

test("normalize: trims and collapses whitespace", () => {
  assert.equal(normalize("  hello   world  "), "hello world");
});

test("normalize: preserves Vietnamese diacritics", () => {
  assert.equal(normalize("  Khách hàng không scroll được  "), "Khách hàng không scroll được");
});

test("normalize: preserves case", () => {
  assert.equal(normalize("Hello World"), "Hello World");
});

test("normalize: collapses tabs and newlines", () => {
  assert.equal(normalize("a\t\tb\nc"), "a b c");
});

import { scoreConversation } from "./scoring.ts";

test("scoreConversation: exact_text gives +100", () => {
  const result = scoreConversation(
    { last_message: "Khách hàng không scroll được" },
    { customerLastMessageText: "Khách hàng không scroll được" },
    false,
    false
  );
  assert.equal(result.score, 100);
  assert.deepEqual(result.signalsMatched, ["exact_text"]);
});

test("scoreConversation: exact_text matches after normalize whitespace", () => {
  const result = scoreConversation(
    { last_message: "  Khách hàng   không scroll  được  " },
    { customerLastMessageText: "Khách hàng không scroll được" },
    false,
    false
  );
  assert.equal(result.score, 100);
});

test("scoreConversation: exact_text skipped when input missing", () => {
  const result = scoreConversation(
    { last_message: "anything" },
    {},
    false,
    false
  );
  assert.equal(result.score, 0);
  assert.deepEqual(result.signalsMatched, []);
});

test("scoreConversation: exact_text skipped when input is whitespace only", () => {
  const result = scoreConversation(
    { last_message: "anything" },
    { customerLastMessageText: "   " },
    false,
    false
  );
  assert.equal(result.score, 0);
});
