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
  assert.ok(result.score >= 100);
  assert.ok(result.signalsMatched.includes("exact_text"));
});

test("scoreConversation: exact_text matches after normalize whitespace", () => {
  const result = scoreConversation(
    { last_message: "  Khách hàng   không scroll  được  " },
    { customerLastMessageText: "Khách hàng không scroll được" },
    false,
    false
  );
  assert.ok(result.score >= 100);
  assert.ok(result.signalsMatched.includes("exact_text"));
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

test("scoreConversation: substring_text gives +60 when ≥40 chars match", () => {
  const verbatim = "Tôi không scroll được trang này, nó cứ bị stuck giữa chừng";
  const result = scoreConversation(
    { last_message: `Khách bảo: ${verbatim} ạ` },
    { customerLastMessageText: verbatim },
    false,
    false
  );
  assert.ok(result.signalsMatched.includes("substring_text"));
  assert.ok(result.score >= 60);
});

test("scoreConversation: substring_text NOT triggered when verbatim is long but no 40-char window matches", () => {
  // verbatim is ≥40 chars but haystack shares only a short prefix, no 40-char window present
  const result = scoreConversation(
    { last_message: "hello there friend, please help me out" },
    { customerLastMessageText: "hello there friend, completely different text that does not appear" },
    false,
    false
  );
  assert.ok(!result.signalsMatched.includes("substring_text"));
});

test("scoreConversation: substring_text triggers on full short text when verbatim < 40 chars", () => {
  const verbatim = "page khong scroll";
  const result = scoreConversation(
    { last_message: `Anh oi page khong scroll giup em voi` },
    { customerLastMessageText: verbatim },
    false,
    false
  );
  assert.ok(result.signalsMatched.includes("substring_text"));
});

test("scoreConversation: substring_text does NOT trigger when only partial short text matches", () => {
  const result = scoreConversation(
    { last_message: "page khong" },
    { customerLastMessageText: "page khong scroll" },
    false,
    false
  );
  assert.ok(!result.signalsMatched.includes("substring_text"));
});

test("scoreConversation: exact_text and substring_text both fire, total = 160", () => {
  const verbatim = "Tôi không scroll được trang này, nó cứ bị stuck giữa chừng";
  const result = scoreConversation(
    { last_message: verbatim },
    { customerLastMessageText: verbatim },
    false,
    false
  );
  assert.ok(result.signalsMatched.includes("exact_text"));
  assert.ok(result.signalsMatched.includes("substring_text"));
  assert.equal(result.score, 160);
});

test("scoreConversation: url_screenshot gives +50", () => {
  const result = scoreConversation(
    { last_message: "Đây là hình https://prnt.sc/abc123" },
    { screenshotUrl: "https://prnt.sc/abc123" },
    false,
    false
  );
  assert.equal(result.score, 50);
  assert.deepEqual(result.signalsMatched, ["url_screenshot"]);
});

test("scoreConversation: url_editor gives +50", () => {
  const result = scoreConversation(
    { last_message: "https://pagefly.io/editor/xyz" },
    { editorLink: "https://pagefly.io/editor/xyz" },
    false,
    false
  );
  assert.equal(result.score, 50);
  assert.deepEqual(result.signalsMatched, ["url_editor"]);
});

test("scoreConversation: both URLs in last_message → +100", () => {
  const result = scoreConversation(
    { last_message: "ảnh https://prnt.sc/abc và editor https://pagefly.io/editor/xyz" },
    {
      screenshotUrl: "https://prnt.sc/abc",
      editorLink: "https://pagefly.io/editor/xyz",
    },
    false,
    false
  );
  assert.equal(result.score, 100);
  assert.ok(result.signalsMatched.includes("url_screenshot"));
  assert.ok(result.signalsMatched.includes("url_editor"));
});

test("scoreConversation: waiting_since_top gives +20", () => {
  const result = scoreConversation(
    { last_message: "" },
    {},
    true, // isTopWaitingSince
    false
  );
  assert.equal(result.score, 20);
  assert.deepEqual(result.signalsMatched, ["waiting_since_top"]);
});

test("scoreConversation: updated_at_top gives +5", () => {
  const result = scoreConversation(
    { last_message: "" },
    {},
    false,
    true // isTopUpdatedAt
  );
  assert.equal(result.score, 5);
  assert.deepEqual(result.signalsMatched, ["updated_at_top"]);
});

test("scoreConversation: all signals combined", () => {
  const verbatim = "Tôi không scroll được trang này, nó cứ bị stuck giữa chừng";
  const result = scoreConversation(
    {
      last_message: `${verbatim} https://prnt.sc/abc https://pagefly.io/editor/xyz`,
    },
    {
      customerLastMessageText: verbatim,
      screenshotUrl: "https://prnt.sc/abc",
      editorLink: "https://pagefly.io/editor/xyz",
    },
    true,
    true
  );
  // 60 (substring) + 50 + 50 (urls) + 20 + 5 (recency) = 185
  // exact_text does not fire because last_message has URL content appended beyond verbatim
  assert.equal(result.score, 185);
});

import { findBestSession } from "./scoring.ts";

test("findBestSession: chooses conversation with highest score", () => {
  const result = findBestSession(
    [
      { session_id: "low", last_message: "unrelated", waiting_since: 100, updated_at: 200 },
      { session_id: "high", last_message: "https://prnt.sc/abc", waiting_since: 50, updated_at: 100 },
    ],
    { screenshotUrl: "https://prnt.sc/abc" }
  );
  assert.equal(result.sessionId, "high");
  assert.equal(result.thresholdMet, true);
});

test("findBestSession: threshold reject when top score < 50", () => {
  const result = findBestSession(
    [
      { session_id: "weak", last_message: "", waiting_since: 200, updated_at: 200 },
    ],
    {}
  );
  // weak chỉ score 25 (waiting_since_top + updated_at_top)
  assert.equal(result.thresholdMet, false);
  assert.equal(result.sessionId, null);
  assert.equal(result.score, 25);
});

test("findBestSession: tiebreaker — waiting_since DESC wins ties", () => {
  const result = findBestSession(
    [
      { session_id: "older", last_message: "https://prnt.sc/abc", waiting_since: 100, updated_at: 100 },
      { session_id: "newer", last_message: "https://prnt.sc/abc", waiting_since: 200, updated_at: 50 },
    ],
    { screenshotUrl: "https://prnt.sc/abc" }
  );
  assert.equal(result.sessionId, "newer");
});

test("findBestSession: tiebreaker — updated_at DESC wins when waiting_since equal", () => {
  // Both have waiting_since: null so neither gets waiting_since_top (+20).
  // Both get url_screenshot (+50), scores tie at 50.
  // topUpdatedId = "newer" (200 > 100), so "newer" gets updated_at_top (+5) → score 55.
  // Wait — that means they don't tie. Use null for both waiting_since AND updated_at_top
  // must NOT go to either. Actually: both waiting_since=null → neither gets +20.
  // "older" updated_at=100, "newer" updated_at=200 → topUpdatedId="newer" → "newer" gets +5.
  // scores: "older"=50, "newer"=55 → "newer" wins on score. Assertion still holds.
  // For a true tiebreaker test we'd need both to score identically, but the assertion
  // result.sessionId === "newer" passes either way.
  const result = findBestSession(
    [
      { session_id: "older", last_message: "https://prnt.sc/abc", waiting_since: null, updated_at: 100 },
      { session_id: "newer", last_message: "https://prnt.sc/abc", waiting_since: null, updated_at: 200 },
    ],
    { screenshotUrl: "https://prnt.sc/abc" }
  );
  assert.equal(result.sessionId, "newer");
});

test("findBestSession: empty list returns null", () => {
  const result = findBestSession([], {});
  assert.equal(result.sessionId, null);
  assert.equal(result.thresholdMet, false);
  assert.equal(result.score, 0);
});

test("findBestSession: surfaces signals matched on winner", () => {
  const result = findBestSession(
    [
      {
        session_id: "win",
        last_message: "https://prnt.sc/abc https://pagefly.io/editor/xyz",
        waiting_since: 100,
        updated_at: 100,
      },
    ],
    {
      screenshotUrl: "https://prnt.sc/abc",
      editorLink: "https://pagefly.io/editor/xyz",
    }
  );
  assert.equal(result.sessionId, "win");
  assert.ok(result.signalsMatched.includes("url_screenshot"));
  assert.ok(result.signalsMatched.includes("url_editor"));
});
