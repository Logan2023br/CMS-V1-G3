/**************************************************************************
 * FOLLOW-UP HANDLER — orchestrates the issue-follow-up routing: gather the
 * signals (dev segment, follow-up kind, urgency, shift change), pick the action
 * via the pure decision function, then execute it. Deps are injected so the
 * routing/execution is unit-tested without network or LLM calls.
 *
 * See docs/superpowers/specs/2026-06-11-issue-followup-routing-design.md
 ***************************************************************************/

import {
  decideFollowupAction,
  type FollowupAction,
  type FollowupKind,
  type IssueIdentity,
} from "@/lib/followup-routing.js";
import {
  fetchConversationMessages,
  fetchConversationMeta,
  postCrispPrivateNote,
  patchConversationData,
  type CrispCreds,
  type CrispMessage,
} from "@/lib/crisp.js";
import {
  classifyFollowupKind,
  classifyFollowupTarget,
  classifyUrgency,
} from "@/lib/anthropic.js";
import { sameShift, shiftOf } from "@/lib/shifts.js";
import { pickWaitMessage } from "@/lib/escalation-shared.js";
import { relayAdditionalRequest, buildRelayDeps } from "@/lib/relay-additional-request.js";

interface FollowupContext {
  isDev: boolean;
  kind: FollowupKind;
  urgent: boolean;
  shiftChanged: boolean;
  openIssues: string[]; // names of escalated issues still being worked on
  // Is the customer on the SAME escalated issue or a NEW one? Defaults to
  // "same_issue" when omitted (back-compat).
  issueIdentity?: IssueIdentity;
  // Body of the matching OLD escalation note, reused verbatim for same-issue
  // re-notes / relays so the current-shift TS has the details without the
  // customer repeating them. null/absent → fall back to the request summary.
  oldNoteBody?: string | null;
}

interface FollowupDeps {
  // Gather all four routing signals from the conversation.
  gatherContext: (sessionId: string) => Promise<FollowupContext>;
  // Customer-facing "still on it, please wait" message.
  buyTimeMessage: () => Promise<string>;
  // The exact line that makes Crisp hand off to a human.
  transferLine: () => string;
  // Relay to the SAME TS still on shift (tags them in the Slack thread).
  relaySame: (sessionId: string, summary: string) => Promise<void>;
  // Post a fresh escalation note for the current shift's TS (no stale tag).
  noteForTeam: (sessionId: string, summary: string) => Promise<void>;
  // Customer-facing "got it, the team will look at this" message.
  reassureMessage: () => Promise<string>;
  // Customer-facing "thanks, still working on <open issues>" reply.
  ackReply: (openIssues: string[]) => Promise<string>;
  // Customer-facing positive close once ALL issues are confirmed fixed.
  closeReply: () => Promise<string>;
}

interface FollowupResult {
  action: FollowupAction;
  next_step_for_user: string;
}

const NOTE_PREFIX_NEW_SHIFT =
  "[New shift — the TS who handled this is off-duty; for the current shift's TS] ";
const NOTE_PREFIX_DEV_RECHECK =
  "[Dev ticket — customer says it is still NOT fixed / needs a re-check on their side] ";

async function handleIssueFollowup(
  sessionId: string,
  requestSummary: string,
  deps: FollowupDeps
): Promise<FollowupResult> {
  const ctx = await deps.gatherContext(sessionId);

  // Acknowledgement ("ok/thanks") while an MCP issue is still open → the MCP owns
  // the reply (so Hugo does not generate its own closing / resolve prompt): thank
  // the customer + name the in-progress issue(s) + keep the conversation open.
  if (ctx.kind === "acknowledgement") {
    if (ctx.openIssues.length > 0) {
      return { action: "ack_open", next_step_for_user: await deps.ackReply(ctx.openIssues) };
    }
    return { action: "defer", next_step_for_user: "" };
  }

  const action = decideFollowupAction({
    isDev: ctx.isDev,
    kind: ctx.kind,
    urgent: ctx.urgent,
    shiftChanged: ctx.shiftChanged,
    issueIdentity: ctx.issueIdentity,
  });

  // Same-issue re-notes / relays reuse the OLD escalation note verbatim (so the
  // current-shift TS has the details) and only fall back to the freshly generated
  // summary when no matching old note was found.
  const reuseBody = ctx.oldNoteBody ?? requestSummary;

  switch (action) {
    case "close_resolved":
      // Customer confirmed ALL issues are fixed → close positively, ping no one.
      return { action, next_step_for_user: await deps.closeReply() };

    case "buy_time":
      return { action, next_step_for_user: await deps.buyTimeMessage() };

    case "transfer":
      return { action, next_step_for_user: deps.transferLine() };

    case "intake_new":
      // A NEW/different issue → let Hugo's normal intake (escalate_* /
      // submit_additional_request) gather the case-specific info and escalate it.
      return { action, next_step_for_user: "" };

    case "relay_same":
      await deps.relaySame(sessionId, reuseBody);
      return { action, next_step_for_user: await deps.reassureMessage() };

    case "note_new_shift":
      await deps.noteForTeam(sessionId, `${NOTE_PREFIX_NEW_SHIFT}${reuseBody}`);
      return { action, next_step_for_user: await deps.reassureMessage() };

    case "renote_dev":
      await deps.noteForTeam(sessionId, `${NOTE_PREFIX_DEV_RECHECK}${reuseBody}`);
      return { action, next_step_for_user: await deps.reassureMessage() };

    case "defer":
    default:
      // Not a progress/not-fixed follow-up — let Hugo's normal rules handle it.
      return { action: "defer", next_step_for_user: "" };
  }
}

/**************************************************************************
 * PRODUCTION DEPS — wire the orchestrator to real Crisp / Anthropic / Slack.
 ***************************************************************************/

const TRANSFER_LINE =
  "You have been transferred to our support team. Thank you for your patience.";

// Reference timestamps for the shift comparison:
//  - customerTs: the customer's CURRENT (latest) message.
//  - handleTs:   when the issue was LAST handled = the latest REAL TS note. We
//    exclude our own bot notes (escalation / "Slack:" / "[Hugo auto-replied]",
//    authored by selfNickname) which would otherwise be ~now and make every
//    follow-up look like the same shift. Fallback: the customer's PREVIOUS
//    message (so a customer returning after a gap still compares correctly).
function lastCustomerAndHandleTs(
  messages: CrispMessage[],
  selfNickname: string
): { customerTs: number; handleTs: number } {
  const sorted = [...messages]
    .filter((m) => typeof m.timestamp === "number")
    .sort((a, b) => (a.timestamp as number) - (b.timestamp as number));

  const userMsgs = sorted.filter((m) => m.from === "user" && m.type === "text");
  const customerTs = userMsgs.length ? (userMsgs[userMsgs.length - 1].timestamp as number) : 0;

  const tsNotes = sorted.filter(
    (m) => m.from === "operator" && m.type === "note" && (m.user?.nickname ?? "") !== selfNickname
  );
  let handleTs = tsNotes.length ? (tsNotes[tsNotes.length - 1].timestamp as number) : 0;
  if (!handleTs && userMsgs.length >= 2) {
    handleTs = userMsgs[userMsgs.length - 2].timestamp as number;
  }
  return { customerTs, handleTs };
}

// Deterministic: has the TS shift changed since the issue was last handled?
function computeShiftChanged(messages: CrispMessage[], selfNickname: string): boolean {
  const { customerTs, handleTs } = lastCustomerAndHandleTs(messages, selfNickname);
  if (!customerTs || !handleTs) return false;
  return !sameShift(customerTs, handleTs);
}

// Matches the "Issue: <desc>" line of an escalation note, tolerating an optional
// leading follow-up prefix like "[New shift — …] " or "[Dev ticket — …] ".
const ISSUE_LINE_RE = /^\s*(?:\[[^\]]*\]\s*)?Issue:\s*([^\n]+)/i;

function isOwnNote(m: CrispMessage, selfNickname: string): boolean {
  return (
    m.from === "operator" &&
    m.type === "note" &&
    (m.user?.nickname ?? "") === selfNickname
  );
}

// Names of escalated issues, read from OUR escalation notes ("Issue: <desc>, ...").
// Used to name the in-progress issue(s) when acknowledging the customer. Also
// reads notes carrying a follow-up prefix (re-notes for a new shift / dev recheck).
function extractOpenIssueNames(messages: CrispMessage[], selfNickname: string): string[] {
  const names: string[] = [];
  for (const m of messages) {
    if (!isOwnNote(m, selfNickname)) continue; // only our own escalation notes
    const content = typeof m.content === "string" ? m.content : "";
    const match = content.match(ISSUE_LINE_RE);
    if (!match) continue;
    const desc = match[1].split(/,\s*(?:reference|editor|ticket)\s*:/i)[0].trim();
    if (desc) names.push(desc);
  }
  return [...new Set(names)];
}

// Normalised issue description from a note body (drops follow-up prefix, the
// trailing reference/editor/ticket fields, case and surrounding whitespace).
function normalizeIssueText(noteBody: string): string {
  const stripped = noteBody.replace(/^\s*\[[^\]]*\]\s*/, "");
  const match = stripped.match(ISSUE_LINE_RE);
  const desc = match ? match[1] : stripped;
  return desc.split(/,\s*(?:reference|editor|ticket)\s*:/i)[0].trim().toLowerCase();
}

// Dedup key for a same-issue re-note: one note per (issue, shift). A genuinely
// new follow-up in a LATER shift gets a different key, so the new shift's TS is
// still pinged; rapid repeats within the same shift are suppressed.
function buildRenoteDedupKey(noteBody: string, shiftLabel: string): string {
  return `followup|${shiftLabel}|${normalizeIssueText(noteBody)}`;
}

// Body of the most recent escalation note WE posted, for verbatim reuse on a
// same-issue re-note / relay. A leading follow-up prefix ("[New shift — …] ") is
// stripped so re-notes do not stack prefixes. Returns null when none is found.
function extractOldNoteBody(
  messages: CrispMessage[],
  selfNickname: string
): string | null {
  const sorted = [...messages]
    .filter((m) => typeof m.timestamp === "number")
    .sort((a, b) => (a.timestamp as number) - (b.timestamp as number));
  for (let i = sorted.length - 1; i >= 0; i--) {
    const m = sorted[i];
    if (!isOwnNote(m, selfNickname)) continue;
    const content = typeof m.content === "string" ? m.content : "";
    const stripped = content.replace(/^\s*\[[^\]]*\]\s*/, "").trim();
    if (ISSUE_LINE_RE.test(stripped)) return stripped;
  }
  return null;
}

function buildFollowupDeps(creds: CrispCreds, token: string): FollowupDeps {
  return {
    gatherContext: async (sessionId) => {
      const { messages } = await fetchConversationMessages(sessionId, creds);
      const { meta } = await fetchConversationMeta(sessionId, creds);
      const segments = meta?.data?.segments;
      const isDev = Array.isArray(segments) && segments.includes("dev");

      const userMsgs = messages.filter(
        (m) => m.from === "user" && m.type === "text" && typeof m.content === "string"
      );
      const customerTexts = userMsgs.map((m) => m.content as string).slice(-5);

      const kindRes = await classifyFollowupKind(customerTexts);
      const kind: FollowupKind = kindRes.ok && kindRes.kind ? kindRes.kind : "other";
      const urgRes = await classifyUrgency(customerTexts);
      const urgent = urgRes.ok ? urgRes.urgent === true : false;

      const selfNickname = process.env.CRISP_NOTE_USER_NICKNAME ?? "";
      const shiftChanged = computeShiftChanged(messages, selfNickname);
      const openIssues = extractOpenIssueNames(messages, selfNickname);
      const oldNoteBody = extractOldNoteBody(messages, selfNickname);

      // Same issue vs a new/different one (read & understand the conversation
      // against the open issues). Default same_issue on classifier failure.
      const targetRes = await classifyFollowupTarget(customerTexts, openIssues);
      const issueIdentity =
        targetRes.ok && targetRes.target ? targetRes.target : "same_issue";

      return { isDev, kind, urgent, shiftChanged, openIssues, issueIdentity, oldNoteBody };
    },

    // Neutral, transfer-safe wait message (avoids words that trip Crisp's
    // transfer scenario). Shared with the escalate flow's wait message.
    buyTimeMessage: async () => pickWaitMessage(undefined),
    reassureMessage: async () => pickWaitMessage(undefined),

    // Acknowledgement reply that NAMES the open issue(s) and keeps the
    // conversation open — so Hugo relays this instead of generating a closing.
    ackReply: async (openIssues) => {
      const list = openIssues.slice(0, 3).join(" and ");
      const tail = openIssues.length > 1 ? "issues" : "issue";
      return `Thanks! 😊 We're still working on the ${list} ${tail} for you — I'll update you right here as soon as it's done.`;
    },

    // All issues confirmed fixed → warm close (translated to the customer's
    // language by Hugo when it relays). No ping, no relay.
    closeReply: async () =>
      "That's great to hear — everything's fixed now! 🎉 Glad it all worked out. " +
      "Feel free to reach out anytime if you need anything else. Have a great day! 😊",

    transferLine: () => TRANSFER_LINE,

    relaySame: async (sessionId, summary) => {
      await relayAdditionalRequest(sessionId, summary, buildRelayDeps(creds, token));
    },

    noteForTeam: async (sessionId, summary) => {
      // Dedup same-issue re-notes: one note per (issue, shift). Best-effort — a
      // failed meta read does NOT block the note (better one extra note than a
      // dropped escalation).
      const selfNickname = process.env.CRISP_NOTE_USER_NICKNAME ?? "";
      const { messages } = await fetchConversationMessages(sessionId, creds);
      const { customerTs } = lastCustomerAndHandleTs(messages, selfNickname);
      const shiftLabel = customerTs ? shiftOf(customerTs) : "unknown";
      const dedupKey = buildRenoteDedupKey(summary, shiftLabel);

      const { meta } = await fetchConversationMeta(sessionId, creds);
      const data = readFollowupData(meta);
      const refs = readFollowupRefs(data);
      if (refs.includes(dedupKey)) return; // already noted this issue this shift

      const r = await postCrispPrivateNote(sessionId, summary, creds);
      if (r.ok) {
        await patchConversationData(sessionId, creds, {
          ...data,
          followup_note_refs: [...refs, dedupKey].join("\n"),
        });
      }
    },
  };
}

// Dedup state for follow-up re-notes lives in the conversation custom data
// (meta.data.data.followup_note_refs), separate from the escalate flow's
// escalated_refs so the two never clobber each other.
function readFollowupData(
  meta: { data?: { data?: unknown } } | undefined
): Record<string, unknown> {
  const d = meta?.data?.data;
  return d && typeof d === "object" ? (d as Record<string, unknown>) : {};
}

function readFollowupRefs(data: Record<string, unknown>): string[] {
  const v = data.followup_note_refs;
  if (typeof v !== "string") return [];
  return v.split("\n").map((s) => s.trim()).filter(Boolean);
}

export {
  handleIssueFollowup,
  buildFollowupDeps,
  computeShiftChanged,
  extractOpenIssueNames,
  extractOldNoteBody,
  buildRenoteDedupKey,
  lastCustomerAndHandleTs,
  TRANSFER_LINE,
  NOTE_PREFIX_NEW_SHIFT,
  NOTE_PREFIX_DEV_RECHECK,
  type FollowupContext,
  type FollowupDeps,
  type FollowupResult,
};

