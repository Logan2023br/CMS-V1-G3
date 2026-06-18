import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hasStoreAccess,
  pickAccessPendingWaitMessage,
  ACCESS_PENDING_WAIT_VI,
  ACCESS_PENDING_WAIT_EN,
  buildAccessRequestNote,
  buildAccessRequest,
  ENGLISH_ACCESS_INSTRUCTIONS,
  matchAccessAcknowledged,
  mustAskHomepage,
} from "./store-access.ts";

test("hasStoreAccess: non-empty URL string => true", () => {
  const meta = {
    data: {
      data: { store_access: "https://partners.shopify.com/123/stores/456" },
    },
  };
  assert.equal(hasStoreAccess(meta), true);
});

test("hasStoreAccess: empty string => false", () => {
  const meta = { data: { data: { store_access: "" } } };
  assert.equal(hasStoreAccess(meta), false);
});

test("hasStoreAccess: missing field => false", () => {
  const meta = { data: { data: {} } };
  assert.equal(hasStoreAccess(meta), false);
});

test("hasStoreAccess: missing data.data => false", () => {
  const meta = { data: {} };
  assert.equal(hasStoreAccess(meta), false);
});

test("hasStoreAccess: undefined meta => false", () => {
  assert.equal(hasStoreAccess(undefined), false);
});

test("hasStoreAccess: non-string value => false", () => {
  const meta = { data: { data: { store_access: 123 as unknown as string } } };
  assert.equal(hasStoreAccess(meta), false);
});

// Tests run without ANTHROPIC_API_KEY → Claude generation fails →
// helper falls back to VI/EN heuristic templates (the assertions below).
// Production path with API key generates a reply in the customer's actual
// chat language (any language Claude supports).
test("pickAccessPendingWaitMessage: Vietnamese diacritics => VI fallback", async () => {
  assert.equal(await pickAccessPendingWaitMessage("Tôi không scroll được"), ACCESS_PENDING_WAIT_VI);
});

test("pickAccessPendingWaitMessage: English => EN fallback", async () => {
  assert.equal(await pickAccessPendingWaitMessage("My page is broken"), ACCESS_PENDING_WAIT_EN);
});

test("pickAccessPendingWaitMessage: empty / undefined => EN fallback default", async () => {
  assert.equal(await pickAccessPendingWaitMessage(""), ACCESS_PENDING_WAIT_EN);
  assert.equal(await pickAccessPendingWaitMessage(undefined), ACCESS_PENDING_WAIT_EN);
});

test("buildAccessRequestNote mentions the on-duty TS by name + the permissions, NOT Logan", () => {
  const note = buildAccessRequestNote("Syed", "https://myshop.com");
  assert.match(note, /@Syed/);
  assert.match(note, /Homepage: https:\/\/myshop\.com/);
  assert.match(note, /Home, Products, Customers/);
  assert.match(note, /Manage and install apps and channels/);
  assert.doesNotMatch(note, /@Logan/);
});

test("buildAccessRequest tags the on-duty TS's crispId and stamps the marker", () => {
  const ts = { name: "Dan", crispId: "4d04b661-55a9-4763-8d94-ccb1613b980f" };
  const { content, mentions } = buildAccessRequest(ts, "https://shop.io");
  assert.deepEqual(mentions, ["4d04b661-55a9-4763-8d94-ccb1613b980f"]);
  assert.match(content, /@Dan/);
  assert.match(content, /\[access-requested\]/);
});

test("ENGLISH_ACCESS_INSTRUCTIONS contains the screenshot link", () => {
  assert.match(
    ENGLISH_ACCESS_INSTRUCTIONS,
    /https:\/\/prnt\.sc\/2064S7B2T0Rv/
  );
});

test("matchAccessAcknowledged: plain prefix", () => {
  assert.equal(matchAccessAcknowledged("Hugo: đã xin access xong"), true);
});

test("matchAccessAcknowledged: case-insensitive", () => {
  assert.equal(matchAccessAcknowledged("HUGO: ĐÃ XIN ACCESS XONG"), true);
});

test("matchAccessAcknowledged: with Slack-bridge prefix", () => {
  assert.equal(
    matchAccessAcknowledged(
      "[Logan TS](https://bravebits.slack.com/archives/X/p1): Hugo: đã xin access xong"
    ),
    true
  );
});

test("matchAccessAcknowledged: trailing text after the prefix still matches", () => {
  assert.equal(matchAccessAcknowledged("Hugo: đã xin access xong rồi nhé"), true);
});

test("matchAccessAcknowledged: other Hugo: notes do NOT match", () => {
  assert.equal(matchAccessAcknowledged("Hugo: vui lòng hỏi khách bị từ khi nào"), false);
});

test("matchAccessAcknowledged: empty / undefined => false", () => {
  assert.equal(matchAccessAcknowledged(""), false);
  assert.equal(matchAccessAcknowledged(undefined), false);
});

test("mustAskHomepage: valid url + flag true => false (do not ask)", () => {
  assert.equal(mustAskHomepage("https://shop.com", true), false);
});

test("mustAskHomepage: valid url + flag false => true (ask)", () => {
  assert.equal(mustAskHomepage("https://shop.com", false), true);
});

test("mustAskHomepage: valid url + flag undefined => true (ask)", () => {
  assert.equal(mustAskHomepage("https://shop.com", undefined), true);
});

test("mustAskHomepage: no url + flag true => true (ask)", () => {
  assert.equal(mustAskHomepage(undefined, true), true);
  assert.equal(mustAskHomepage("not-a-url", true), true);
});

