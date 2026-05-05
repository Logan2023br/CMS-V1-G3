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
