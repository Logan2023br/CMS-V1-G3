import { test } from "node:test";
import assert from "node:assert/strict";
import {
  escalateSourceRevertIssueHandler,
  formatSourceRevertNoteContent,
} from "./handler.ts";

test("source-revert: minimal happy path — only description", async () => {
  const out = await escalateSourceRevertIssueHandler({
    issue_description:
      "Customer wants to add GA tracking snippet to PageFly source in theme; rejected Custom CSS/JS workaround.",
  });
  assert.equal(out.is_ready_for_escalation, true);
  assert.equal(out.missing_info.length, 0);
});

test("source-revert: no access / editor-exit gates at all", async () => {
  // Verify the handler bypasses access + editor-exit gates entirely:
  // no crisp_session_id, no user_exited_editor — but tool still escalates.
  const out = await escalateSourceRevertIssueHandler({
    issue_description: "Customer rejected explanation",
  });
  assert.equal(out.is_ready_for_escalation, true);
});

test("source-revert: with screenshot URL", async () => {
  const out = await escalateSourceRevertIssueHandler({
    issue_description: "Customer rejected explanation, wants code in source",
    screenshot_urls: ["https://prnt.sc/abc"],
  });
  assert.equal(out.is_ready_for_escalation, true);
  assert.match(out.crisp_note.content, /screenshot: https:\/\/prnt\.sc\/abc/);
});

test("source-revert: with attached files only", async () => {
  const out = await escalateSourceRevertIssueHandler({
    issue_description: "Customer rejected explanation",
    customer_attached_files: true,
  });
  assert.equal(out.is_ready_for_escalation, true);
  assert.match(out.crisp_note.content, /screenshot: customer attached files in ticket/);
});

test("formatSourceRevertNoteContent: minimal — issue + ticket only", () => {
  const note = formatSourceRevertNoteContent(
    {
      issueDescription:
        "Customer adding custom tracking snippet to PageFly source in theme; rejected Custom CSS/JS workaround.",
      screenshotUrls: [],
      customerAttachedFiles: false,
    },
    "https://app.crisp.chat/website/W/inbox/session_S"
  );
  assert.equal(
    note,
    "Issue: Customer adding custom tracking snippet to PageFly source in theme; rejected Custom CSS/JS workaround.\nTicket: https://app.crisp.chat/website/W/inbox/session_S"
  );
});

test("formatSourceRevertNoteContent: with screenshot URL", () => {
  const note = formatSourceRevertNoteContent(
    {
      issueDescription: "Customer rejected explanation",
      screenshotUrls: ["https://prnt.sc/abc"],
      customerAttachedFiles: false,
    },
    "https://app.crisp.chat/website/W/inbox/session_S"
  );
  assert.match(note, /screenshot: https:\/\/prnt\.sc\/abc/);
});

test("formatSourceRevertNoteContent: never adds editor / publish lines", () => {
  const note = formatSourceRevertNoteContent(
    {
      issueDescription: "Customer rejected explanation",
      screenshotUrls: ["https://prnt.sc/abc"],
      customerAttachedFiles: false,
    },
    "https://app.crisp.chat/website/W/inbox/session_S"
  );
  assert.doesNotMatch(note, /Editor:/);
  assert.doesNotMatch(note, /Allowed to publish|Only Save/);
  assert.equal(note.split("\n").length, 2);
});

test("formatSourceRevertNoteContent: attached files only", () => {
  const note = formatSourceRevertNoteContent(
    {
      issueDescription: "Customer code rejection",
      screenshotUrls: [],
      customerAttachedFiles: true,
    },
    "https://app.crisp.chat/website/W/inbox/session_S"
  );
  assert.match(note, /screenshot: customer attached files in ticket/);
});
