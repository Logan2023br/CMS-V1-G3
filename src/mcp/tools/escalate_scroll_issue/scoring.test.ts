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
