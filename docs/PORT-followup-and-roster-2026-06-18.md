# PORT GUIDE — Cross-shift follow-up + On-duty TS roster mention (2026-06-18)

Apply the **exact same workflow** that was added to `CMS-V1-G1` to the other 5
MCP-server variants. The variants are identical in workflow and differ **only in
MCP tool names** (and the per-repo source marker). This guide tells you what is
**verbatim** and what must be **adapted per variant**.

Source commits in CMS-V1-G1: `0c6a9d3` (follow-up routing), `01de2fe` (roster +
access mention). The full unified diff is at the END of this file — it is the
100% source of truth. Everything below explains how to apply it.

## How to use
1. Paste this whole file into the target variant's repo (or its Claude session).
2. Tell Claude: *"Apply this port guide to this repo. The lib files are verbatim;
   adapt the tool-name-specific files to THIS repo's tool names. Then run
   `npm test && npm run build && npm run lint` and confirm all green."*
3. Claude applies the diff at the bottom, adapting the tool files as noted.

## What is VERBATIM (no tool names inside — copy/apply exactly)
These files have **no MCP-tool-name dependencies**; apply the diff as-is (create
new files, apply edits identically):

- `src/data/ts-roster.ts` — **NEW**. Static roster snapshot (same TS team + Crisp
  operator UUIDs across all variants → identical content).
- `src/lib/roster.ts` — **NEW**. `tsForShift(ts)`; day boundary at **02:00 GMT+7**
  (00:00–01:59 = previous day's `23-02` night shift).
- `src/lib/roster.test.ts` — **NEW**. Tests for the above.
- `src/lib/shifts.ts` — unchanged (roster relies on its `ShiftLabel`/`shiftOf`);
  the variant must already have it (it is part of the shared follow-up code).
- `src/lib/followup-routing.ts` (+ `.test.ts`) — adds `issueIdentity` +
  `intake_new` action. Pure logic, no tool names.
- `src/lib/followup-handler.ts` (+ `.test.ts`) — `classifyFollowupTarget` wiring,
  OLD-note reuse, `extractOldNoteBody`, `extractOpenIssueNames` fix (reads
  `[New shift…]`/`[Dev ticket…]`), per-(issue,shift) re-note dedup. No tool names.
- `src/lib/anthropic.ts` (+ `.test.ts`) — adds `classifyFollowupTarget` +
  `parseFollowupTargetResponse`. No tool names.
- `src/lib/store-access.ts` (+ `.test.ts`) — access-request note mentions the
  on-duty TS via `tsForShift(Date.now())` (`buildAccessRequest` /
  `buildAccessRequestNote`); drops hardcoded `@Logan`/`LOGAN_OPERATOR_ID`. The
  only tool-agnostic gate; apply verbatim.

> Note: these lib files import via the `@/lib/...` and `@/data/...` path aliases.
> Variants use the same alias setup, so imports port unchanged.

## What must be ADAPTED per variant (tool-name-specific)
- `src/mcp/tools/handle_issue_followup/main.ts` + `shapes.ts`
  → In your variant the follow-up tool may have a **different name/folder**. Apply
  the SAME description/output edits (add the `intake_new` handling text + extend
  the `action` enum doc) to **your variant's follow-up tool** files.
- `src/mcp/tools/escalate_*/main.ts` (6 tools here)
  → Your variant's escalate tools may be named differently and there may be a
  different count. The edit is a pure find/replace in each tool description:
  - `@Logan note` → `access-request note (mentioning the on-duty TS)`
  - any remaining `@Logan` phrasing in those descriptions → `the on-duty TS`
  Apply to **every** escalate tool that mentions posting an access-request note.

## Do NOT change (intentionally left alone)
- `src/lib/slack-route.ts` — its hardcoded `logan` Slack-id map is a **different**
  flow (TS "start"-note tagging in Slack), NOT the access mention. Leave it.
- The per-repo source marker (e.g. `(cms-v1-g1)`) — keep each repo's own marker.

## Roster data check (one-time, all variants share it)
All 9 UUIDs in `ts-roster.ts` were verified against Crisp operators/list and are
correct (use this exact data in every variant):
- "Dan" = `4d04b661-55a9-4763-8d94-ccb1613b980f` (Dan segun). NOTE: an earlier
  draft used `f4563d04-…` which is actually **Brock Olorunshola** — do NOT use it.
- "Abed" = `3b8c7f1e-…` (Crisp "Abid Hossain" — minor spelling, same person).
- All others match their own name.

## Verify after applying (every variant)
```
npm test        # all green (the 4 new test files + edits must pass)
npm run build   # tsc clean
npm run lint    # clean
```
TypeScript will fail the build if `ts-roster.ts` is missing any of the 7×8 cells
or references an unknown TS name — that is your safety net.

---

## FULL UNIFIED DIFF (100% source of truth)

Apply this exactly for the verbatim files; use it as the reference for the
adapted tool files. (src changes only — corrected Dan UUID included.)

```diff
diff --git a/src/data/ts-roster.ts b/src/data/ts-roster.ts
new file mode 100644
index 0000000..700b9c0
--- /dev/null
+++ b/src/data/ts-roster.ts
@@ -0,0 +1,50 @@
+/**************************************************************************
+ * TS SHIFT ROSTER — who is on duty for each (weekday × shift).
+ *
+ * Source of truth: the "AI-Agent Handle" Google Sheet, tab "LeadShift-MCP"
+ *   https://docs.google.com/spreadsheets/d/1OAlScV7tvaGGZqMmDTz_YzU5Ae8tfdkfeK7xi9JCauU
+ *
+ * This is a STATIC snapshot baked into the repo (the production server reads it
+ * directly — no Google API call at runtime). When the roster changes, update
+ * this file and redeploy.
+ *
+ * Times are GMT+7 shift windows and match `ShiftLabel` in src/lib/shifts.ts.
+ * Weekday is the GMT+7 day of the relevant timestamp.
+ *
+ * Last synced from sheet: 2026-06-18
+ ***************************************************************************/
+
+import type { ShiftLabel } from "@/lib/shifts.js";
+
+type Weekday = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";
+
+interface TsMember {
+  name: string;
+  crispId: string; // the TS operator's stable id (from the sheet)
+}
+
+// Each TS appears once here; the roster grid references them by name.
+const TS_MEMBERS: Record<string, TsMember> = {
+  Syed: { name: "Syed", crispId: "dfa152f5-1a19-4869-b08e-34de07b1b477" },
+  Shami: { name: "Shami", crispId: "c4c2d94d-6da3-4ce6-82fb-cdc518a885f6" },
+  Ethan: { name: "Ethan", crispId: "c7b8a1b2-a162-4ebe-987a-a24d92b8d2c6" },
+  Adrian: { name: "Adrian", crispId: "a2af1c4e-1418-427e-9372-0f11bcdac1cb" },
+  Mahedi: { name: "Mahedi", crispId: "f451cb33-ae68-4aad-831a-7570fc0d916a" },
+  Abed: { name: "Abed", crispId: "3b8c7f1e-e4be-4003-9238-27b17260f681" },
+  Dan: { name: "Dan", crispId: "4d04b661-55a9-4763-8d94-ccb1613b980f" },
+  Marcel: { name: "Marcel", crispId: "901273a2-fdcb-43d5-9400-fe58544ea192" },
+  Aldwin: { name: "Aldwin", crispId: "b7b64ecf-e4d2-4aee-bc55-ce2d5c0a10e2" },
+};
+
+// TS_ROSTER[weekday][shift] = a key into TS_MEMBERS.
+const TS_ROSTER: Record<Weekday, Record<ShiftLabel, keyof typeof TS_MEMBERS>> = {
+  Mon: { "02-05": "Syed",  "05-08": "Ethan",  "08-11": "Mahedi", "11-14": "Abed",   "14-17": "Marcel", "17-20": "Dan",    "20-23": "Mahedi", "23-02": "Dan" },
+  Tue: { "02-05": "Syed",  "05-08": "Adrian", "08-11": "Mahedi", "11-14": "Dan",    "14-17": "Aldwin", "17-20": "Marcel", "20-23": "Mahedi", "23-02": "Shami" },
+  Wed: { "02-05": "Syed",  "05-08": "Ethan",  "08-11": "Mahedi", "11-14": "Dan",    "14-17": "Aldwin", "17-20": "Aldwin", "20-23": "Mahedi", "23-02": "Dan" },
+  Thu: { "02-05": "Shami", "05-08": "Ethan",  "08-11": "Mahedi", "11-14": "Dan",    "14-17": "Dan",    "17-20": "Aldwin", "20-23": "Aldwin", "23-02": "Dan" },
+  Fri: { "02-05": "Shami", "05-08": "Adrian", "08-11": "Syed",   "11-14": "Aldwin", "14-17": "Marcel", "17-20": "Aldwin", "20-23": "Aldwin", "23-02": "Shami" },
+  Sat: { "02-05": "Shami", "05-08": "Adrian", "08-11": "Aldwin", "11-14": "Abed",   "14-17": "Aldwin", "17-20": "Mahedi", "20-23": "Mahedi", "23-02": "Dan" },
+  Sun: { "02-05": "Shami", "05-08": "Adrian", "08-11": "Mahedi", "11-14": "Abed",   "14-17": "Abed",   "17-20": "Syed",   "20-23": "Aldwin", "23-02": "Dan" },
+};
+
+export { TS_MEMBERS, TS_ROSTER, type Weekday, type TsMember };
diff --git a/src/lib/anthropic.test.ts b/src/lib/anthropic.test.ts
index cc02077..0c4ddd1 100644
--- a/src/lib/anthropic.test.ts
+++ b/src/lib/anthropic.test.ts
@@ -11,6 +11,7 @@ import {
   buildAccessGrantedPrompt,
   parseAccessGrantedResponse,
   parseFollowupKindResponse,
+  parseFollowupTargetResponse,
   parseUrgencyResponse,
   parseAnswerableResponse,
   parseIssueTypeResponse,
@@ -109,6 +110,14 @@ test("parseFollowupKindResponse: tokens map correctly", () => {
   assert.equal(parseFollowupKindResponse("anything else"), "other");
 });
 
+test("parseFollowupTargetResponse: NEW_ISSUE => new_issue, else same_issue (default)", () => {
+  assert.equal(parseFollowupTargetResponse("NEW_ISSUE"), "new_issue");
+  assert.equal(parseFollowupTargetResponse("  new_issue  "), "new_issue");
+  assert.equal(parseFollowupTargetResponse("SAME_ISSUE"), "same_issue");
+  assert.equal(parseFollowupTargetResponse(""), "same_issue");
+  assert.equal(parseFollowupTargetResponse("anything else"), "same_issue");
+});
+
 test("parseUrgencyResponse: URGENT => true, else false", () => {
   assert.equal(parseUrgencyResponse("URGENT"), true);
   assert.equal(parseUrgencyResponse("NORMAL"), false);
diff --git a/src/lib/anthropic.ts b/src/lib/anthropic.ts
index 8d9b439..ac8bf60 100644
--- a/src/lib/anthropic.ts
+++ b/src/lib/anthropic.ts
@@ -321,6 +321,58 @@ async function classifyFollowupKind(
   return { ok: true, kind: parseFollowupKindResponse(result.text) };
 }
 
+/**************************************************************************
+ * FOLLOW-UP TARGET CLASSIFIER — is the customer following up on an issue that
+ * is ALREADY escalated (same_issue), or raising a NEW/different problem
+ * (new_issue)? Decides whether to reuse the old escalation note vs run intake.
+ ***************************************************************************/
+
+const FOLLOWUP_TARGET_SYSTEM_PROMPT =
+  `A customer is messaging on a conversation that already has one or more issues ` +
+  `escalated to the support/dev team. Those open issues are listed below. Decide ` +
+  `whether the customer's latest message is about an EXISTING listed issue or a ` +
+  `NEW, different one:\n` +
+  `- SAME_ISSUE: still about one of the listed issues — e.g. it is still broken, ` +
+  `was reported fixed but persists, or a status/answer on that same problem ` +
+  `(same symptom / page / feature).\n` +
+  `- NEW_ISSUE: a different problem from every listed issue (a different symptom, ` +
+  `page, or feature) that has not been escalated yet.\n\n` +
+  `If there are NO listed open issues, anything substantive is NEW_ISSUE.\n\n` +
+  `Base your decision MAINLY on the customer's LATEST message; judge by MEANING ` +
+  `and INTENT in ANY language — examples are illustrative ONLY. When unsure, ` +
+  `output SAME_ISSUE.\n\n` +
+  `Output ONLY one token: SAME_ISSUE or NEW_ISSUE.`;
+
+type FollowupTargetToken = "same_issue" | "new_issue";
+
+function buildFollowupTargetUserMessage(
+  customerMessages: string[],
+  openIssueDescriptions: string[]
+): string {
+  const issues = openIssueDescriptions.length === 0
+    ? "(none)"
+    : openIssueDescriptions.map((d, i) => `${i + 1}. ${JSON.stringify(d)}`).join("\n");
+  return `Open (already-escalated) issues:\n${issues}\n\n${buildCustomerMessagesBlock(customerMessages)}`;
+}
+
+function parseFollowupTargetResponse(rawText: string): FollowupTargetToken {
+  return rawText.trim().toUpperCase().startsWith("NEW_ISSUE") ? "new_issue" : "same_issue";
+}
+
+async function classifyFollowupTarget(
+  customerMessages: string[],
+  openIssueDescriptions: string[]
+): Promise<{ ok: boolean; target?: FollowupTargetToken; error?: string }> {
+  const result = await callClaude({
+    system: FOLLOWUP_TARGET_SYSTEM_PROMPT,
+    userMessage: buildFollowupTargetUserMessage(customerMessages, openIssueDescriptions),
+  });
+  if (!result.ok || !result.text) {
+    return { ok: false, error: result.error ?? "classifier returned no text" };
+  }
+  return { ok: true, target: parseFollowupTargetResponse(result.text) };
+}
+
 /**************************************************************************
  * URGENCY CLASSIFIER — is the customer URGENT/ANGRY or asking NORMALLY?
  ***************************************************************************/
@@ -663,6 +715,8 @@ export {
   type PublishConsent,
   classifyFollowupKind,
   parseFollowupKindResponse,
+  classifyFollowupTarget,
+  parseFollowupTargetResponse,
   classifyUrgency,
   parseUrgencyResponse,
   type FollowupKindToken,
diff --git a/src/lib/followup-handler.test.ts b/src/lib/followup-handler.test.ts
index 5ed55bf..5696a0c 100644
--- a/src/lib/followup-handler.test.ts
+++ b/src/lib/followup-handler.test.ts
@@ -3,6 +3,9 @@ import assert from "node:assert/strict";
 import {
   handleIssueFollowup,
   computeShiftChanged,
+  extractOpenIssueNames,
+  extractOldNoteBody,
+  buildRenoteDedupKey,
   NOTE_PREFIX_NEW_SHIFT,
   NOTE_PREFIX_DEV_RECHECK,
   type FollowupContext,
@@ -53,6 +56,55 @@ test("computeShiftChanged: not enough reference → false", () => {
   assert.equal(computeShiftChanged([], SELF), false);
 });
 
+test("buildRenoteDedupKey: same issue + same shift → same key (ignores prefix/case/trailing fields)", () => {
+  const a = buildRenoteDedupKey(`${NOTE_PREFIX_NEW_SHIFT}Issue: Syncing Not Working, editor: https://x`, "08-11");
+  const b = buildRenoteDedupKey("Issue: syncing not working, editor: https://y", "08-11");
+  assert.equal(a, b);
+});
+
+test("buildRenoteDedupKey: same issue, different shift → different key (a new shift may re-ping)", () => {
+  const a = buildRenoteDedupKey("Issue: syncing not working", "08-11");
+  const b = buildRenoteDedupKey("Issue: syncing not working", "11-14");
+  assert.notEqual(a, b);
+});
+
+function selfNote(tsMs: number, content: string): CrispMessage {
+  return { from: "operator", type: "note", content, timestamp: tsMs, user: { nickname: SELF } };
+}
+
+test("extractOpenIssueNames: reads plain 'Issue:' notes", () => {
+  const msgs = [selfNote(atGmt7(8), "Issue: cart not updating, editor: https://x")];
+  assert.deepEqual(extractOpenIssueNames(msgs, SELF), ["cart not updating"]);
+});
+
+test("extractOpenIssueNames: also reads [New shift…] / [Dev ticket…] prefixed notes", () => {
+  const msgs = [
+    selfNote(atGmt7(8), `${NOTE_PREFIX_NEW_SHIFT}Issue: syncing not working, editor: https://x`),
+    selfNote(atGmt7(9), `${NOTE_PREFIX_DEV_RECHECK}Issue: checkout broken, ticket: DEV-1`),
+  ];
+  assert.deepEqual(extractOpenIssueNames(msgs, SELF), ["syncing not working", "checkout broken"]);
+});
+
+test("extractOpenIssueNames: ignores other operators' notes", () => {
+  const msgs = [
+    { from: "operator", type: "note", content: "Issue: not ours", timestamp: atGmt7(8), user: { nickname: "Logan" } } as CrispMessage,
+  ];
+  assert.deepEqual(extractOpenIssueNames(msgs, SELF), []);
+});
+
+test("extractOldNoteBody: returns the latest escalation note body, stripping a follow-up prefix", () => {
+  const msgs = [
+    selfNote(atGmt7(8), "Issue: first thing, editor: https://a"),
+    selfNote(atGmt7(9), `${NOTE_PREFIX_NEW_SHIFT}Issue: latest thing, editor: https://b`),
+  ];
+  assert.equal(extractOldNoteBody(msgs, SELF), "Issue: latest thing, editor: https://b");
+});
+
+test("extractOldNoteBody: no escalation note → null", () => {
+  const msgs = [userMsg(atGmt7(8))];
+  assert.equal(extractOldNoteBody(msgs, SELF), null);
+});
+
 function makeDeps(
   partial: Omit<FollowupContext, "openIssues"> & { openIssues?: string[] }
 ) {
@@ -149,6 +201,66 @@ test("close_resolved: customer confirms ALL fixed → positive close, no ping",
   assert.equal(calls.relaySame.length + calls.noteForTeam.length, 0);
 });
 
+test("intake_new: new_issue + not_fixed → defer to intake, no posting", async () => {
+  const { deps, calls } = makeDeps({
+    isDev: true,
+    kind: "not_fixed",
+    urgent: false,
+    shiftChanged: false,
+    issueIdentity: "new_issue",
+  });
+  const out = await handleIssueFollowup("s", "a totally different problem", deps);
+  assert.equal(out.action, "intake_new");
+  assert.equal(out.next_step_for_user, "");
+  assert.equal(calls.relaySame.length + calls.noteForTeam.length, 0);
+});
+
+test("same_issue reuse: note_new_shift uses the OLD note body, not the raw summary", async () => {
+  const { deps, calls } = makeDeps({
+    isDev: false,
+    kind: "not_fixed",
+    urgent: false,
+    shiftChanged: true,
+    issueIdentity: "same_issue",
+    oldNoteBody: "Issue: PageFly editor not syncing to live, editor: https://x",
+  });
+  const out = await handleIssueFollowup("s", "freshly generated summary", deps);
+  assert.equal(out.action, "note_new_shift");
+  assert.equal(
+    calls.noteForTeam[0],
+    `${NOTE_PREFIX_NEW_SHIFT}Issue: PageFly editor not syncing to live, editor: https://x`
+  );
+});
+
+test("same_issue reuse: relay_same relays the OLD note body when present", async () => {
+  const { deps, calls } = makeDeps({
+    isDev: false,
+    kind: "not_fixed",
+    urgent: false,
+    shiftChanged: false,
+    oldNoteBody: "Issue: cart drawer not opening, editor: https://y",
+  });
+  const out = await handleIssueFollowup("s", "ignored summary", deps);
+  assert.equal(out.action, "relay_same");
+  assert.deepEqual(calls.relaySame, ["Issue: cart drawer not opening, editor: https://y"]);
+});
+
+test("same_issue reuse: renote_dev uses OLD dev note body", async () => {
+  const { deps, calls } = makeDeps({
+    isDev: true,
+    kind: "not_fixed",
+    urgent: false,
+    shiftChanged: false,
+    oldNoteBody: "Issue: checkout button broken, ticket: DEV-12",
+  });
+  const out = await handleIssueFollowup("s", "ignored", deps);
+  assert.equal(out.action, "renote_dev");
+  assert.equal(
+    calls.noteForTeam[0],
+    `${NOTE_PREFIX_DEV_RECHECK}Issue: checkout button broken, ticket: DEV-12`
+  );
+});
+
 test("defer: other kind → no action, empty next step", async () => {
   const { deps, calls } = makeDeps({ isDev: false, kind: "other", urgent: false, shiftChanged: false });
   const out = await handleIssueFollowup("s", "summary", deps);
diff --git a/src/lib/followup-handler.ts b/src/lib/followup-handler.ts
index aa6606a..de4bd36 100644
--- a/src/lib/followup-handler.ts
+++ b/src/lib/followup-handler.ts
@@ -11,16 +11,22 @@ import {
   decideFollowupAction,
   type FollowupAction,
   type FollowupKind,
+  type IssueIdentity,
 } from "@/lib/followup-routing.js";
 import {
   fetchConversationMessages,
   fetchConversationMeta,
   postCrispPrivateNote,
+  patchConversationData,
   type CrispCreds,
   type CrispMessage,
 } from "@/lib/crisp.js";
-import { classifyFollowupKind, classifyUrgency } from "@/lib/anthropic.js";
-import { sameShift } from "@/lib/shifts.js";
+import {
+  classifyFollowupKind,
+  classifyFollowupTarget,
+  classifyUrgency,
+} from "@/lib/anthropic.js";
+import { sameShift, shiftOf } from "@/lib/shifts.js";
 import { pickWaitMessage } from "@/lib/escalation-shared.js";
 import { relayAdditionalRequest, buildRelayDeps } from "@/lib/relay-additional-request.js";
 
@@ -30,6 +36,13 @@ interface FollowupContext {
   urgent: boolean;
   shiftChanged: boolean;
   openIssues: string[]; // names of escalated issues still being worked on
+  // Is the customer on the SAME escalated issue or a NEW one? Defaults to
+  // "same_issue" when omitted (back-compat).
+  issueIdentity?: IssueIdentity;
+  // Body of the matching OLD escalation note, reused verbatim for same-issue
+  // re-notes / relays so the current-shift TS has the details without the
+  // customer repeating them. null/absent → fall back to the request summary.
+  oldNoteBody?: string | null;
 }
 
 interface FollowupDeps {
@@ -83,8 +96,14 @@ async function handleIssueFollowup(
     kind: ctx.kind,
     urgent: ctx.urgent,
     shiftChanged: ctx.shiftChanged,
+    issueIdentity: ctx.issueIdentity,
   });
 
+  // Same-issue re-notes / relays reuse the OLD escalation note verbatim (so the
+  // current-shift TS has the details) and only fall back to the freshly generated
+  // summary when no matching old note was found.
+  const reuseBody = ctx.oldNoteBody ?? requestSummary;
+
   switch (action) {
     case "close_resolved":
       // Customer confirmed ALL issues are fixed → close positively, ping no one.
@@ -96,16 +115,21 @@ async function handleIssueFollowup(
     case "transfer":
       return { action, next_step_for_user: deps.transferLine() };
 
+    case "intake_new":
+      // A NEW/different issue → let Hugo's normal intake (escalate_* /
+      // submit_additional_request) gather the case-specific info and escalate it.
+      return { action, next_step_for_user: "" };
+
     case "relay_same":
-      await deps.relaySame(sessionId, requestSummary);
+      await deps.relaySame(sessionId, reuseBody);
       return { action, next_step_for_user: await deps.reassureMessage() };
 
     case "note_new_shift":
-      await deps.noteForTeam(sessionId, `${NOTE_PREFIX_NEW_SHIFT}${requestSummary}`);
+      await deps.noteForTeam(sessionId, `${NOTE_PREFIX_NEW_SHIFT}${reuseBody}`);
       return { action, next_step_for_user: await deps.reassureMessage() };
 
     case "renote_dev":
-      await deps.noteForTeam(sessionId, `${NOTE_PREFIX_DEV_RECHECK}${requestSummary}`);
+      await deps.noteForTeam(sessionId, `${NOTE_PREFIX_DEV_RECHECK}${reuseBody}`);
       return { action, next_step_for_user: await deps.reassureMessage() };
 
     case "defer":
@@ -157,15 +181,27 @@ function computeShiftChanged(messages: CrispMessage[], selfNickname: string): bo
   return !sameShift(customerTs, handleTs);
 }
 
+// Matches the "Issue: <desc>" line of an escalation note, tolerating an optional
+// leading follow-up prefix like "[New shift — …] " or "[Dev ticket — …] ".
+const ISSUE_LINE_RE = /^\s*(?:\[[^\]]*\]\s*)?Issue:\s*([^\n]+)/i;
+
+function isOwnNote(m: CrispMessage, selfNickname: string): boolean {
+  return (
+    m.from === "operator" &&
+    m.type === "note" &&
+    (m.user?.nickname ?? "") === selfNickname
+  );
+}
+
 // Names of escalated issues, read from OUR escalation notes ("Issue: <desc>, ...").
-// Used to name the in-progress issue(s) when acknowledging the customer.
+// Used to name the in-progress issue(s) when acknowledging the customer. Also
+// reads notes carrying a follow-up prefix (re-notes for a new shift / dev recheck).
 function extractOpenIssueNames(messages: CrispMessage[], selfNickname: string): string[] {
   const names: string[] = [];
   for (const m of messages) {
-    if (m.from !== "operator" || m.type !== "note") continue;
-    if ((m.user?.nickname ?? "") !== selfNickname) continue; // only our own escalation notes
+    if (!isOwnNote(m, selfNickname)) continue; // only our own escalation notes
     const content = typeof m.content === "string" ? m.content : "";
-    const match = content.match(/^\s*Issue:\s*([^\n]+)/i);
+    const match = content.match(ISSUE_LINE_RE);
     if (!match) continue;
     const desc = match[1].split(/,\s*(?:reference|editor|ticket)\s*:/i)[0].trim();
     if (desc) names.push(desc);
@@ -173,6 +209,42 @@ function extractOpenIssueNames(messages: CrispMessage[], selfNickname: string):
   return [...new Set(names)];
 }
 
+// Normalised issue description from a note body (drops follow-up prefix, the
+// trailing reference/editor/ticket fields, case and surrounding whitespace).
+function normalizeIssueText(noteBody: string): string {
+  const stripped = noteBody.replace(/^\s*\[[^\]]*\]\s*/, "");
+  const match = stripped.match(ISSUE_LINE_RE);
+  const desc = match ? match[1] : stripped;
+  return desc.split(/,\s*(?:reference|editor|ticket)\s*:/i)[0].trim().toLowerCase();
+}
+
+// Dedup key for a same-issue re-note: one note per (issue, shift). A genuinely
+// new follow-up in a LATER shift gets a different key, so the new shift's TS is
+// still pinged; rapid repeats within the same shift are suppressed.
+function buildRenoteDedupKey(noteBody: string, shiftLabel: string): string {
+  return `followup|${shiftLabel}|${normalizeIssueText(noteBody)}`;
+}
+
+// Body of the most recent escalation note WE posted, for verbatim reuse on a
+// same-issue re-note / relay. A leading follow-up prefix ("[New shift — …] ") is
+// stripped so re-notes do not stack prefixes. Returns null when none is found.
+function extractOldNoteBody(
+  messages: CrispMessage[],
+  selfNickname: string
+): string | null {
+  const sorted = [...messages]
+    .filter((m) => typeof m.timestamp === "number")
+    .sort((a, b) => (a.timestamp as number) - (b.timestamp as number));
+  for (let i = sorted.length - 1; i >= 0; i--) {
+    const m = sorted[i];
+    if (!isOwnNote(m, selfNickname)) continue;
+    const content = typeof m.content === "string" ? m.content : "";
+    const stripped = content.replace(/^\s*\[[^\]]*\]\s*/, "").trim();
+    if (ISSUE_LINE_RE.test(stripped)) return stripped;
+  }
+  return null;
+}
+
 function buildFollowupDeps(creds: CrispCreds, token: string): FollowupDeps {
   return {
     gatherContext: async (sessionId) => {
@@ -194,8 +266,15 @@ function buildFollowupDeps(creds: CrispCreds, token: string): FollowupDeps {
       const selfNickname = process.env.CRISP_NOTE_USER_NICKNAME ?? "";
       const shiftChanged = computeShiftChanged(messages, selfNickname);
       const openIssues = extractOpenIssueNames(messages, selfNickname);
+      const oldNoteBody = extractOldNoteBody(messages, selfNickname);
+
+      // Same issue vs a new/different one (read & understand the conversation
+      // against the open issues). Default same_issue on classifier failure.
+      const targetRes = await classifyFollowupTarget(customerTexts, openIssues);
+      const issueIdentity =
+        targetRes.ok && targetRes.target ? targetRes.target : "same_issue";
 
-      return { isDev, kind, urgent, shiftChanged, openIssues };
+      return { isDev, kind, urgent, shiftChanged, openIssues, issueIdentity, oldNoteBody };
     },
 
     // Neutral, transfer-safe wait message (avoids words that trip Crisp's
@@ -224,15 +303,54 @@ function buildFollowupDeps(creds: CrispCreds, token: string): FollowupDeps {
     },
 
     noteForTeam: async (sessionId, summary) => {
-      await postCrispPrivateNote(sessionId, summary, creds);
+      // Dedup same-issue re-notes: one note per (issue, shift). Best-effort — a
+      // failed meta read does NOT block the note (better one extra note than a
+      // dropped escalation).
+      const selfNickname = process.env.CRISP_NOTE_USER_NICKNAME ?? "";
+      const { messages } = await fetchConversationMessages(sessionId, creds);
+      const { customerTs } = lastCustomerAndHandleTs(messages, selfNickname);
+      const shiftLabel = customerTs ? shiftOf(customerTs) : "unknown";
+      const dedupKey = buildRenoteDedupKey(summary, shiftLabel);
+
+      const { meta } = await fetchConversationMeta(sessionId, creds);
+      const data = readFollowupData(meta);
+      const refs = readFollowupRefs(data);
+      if (refs.includes(dedupKey)) return; // already noted this issue this shift
+
+      const r = await postCrispPrivateNote(sessionId, summary, creds);
+      if (r.ok) {
+        await patchConversationData(sessionId, creds, {
+          ...data,
+          followup_note_refs: [...refs, dedupKey].join("\n"),
+        });
+      }
     },
   };
 }
 
+// Dedup state for follow-up re-notes lives in the conversation custom data
+// (meta.data.data.followup_note_refs), separate from the escalate flow's
+// escalated_refs so the two never clobber each other.
+function readFollowupData(
+  meta: { data?: { data?: unknown } } | undefined
+): Record<string, unknown> {
+  const d = meta?.data?.data;
+  return d && typeof d === "object" ? (d as Record<string, unknown>) : {};
+}
+
+function readFollowupRefs(data: Record<string, unknown>): string[] {
+  const v = data.followup_note_refs;
+  if (typeof v !== "string") return [];
+  return v.split("\n").map((s) => s.trim()).filter(Boolean);
+}
+
 export {
   handleIssueFollowup,
   buildFollowupDeps,
   computeShiftChanged,
+  extractOpenIssueNames,
+  extractOldNoteBody,
+  buildRenoteDedupKey,
   lastCustomerAndHandleTs,
   TRANSFER_LINE,
   NOTE_PREFIX_NEW_SHIFT,
diff --git a/src/lib/followup-routing.test.ts b/src/lib/followup-routing.test.ts
index 2fb16f7..a45cc46 100644
--- a/src/lib/followup-routing.test.ts
+++ b/src/lib/followup-routing.test.ts
@@ -69,3 +69,69 @@ test("other kind => defer to existing flows", () => {
     "defer"
   );
 });
+
+// --- issue identity: same_issue vs new_issue (2026-06-18 spec) ---
+
+test("new_issue + not_fixed (TS) => intake_new (ask info, escalate fresh)", () => {
+  assert.equal(
+    decideFollowupAction({
+      isDev: false,
+      kind: "not_fixed",
+      urgent: false,
+      shiftChanged: true,
+      issueIdentity: "new_issue",
+    }),
+    "intake_new"
+  );
+});
+
+test("new_issue + not_fixed (DEV) => intake_new (new issue triaged from scratch)", () => {
+  assert.equal(
+    decideFollowupAction({
+      isDev: true,
+      kind: "not_fixed",
+      urgent: false,
+      shiftChanged: false,
+      issueIdentity: "new_issue",
+    }),
+    "intake_new"
+  );
+});
+
+test("new_issue + other kind => intake_new (a brand-new problem to triage)", () => {
+  assert.equal(
+    decideFollowupAction({
+      isDev: false,
+      kind: "other",
+      urgent: false,
+      shiftChanged: false,
+      issueIdentity: "new_issue",
+    }),
+    "intake_new"
+  );
+});
+
+test("new_issue + progress => buy_time (status ping is about the existing issue)", () => {
+  assert.equal(
+    decideFollowupAction({
+      isDev: false,
+      kind: "progress",
+      urgent: false,
+      shiftChanged: false,
+      issueIdentity: "new_issue",
+    }),
+    "buy_time"
+  );
+});
+
+test("issueIdentity defaults to same_issue (back-compat) => existing routing", () => {
+  // Omitting issueIdentity must behave exactly as before this change.
+  assert.equal(
+    decideFollowupAction({ isDev: true, kind: "not_fixed", urgent: false, shiftChanged: false }),
+    "renote_dev"
+  );
+  assert.equal(
+    decideFollowupAction({ isDev: false, kind: "not_fixed", urgent: false, shiftChanged: true }),
+    "note_new_shift"
+  );
+});
diff --git a/src/lib/followup-routing.ts b/src/lib/followup-routing.ts
index 745bb4c..d8c29bb 100644
--- a/src/lib/followup-routing.ts
+++ b/src/lib/followup-routing.ts
@@ -19,25 +19,40 @@ type FollowupAction =
   | "relay_same" //     relay to the SAME TS still on shift (submit_additional_request)
   | "note_new_shift" // fresh note for the current shift's TS (TS ticket, shift changed)
   | "renote_dev" //     re-note a dev ticket with "fixed before, still broken" context
+  | "intake_new" //     a NEW/different issue — run intake (ask info) then escalate fresh
   | "ack_open" //       acknowledgement while an issue is open — thank + name open issue(s)
   | "close_resolved" // customer confirms ALL issues fixed — positive close, no ping
   | "defer"; //         not a progress/not-fixed follow-up — let existing flows handle it
 
+// Is the customer following up on an already-escalated issue, or raising a new one?
+type IssueIdentity = "same_issue" | "new_issue";
+
 interface DecideFollowupArgs {
   isDev: boolean; //       conversation carries the "dev" segment
   kind: FollowupKind;
   urgent: boolean;
   shiftChanged: boolean; // current message shift differs from the last-handle shift
+  // Defaults to "same_issue" (back-compat): follow-up on the existing issue.
+  issueIdentity?: IssueIdentity;
 }
 
 function decideFollowupAction(args: DecideFollowupArgs): FollowupAction {
   const { isDev, kind, urgent, shiftChanged } = args;
+  const issueIdentity: IssueIdentity = args.issueIdentity ?? "same_issue";
 
   // Customer confirms ALL reported issues are fixed → close positively, no ping.
   // (The classifier only returns "resolved" when nothing is left unresolved; a
   // partial "this works but that doesn't" comes back as not_fixed instead.)
   if (kind === "resolved") return "close_resolved";
 
+  // A NEW/different issue (not the one already escalated) is triaged from scratch:
+  // gather the case-specific required info, then escalate — regardless of whether
+  // the conversation is a DEV or TS ticket. A pure progress ping / acknowledgement
+  // is about the EXISTING issue, so it never counts as a new issue here.
+  if (issueIdentity === "new_issue" && (kind === "not_fixed" || kind === "other")) {
+    return "intake_new";
+  }
+
   // Acknowledgement is handled by the orchestrator (it needs the open-issue list);
   // and "other" is not a follow-up on an existing issue → existing rules.
   if (kind === "other" || kind === "acknowledgement") return "defer";
@@ -65,5 +80,6 @@ export {
   decideFollowupAction,
   type FollowupKind,
   type FollowupAction,
+  type IssueIdentity,
   type DecideFollowupArgs,
 };
diff --git a/src/lib/roster.test.ts b/src/lib/roster.test.ts
new file mode 100644
index 0000000..fccb151
--- /dev/null
+++ b/src/lib/roster.test.ts
@@ -0,0 +1,41 @@
+import { test } from "node:test";
+import assert from "node:assert/strict";
+import { tsForShift } from "./roster.ts";
+
+// epoch ms for a GMT+7 wall-clock moment on a 2026-06 date (UTC = GMT+7 - 7).
+// Anchors: 2026-06-15=Mon, 16=Tue, 17=Wed, 18=Thu, 19=Fri, 20=Sat, 21=Sun.
+function atGmt7(day: number, hour: number, min = 0): number {
+  return Date.UTC(2026, 5, day, hour - 7, min);
+}
+
+test("daytime shift maps to the right TS (Mon 08:30 → 08-11 → Mahedi)", () => {
+  const ts = tsForShift(atGmt7(15, 8, 30));
+  assert.equal(ts.name, "Mahedi");
+  assert.equal(ts.crispId, "f451cb33-ae68-4aad-831a-7570fc0d916a");
+});
+
+test("afternoon shift (Mon 14:30 → 14-17 → Marcel)", () => {
+  assert.equal(tsForShift(atGmt7(15, 14, 30)).name, "Marcel");
+});
+
+test("late-evening 23-02 uses the SAME calendar day (Tue 23:30 → Tue 23-02 → Shami)", () => {
+  assert.equal(tsForShift(atGmt7(16, 23, 30)).name, "Shami");
+});
+
+test("after-midnight 23-02 belongs to the PREVIOUS day (Wed 00:30 → Tue 23-02 → Shami)", () => {
+  // 00:30 on Wed (17th) is still the Tuesday night shift.
+  assert.equal(tsForShift(atGmt7(17, 0, 30)).name, "Shami");
+});
+
+test("01:59 still previous day's 23-02 (Wed 01:59 → Tue 23-02 → Shami)", () => {
+  assert.equal(tsForShift(atGmt7(17, 1, 59)).name, "Shami");
+});
+
+test("02:00 flips to the new day's 02-05 (Wed 02:00 → Wed 02-05 → Syed)", () => {
+  assert.equal(tsForShift(atGmt7(17, 2, 0)).name, "Syed");
+});
+
+test("after-midnight wraps across the week (Mon 01:30 → Sun 23-02 → Dan)", () => {
+  // 2026-06-15 is Monday; 01:30 belongs to Sunday (14th) night shift.
+  assert.equal(tsForShift(atGmt7(15, 1, 30)).name, "Dan");
+});
diff --git a/src/lib/roster.ts b/src/lib/roster.ts
new file mode 100644
index 0000000..fa6b4d8
--- /dev/null
+++ b/src/lib/roster.ts
@@ -0,0 +1,36 @@
+/**************************************************************************
+ * ROSTER LOOKUP — given a Crisp message timestamp, find which TS is on duty.
+ *
+ * Day boundary is 02:00 GMT+7 (NOT midnight): the 23-02 night shift runs from
+ * 23:00 to 02:00, so a moment in [00:00, 02:00) still belongs to the PREVIOUS
+ * calendar day's roster. From 02:00 (the 02-05 shift) it is the new day.
+ *
+ * See src/data/ts-roster.ts for the roster data.
+ ***************************************************************************/
+
+import { shiftOf, gmt7HourOfDay } from "@/lib/shifts.js";
+import { TS_MEMBERS, TS_ROSTER, type Weekday, type TsMember } from "@/data/ts-roster.js";
+
+const HOUR_MS = 3600000;
+const GMT7_OFFSET_HOURS = 7;
+
+// getUTCDay() index (0=Sun..6=Sat) → our Weekday key.
+const WEEKDAY_BY_INDEX: Weekday[] = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
+
+// The roster weekday for a timestamp: the GMT+7 calendar day, except moments in
+// [00:00, 02:00) roll back one day (still the previous night's 23-02 shift).
+function rosterWeekday(tsMs: number): Weekday {
+  let shifted = tsMs + GMT7_OFFSET_HOURS * HOUR_MS;
+  if (gmt7HourOfDay(tsMs) < 2) shifted -= 24 * HOUR_MS;
+  return WEEKDAY_BY_INDEX[new Date(shifted).getUTCDay()];
+}
+
+// The TS on duty at a given Crisp message timestamp (epoch ms, UTC).
+function tsForShift(tsMs: number): TsMember {
+  const weekday = rosterWeekday(tsMs);
+  const shift = shiftOf(tsMs);
+  const name = TS_ROSTER[weekday][shift];
+  return TS_MEMBERS[name];
+}
+
+export { tsForShift, rosterWeekday };
diff --git a/src/lib/store-access.test.ts b/src/lib/store-access.test.ts
index fc3b3dc..cb94edf 100644
--- a/src/lib/store-access.test.ts
+++ b/src/lib/store-access.test.ts
@@ -5,7 +5,8 @@ import {
   pickAccessPendingWaitMessage,
   ACCESS_PENDING_WAIT_VI,
   ACCESS_PENDING_WAIT_EN,
-  AT_LOGAN_NOTE_CONTENT,
+  buildAccessRequestNote,
+  buildAccessRequest,
   ENGLISH_ACCESS_INSTRUCTIONS,
   matchAccessAcknowledged,
   mustAskHomepage,
@@ -61,10 +62,21 @@ test("pickAccessPendingWaitMessage: empty / undefined => EN fallback default", a
   assert.equal(await pickAccessPendingWaitMessage(undefined), ACCESS_PENDING_WAIT_EN);
 });
 
-test("AT_LOGAN_NOTE_CONTENT mentions Logan and the standard permissions list", () => {
-  assert.match(AT_LOGAN_NOTE_CONTENT, /@Logan/);
-  assert.match(AT_LOGAN_NOTE_CONTENT, /Home, Products, Customers/);
-  assert.match(AT_LOGAN_NOTE_CONTENT, /Manage and install apps and channels/);
+test("buildAccessRequestNote mentions the on-duty TS by name + the permissions, NOT Logan", () => {
+  const note = buildAccessRequestNote("Syed", "https://myshop.com");
+  assert.match(note, /@Syed/);
+  assert.match(note, /Homepage: https:\/\/myshop\.com/);
+  assert.match(note, /Home, Products, Customers/);
+  assert.match(note, /Manage and install apps and channels/);
+  assert.doesNotMatch(note, /@Logan/);
+});
+
+test("buildAccessRequest tags the on-duty TS's crispId and stamps the marker", () => {
+  const ts = { name: "Dan", crispId: "4d04b661-55a9-4763-8d94-ccb1613b980f" };
+  const { content, mentions } = buildAccessRequest(ts, "https://shop.io");
+  assert.deepEqual(mentions, ["4d04b661-55a9-4763-8d94-ccb1613b980f"]);
+  assert.match(content, /@Dan/);
+  assert.match(content, /\[access-requested\]/);
 });
 
 test("ENGLISH_ACCESS_INSTRUCTIONS contains the screenshot link", () => {
diff --git a/src/lib/store-access.ts b/src/lib/store-access.ts
index 51d573c..2b32f0d 100644
--- a/src/lib/store-access.ts
+++ b/src/lib/store-access.ts
@@ -17,6 +17,8 @@ import {
   setStoreAccessMeta,
   type CrispCreds,
 } from "@/lib/crisp.js";
+import { tsForShift } from "@/lib/roster.js";
+import type { TsMember } from "@/data/ts-roster.js";
 
 /**************************************************************************
  * CONSTANTS — customer-facing wait messages (when access pending)
@@ -31,37 +33,40 @@ const ACCESS_PENDING_WAIT_EN =
 /**************************************************************************
  * CONSTANTS — TS-facing note when posting the access request
  *
- * Always English. The Crisp operator @Logan is mentioned via Crisp's
- * `mentions` API field (operator UUID) so the assignee receives an email
- * notification — the textual "@Logan" in content is for human readers.
+ * Always English. The on-duty TS (resolved from the shift roster by the
+ * message time) is mentioned via Crisp's `mentions` API field (operator UUID)
+ * so they receive a notification — the textual "@Name" in content is for human
+ * readers.
  ***************************************************************************/
 
-const LOGAN_OPERATOR_ID = "11c92319-89c1-42be-b4da-2bf5e40568c3";
-
-// Marker appended to the @Logan note so later calls know access was already
-// requested (so we do not re-post @Logan on every customer message).
+// Marker appended to the access-request note so later calls know access was
+// already requested (so we do not re-post on every customer message).
 const ACCESS_REQUEST_MARKER = "[access-requested]";
 
-const AT_LOGAN_REQUIRED_PERMISSIONS =
+const ACCESS_REQUIRED_PERMISSIONS =
   "Home, Products, Customers, Discounts, Content, Online Store, " +
   "App Development, Store settings, Manage and install apps and channels";
 
-function buildAtLoganNoteContent(homepageUrl: string): string {
+// Human-readable note body, addressed to the on-duty TS by name.
+function buildAccessRequestNote(tsName: string, homepageUrl: string): string {
   return (
-    "@Logan please request collaborator access to this store.\n" +
+    `@${tsName} please request collaborator access to this store.\n` +
     `Homepage: ${homepageUrl}\n` +
-    `Required permissions: ${AT_LOGAN_REQUIRED_PERMISSIONS}`
+    `Required permissions: ${ACCESS_REQUIRED_PERMISSIONS}`
   );
 }
 
-/**
- * @deprecated — kept for backward compat with existing tests/imports. Use
- * buildAtLoganNoteContent(homepageUrl) instead; this constant has no
- * homepage URL and is not used by the runtime gate.
- */
-const AT_LOGAN_NOTE_CONTENT =
-  "@Logan please request collaborator access to this store.\n" +
-  `Required permissions: ${AT_LOGAN_REQUIRED_PERMISSIONS}`;
+// Full note (with the dedup marker) + the operator id(s) to mention, for the
+// TS on duty at the moment the request is posted.
+function buildAccessRequest(
+  onDutyTs: TsMember,
+  homepageUrl: string
+): { content: string; mentions: string[] } {
+  return {
+    content: `${buildAccessRequestNote(onDutyTs.name, homepageUrl)}\n${ACCESS_REQUEST_MARKER}`,
+    mentions: [onDutyTs.crispId],
+  };
+}
 
 /**************************************************************************
  * CONSTANTS — customer-facing access instructions after TS grants access
@@ -121,7 +126,7 @@ async function pickAccessPendingWaitMessage(
  * ASK-HOMEPAGE MESSAGE PICKER
  *
  * Used when access is pending AND we don't yet have the customer's store
- * homepage URL. Asks the customer to share their homepage so the @Logan
+ * homepage URL. Asks the customer to share their homepage so the on-duty TS
  * note can name the exact store.
  ***************************************************************************/
 
@@ -235,7 +240,7 @@ async function requireStoreAccess(
     return { ready: true };
   }
 
-  // 1b) store_access empty. If we ALREADY posted the @Logan request, do not
+  // 1b) store_access empty. If we ALREADY posted the access request, do not
   // re-post it. Instead, check whether the customer has now confirmed they
   // accepted the access — if so, persist store_access and proceed.
   const msgs = await fetchConversationMessages(sessionId, creds);
@@ -264,7 +269,7 @@ async function requireStoreAccess(
       return { ready: true };
     }
 
-    // Not confirmed yet → re-send the wait message, do NOT re-post @Logan.
+    // Not confirmed yet → re-send the wait message, do NOT re-post the access request.
     return {
       ready: false,
       output: {
@@ -279,8 +284,8 @@ async function requireStoreAccess(
     };
   }
 
-  // 2) First time (no @Logan posted yet). Before posting the @Logan note, ensure we have
-  // the customer's homepage URL — Logan needs to know which store to send
+  // 2) First time (no access request posted yet). Before posting the access-request note, ensure we have
+  // the customer's homepage URL — the TS needs to know which store to send
   // the access request to. If not provided, ask the customer first.
   if (mustAskHomepage(customerHomepageUrl, homepageProvidedByCustomer)) {
     return {
@@ -295,9 +300,9 @@ async function requireStoreAccess(
     };
   }
 
-  // 3) Have homepage URL → post @Logan note (English, with mentions) and
-  // return access-pending wait message to the customer.
-  return requestAccessViaLogan(
+  // 3) Have homepage URL → post the access-request note (English, mentioning the
+  // TS on duty NOW) and return the access-pending wait message to the customer.
+  return requestAccessFromOnDutyTs(
     sessionId,
     creds,
     customerLastMessageText,
@@ -306,17 +311,17 @@ async function requireStoreAccess(
   );
 }
 
-async function requestAccessViaLogan(
+async function requestAccessFromOnDutyTs(
   sessionId: string,
   creds: CrispCreds,
   customerLastMessageText: string | undefined,
   customerHomepageUrl: string,
   metaError?: string
 ): Promise<AccessCheckResult> {
-  const noteContent = `${buildAtLoganNoteContent(customerHomepageUrl)}\n${ACCESS_REQUEST_MARKER}`;
-  const post = await postCrispPrivateNote(sessionId, noteContent, creds, [
-    LOGAN_OPERATOR_ID,
-  ]);
+  // Who is on shift right now (Vietnam time) → mention them, not a fixed person.
+  const onDutyTs = tsForShift(Date.now());
+  const { content, mentions } = buildAccessRequest(onDutyTs, customerHomepageUrl);
+  const post = await postCrispPrivateNote(sessionId, content, creds, mentions);
   const errors: string[] = [];
   if (metaError) errors.push(`meta: ${metaError}`);
   if (!post.ok && post.error) errors.push(`note: ${post.error}`);
@@ -343,11 +348,10 @@ export {
   ACCESS_PENDING_WAIT_EN,
   ASK_HOMEPAGE_VI,
   ASK_HOMEPAGE_EN,
-  AT_LOGAN_NOTE_CONTENT,
-  AT_LOGAN_REQUIRED_PERMISSIONS,
-  LOGAN_OPERATOR_ID,
+  ACCESS_REQUIRED_PERMISSIONS,
   ACCESS_REQUEST_MARKER,
-  buildAtLoganNoteContent,
+  buildAccessRequestNote,
+  buildAccessRequest,
   ENGLISH_ACCESS_INSTRUCTIONS,
   ACCESS_ACK_PREFIX,
   hasStoreAccess,
diff --git a/src/mcp/tools/escalate_animation_issue/main.ts b/src/mcp/tools/escalate_animation_issue/main.ts
index ca57b93..f9cdcd7 100644
--- a/src/mcp/tools/escalate_animation_issue/main.ts
+++ b/src/mcp/tools/escalate_animation_issue/main.ts
@@ -86,7 +86,7 @@ function registerEscalateAnimationIssueTool(server: McpServer): void {
         Animation requests require Shopify store access for the technical team to edit theme code or PageFly elements. When you call this tool, it automatically checks whether collaborator access has been granted.
 
         - If access exists → tool proceeds to escalate normally.
-        - If no access yet → tool posts a private @Logan note to request access, and returns a wait message in next_step_for_user (in the customer's language). Relay it verbatim. The system handles the access flow end-to-end; once the customer grants access, they will tell you. Then call this tool again with the same arguments.
+        - If no access yet → tool posts a private access-request note (mentioning the on-duty TS) and returns a wait message in next_step_for_user (in the customer's language). Relay it verbatim. The system handles the access flow end-to-end; once the customer grants access, they will tell you. Then call this tool again with the same arguments.
 
         You do NOT need to do anything manually about access.
 
diff --git a/src/mcp/tools/escalate_horizontal_scroll_issue/main.ts b/src/mcp/tools/escalate_horizontal_scroll_issue/main.ts
index ebb8090..9beabdd 100644
--- a/src/mcp/tools/escalate_horizontal_scroll_issue/main.ts
+++ b/src/mcp/tools/escalate_horizontal_scroll_issue/main.ts
@@ -82,7 +82,7 @@ function registerEscalateHorizontalScrollIssueTool(server: McpServer): void {
         STORE ACCESS — AUTOMATICALLY HANDLED
         ===========================================================
 
-        Tool automatically checks Shopify store access at call start. If access not granted → posts @Logan note + returns wait message in customer's language. Relay verbatim, then call again after the customer confirms access granted.
+        Tool automatically checks Shopify store access at call start. If access not granted → posts an access-request note (mentioning the on-duty TS) + returns wait message in customer's language. Relay verbatim, then call again after the customer confirms access granted.
 
         ===========================================================
         INPUTS
diff --git a/src/mcp/tools/escalate_page_broken_issue/main.ts b/src/mcp/tools/escalate_page_broken_issue/main.ts
index 2575e55..7829784 100644
--- a/src/mcp/tools/escalate_page_broken_issue/main.ts
+++ b/src/mcp/tools/escalate_page_broken_issue/main.ts
@@ -84,7 +84,7 @@ function registerEscalatePageBrokenIssueTool(server: McpServer): void {
         Page-broken issues require Shopify store access for the technical team to debug theme code and publish the fixed page. When you call this tool, it automatically checks whether collaborator access has been granted.
 
         - If access exists → tool proceeds to escalate normally.
-        - If no access yet → tool posts a private @Logan note to request access and returns a wait message in next_step_for_user (in the customer's language). Relay it verbatim. Once the customer grants access, they will tell you. Then call this tool again with the same arguments.
+        - If no access yet → tool posts a private access-request note (mentioning the on-duty TS) and returns a wait message in next_step_for_user (in the customer's language). Relay it verbatim. Once the customer grants access, they will tell you. Then call this tool again with the same arguments.
 
         You do NOT need to do anything manually about access.
 
diff --git a/src/mcp/tools/escalate_section_issue/main.ts b/src/mcp/tools/escalate_section_issue/main.ts
index 5f25f22..18d8fce 100644
--- a/src/mcp/tools/escalate_section_issue/main.ts
+++ b/src/mcp/tools/escalate_section_issue/main.ts
@@ -81,7 +81,7 @@ function registerEscalateSectionIssueTool(server: McpServer): void {
         STORE ACCESS — AUTOMATICALLY HANDLED
         ===========================================================
 
-        This tool automatically checks Shopify store access at the start of every call. If access is not granted, it posts an @Logan note internally and returns a wait message in next_step_for_user (in the customer's language). Relay verbatim. Once the customer grants access, they will tell you — call this tool again with the same arguments.
+        This tool automatically checks Shopify store access at the start of every call. If access is not granted, it posts an access-request note (mentioning the on-duty TS) internally and returns a wait message in next_step_for_user (in the customer's language). Relay verbatim. Once the customer grants access, they will tell you — call this tool again with the same arguments.
 
         You do NOT do anything manually about access.
 
diff --git a/src/mcp/tools/escalate_speed_page_issue/main.ts b/src/mcp/tools/escalate_speed_page_issue/main.ts
index 1f994bd..dd0d7b7 100644
--- a/src/mcp/tools/escalate_speed_page_issue/main.ts
+++ b/src/mcp/tools/escalate_speed_page_issue/main.ts
@@ -80,7 +80,7 @@ function registerEscalateSpeedPageIssueTool(server: McpServer): void {
         STORE ACCESS — AUTOMATICALLY HANDLED
         ===========================================================
 
-        Tool automatically checks Shopify store access at call start. If access not granted → posts @Logan note + returns wait message in customer's language. Relay verbatim, then call again after the customer confirms access granted.
+        Tool automatically checks Shopify store access at call start. If access not granted → posts an access-request note (mentioning the on-duty TS) + returns wait message in customer's language. Relay verbatim, then call again after the customer confirms access granted.
 
         ===========================================================
         INPUTS
diff --git a/src/mcp/tools/escalate_theme_override_issue/main.ts b/src/mcp/tools/escalate_theme_override_issue/main.ts
index 0f79c04..25d0c2f 100644
--- a/src/mcp/tools/escalate_theme_override_issue/main.ts
+++ b/src/mcp/tools/escalate_theme_override_issue/main.ts
@@ -80,7 +80,7 @@ function registerEscalateThemeOverrideIssueTool(server: McpServer): void {
         STORE ACCESS — AUTOMATICALLY HANDLED
         ===========================================================
 
-        Tool automatically checks Shopify store access at call start. If access not granted → posts @Logan note + returns wait message in customer's language. Relay verbatim, then call again after the customer confirms access granted.
+        Tool automatically checks Shopify store access at call start. If access not granted → posts an access-request note (mentioning the on-duty TS) + returns wait message in customer's language. Relay verbatim, then call again after the customer confirms access granted.
 
         ===========================================================
         INPUTS
diff --git a/src/mcp/tools/handle_issue_followup/main.ts b/src/mcp/tools/handle_issue_followup/main.ts
index 282069c..b4f0b76 100644
--- a/src/mcp/tools/handle_issue_followup/main.ts
+++ b/src/mcp/tools/handle_issue_followup/main.ts
@@ -42,11 +42,15 @@ function registerHandleIssueFollowupTool(server: McpServer): void {
         WHAT IT DOES (decided automatically from the conversation):
           • Reads whether this is a DEV ticket (the conversation has the "dev" segment) or a
             regular TS ticket, the customer's intent (progress vs not-fixed), how urgent/angry
-            they are, and whether the TS shift has changed since the issue was last handled.
+            they are, whether the TS shift has changed since the issue was last handled, and
+            whether the message is about the SAME escalated issue or a NEW/different one.
+          • For a SAME-issue not-fixed report it re-notes/relays using the OLD escalation
+            note's details (it does NOT re-ask the customer for info already captured).
           • Then it routes: buy-time reassurance, hand off to a human, relay to the TS still
-            on shift, post a fresh note for the current shift's TS, or — when the customer
-            confirms ALL issues are fixed — a positive close (pings no one) — and returns the
-            exact customer message in next_step_for_user.
+            on shift, post a fresh note for the current shift's TS, tell you to run intake for
+            a NEW/different issue, or — when the customer confirms ALL issues are fixed — a
+            positive close (pings no one) — and returns the exact customer message (or empty)
+            in next_step_for_user.
 
         BEFORE CALLING: do NOT call this for a bare acknowledgement ("ok", "thanks") or a
         vague "I need more help" — first ASK the customer what they need / what is still
@@ -56,6 +60,11 @@ function registerHandleIssueFollowupTool(server: McpServer): void {
 
         OUTPUT HANDLING:
           • Reply to the customer with next_step_for_user VERBATIM.
+          • If action === "intake_new" (next_step_for_user is EMPTY), the customer raised a
+            NEW/different issue (not the one already escalated) → run your normal new-issue
+            intake: ask the case-specific required info (editor link, publish consent, exit-
+            editor, etc.) then escalate via submit_additional_request / the matching escalate_*
+            tool. Do not relay anything for this turn.
           • If action === "defer" (next_step_for_user is EMPTY), this was NOT a progress/not-
             fixed follow-up — handle the message with your normal rules instead.
           • Do not post anything to the team yourself; the tool does it.
diff --git a/src/mcp/tools/handle_issue_followup/shapes.ts b/src/mcp/tools/handle_issue_followup/shapes.ts
index a13c13c..83d3ba0 100644
--- a/src/mcp/tools/handle_issue_followup/shapes.ts
+++ b/src/mcp/tools/handle_issue_followup/shapes.ts
@@ -37,13 +37,13 @@ const HANDLE_ISSUE_FOLLOWUP_OUTPUT_SHAPE = z.object({
   action: z
     .string()
     .describe(
-      "Internal routing outcome: 'buy_time', 'transfer', 'relay_same', 'note_new_shift', 'renote_dev', or 'defer'."
+      "Internal routing outcome: 'buy_time', 'transfer', 'relay_same', 'note_new_shift', 'renote_dev', 'intake_new', 'ack_open', 'close_resolved', or 'defer'."
     ),
 
   next_step_for_user: z
     .string()
     .describe(
-      "Exact message Hugo should say to the customer next — relay VERBATIM. EMPTY when action is 'defer' (this was not a progress/not-fixed follow-up → handle it with your normal rules)."
+      "Exact message Hugo should say to the customer next — relay VERBATIM. EMPTY when action is 'defer' (not a progress/not-fixed follow-up → handle with normal rules) or 'intake_new' (a NEW/different issue → run normal new-issue intake then escalate)."
     ),
 
   error: z.string().optional(),
```
