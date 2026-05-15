import { test } from "node:test";
import assert from "node:assert/strict";
import { extractCustomerTexts } from "./note-forwarder.ts";

test("extractCustomerTexts: keeps only user text messages, drops operator/notes", () => {
  const result = extractCustomerTexts([
    { from: "user", type: "text", content: "hello" },
    { from: "operator", type: "text", content: "hi back" },
    { from: "user", type: "note", content: "internal" },
    { from: "user", type: "text", content: "scroll bug" },
  ]);
  assert.deepEqual(result, [
    { text: "hello" },
    { text: "scroll bug" },
  ]);
});

test("extractCustomerTexts: drops empty/whitespace and non-string content", () => {
  const result = extractCustomerTexts([
    { from: "user", type: "text", content: "   " },
    { from: "user", type: "text", content: "" },
    { from: "user", type: "text", content: 123 as unknown as string },
    { from: "user", type: "text", content: { foo: "bar" } as unknown as string },
    { from: "user", type: "text", content: "real" },
  ]);
  assert.deepEqual(result, [{ text: "real" }]);
});

test("extractCustomerTexts: returns at most 5 messages (most-recent last)", () => {
  const messages = Array.from({ length: 8 }, (_, i) => ({
    from: "user",
    type: "text",
    content: `msg${i + 1}`,
  }));
  const result = extractCustomerTexts(messages);
  assert.equal(result.length, 5);
  assert.deepEqual(result.map((m) => m.text), ["msg4", "msg5", "msg6", "msg7", "msg8"]);
});

test("extractCustomerTexts: empty input → empty output", () => {
  assert.deepEqual(extractCustomerTexts([]), []);
});
