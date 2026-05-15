import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildPrompt,
  parseClaudeResponse,
  stripHugoPrefix,
  hasHugoPrefix,
  SYSTEM_PROMPT,
} from "./anthropic.ts";

test("hasHugoPrefix: case-insensitive match after trim", () => {
  assert.equal(hasHugoPrefix("Hugo: please ask"), true);
  assert.equal(hasHugoPrefix("hugo: please ask"), true);
  assert.equal(hasHugoPrefix("HUGO: please ask"), true);
  assert.equal(hasHugoPrefix("  Hugo:  please ask  "), true);
});

test("hasHugoPrefix: does NOT match when prefix is wrong", () => {
  assert.equal(hasHugoPrefix("Issue: scroll bug"), false);
  assert.equal(hasHugoPrefix("[Hugo auto-replied]: hi"), false);
  assert.equal(hasHugoPrefix("Hello Hugo:"), false);
});

test("hasHugoPrefix: false on undefined / empty", () => {
  assert.equal(hasHugoPrefix(undefined), false);
  assert.equal(hasHugoPrefix(""), false);
  assert.equal(hasHugoPrefix("   "), false);
});

test("stripHugoPrefix: removes prefix and trims", () => {
  assert.equal(stripHugoPrefix("Hugo: hi there"), "hi there");
  assert.equal(stripHugoPrefix("  hugo:  hi there  "), "hi there");
});

test("stripHugoPrefix: returns original (trimmed) when no prefix", () => {
  assert.equal(stripHugoPrefix("  hello  "), "hello");
});

test("buildPrompt: embeds customer messages and stripped note", () => {
  const out = buildPrompt({
    noteContentWithoutPrefix: "vui lòng hỏi xem này đã bị từ khi nào",
    customerMessages: [
      { text: "scroll bị lỗi" },
      { text: "https://prnt.sc/abc" },
    ],
  });
  assert.equal(out.system, SYSTEM_PROMPT);
  assert.match(out.userMessage, /Customer's recent messages \(most recent last\):/);
  assert.match(out.userMessage, /1\. "scroll bị lỗi"/);
  assert.match(out.userMessage, /2\. "https:\/\/prnt\.sc\/abc"/);
  assert.match(out.userMessage, /TS note \(translate intent \+ preserve URLs\):/);
  assert.match(out.userMessage, /"vui lòng hỏi xem này đã bị từ khi nào"/);
});

test("buildPrompt: handles empty customer messages", () => {
  const out = buildPrompt({
    noteContentWithoutPrefix: "thông báo đã fix",
    customerMessages: [],
  });
  assert.match(out.userMessage, /Customer's recent messages: \(none/);
  assert.match(out.userMessage, /"thông báo đã fix"/);
});

test("parseClaudeResponse: NO_REPLY token => skip", () => {
  assert.deepEqual(parseClaudeResponse("NO_REPLY"), { kind: "skip" });
  assert.deepEqual(parseClaudeResponse("  NO_REPLY  "), { kind: "skip" });
});

test("parseClaudeResponse: empty / whitespace => skip", () => {
  assert.deepEqual(parseClaudeResponse(""), { kind: "skip" });
  assert.deepEqual(parseClaudeResponse("   \n  "), { kind: "skip" });
});

test("parseClaudeResponse: real text => reply with trimmed text", () => {
  assert.deepEqual(
    parseClaudeResponse("  Could you let us know when this started?  "),
    { kind: "reply", text: "Could you let us know when this started?" }
  );
});
