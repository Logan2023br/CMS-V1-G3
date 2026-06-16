# Hugo Note Auto-Reply Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Crisp webhook handler that listens for `Hugo:` private notes from TS, calls Claude Haiku 4.5 to interpret + translate, and auto-sends customer-facing reply under PageFly identity with audit note.

**Architecture:** Express receives webhook → verify HMAC → filter (note + `Hugo:` prefix + not-self) → respond 200 → async-orchestrate (fetch customer messages → Claude → POST text → POST audit note). Crisp REST helpers extracted into `src/lib/crisp.ts` shared between this feature and the existing `escalate_scroll_issue` tool.

**Tech Stack:** Express (existing), `@anthropic-ai/sdk` (new dep), Node `node:crypto` for HMAC, Node `node:test` runner (already configured).

**Spec:** `docs/superpowers/specs/2026-05-06-hugo-note-auto-reply-design.md`

---

## File structure

**New files:**
- `src/lib/crisp.ts` — Crisp REST + HMAC helpers (shared)
- `src/lib/crisp.test.ts` — HMAC verify + URL builder tests
- `src/lib/anthropic.ts` — Claude client + prompt builder + response parser
- `src/lib/anthropic.test.ts` — prompt builder + response parser tests
- `src/webhooks/crisp.ts` — webhook route handler (Express) + filter
- `src/webhooks/crisp.test.ts` — filter logic tests
- `src/webhooks/note-forwarder.ts` — async orchestrator (fetch → Claude → post)

**Modified files:**
- `src/server.ts` — register `/webhooks/crisp` route, configure raw body capture
- `src/mcp/tools/escalate_scroll_issue/handler.ts` — import shared helpers from `src/lib/crisp.ts`
- `package.json` — add `@anthropic-ai/sdk`
- `.env` — document new env vars (worktree only; `.env` is gitignored)

---

### Task 1: Install Anthropic SDK and document new env vars

**Files:**
- Modify: `package.json` (dependencies)
- Modify: `.env` (worktree-local; document new keys)

- [ ] **Step 1: Install Anthropic SDK**

```bash
npm install @anthropic-ai/sdk
```

- [ ] **Step 2: Verify dependency added**

Open `package.json`. The `dependencies` section must now include `"@anthropic-ai/sdk": "^X.Y.Z"` (latest stable as of install). Read the file to confirm.

- [ ] **Step 3: Add the new env keys to `.env`**

Append at the end of `.env` (worktree path: `/Users/bbuser/CMS-V1-G3/.worktrees/scroll-session-match/.env`):

```
# Crisp webhook signing secret (Settings → Plugins → Webhook on app.crisp.chat)
CRISP_WEBHOOK_SECRET=

# Anthropic API for Hugo: note → customer auto-reply
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-haiku-4-5
```

(Leave the secret values blank — the user fills them in before running. The default model `claude-haiku-4-5` is OK to commit.)

- [ ] **Step 4: Verify build still works**

Run: `npm run build`
Expected: clean build, no errors.

- [ ] **Step 5: Commit (only package.json + package-lock.json)**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): install @anthropic-ai/sdk for note forwarder

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

(Do NOT commit `.env` — it is gitignored.)

---

### Task 2: Scaffold `src/lib/crisp.ts` by moving existing helpers from handler.ts

**Files:**
- Create: `src/lib/crisp.ts`
- Modify: `src/mcp/tools/escalate_scroll_issue/handler.ts`

The goal: extract the Crisp-API code that the handler currently owns (`CrispCreds`, `readCrispCreds`, `buildAuthHeader`, `postCrispPrivateNote`, `fetchHugoConversations`, `NoteUser`, `readNoteUser`, `HUGO_INBOX_FILTER`, `FetchListResult`) into a shared module so the new webhook code can reuse them.

- [ ] **Step 1: Create `src/lib/crisp.ts` with the moved code**

Create file `src/lib/crisp.ts` with this exact content (this is the existing code copied verbatim from handler.ts, plus a `Crisp` namespace-style export):

```ts
/**************************************************************************
 * TYPES
 ***************************************************************************/

import { type ConversationLite } from "@/mcp/tools/escalate_scroll_issue/scoring.js";

interface CrispCreds {
  websiteId: string;
  identifier: string;
  key: string;
}

interface NoteUser {
  type: "website";
  nickname: string;
  avatar: string;
}

interface FetchListResult {
  conversations: ConversationLite[];
  error?: string;
}

const HUGO_INBOX_FILTER = "_internal:agent";

/**************************************************************************
 * CREDENTIAL READERS
 ***************************************************************************/

function readCrispCreds(): CrispCreds | null {
  const websiteId = process.env.CRISP_WEBSITE_ID;
  const identifier = process.env.CRISP_IDENTIFIER;
  const key = process.env.CRISP_KEY;
  if (!websiteId || !identifier || !key) return null;
  return { websiteId, identifier, key };
}

function readNoteUser(): NoteUser | null {
  const nickname = process.env.CRISP_NOTE_USER_NICKNAME;
  const avatar = process.env.CRISP_NOTE_USER_AVATAR;
  if (!nickname || !avatar) return null;
  return { type: "website", nickname, avatar };
}

function buildAuthHeader(creds: CrispCreds): string {
  return `Basic ${Buffer.from(`${creds.identifier}:${creds.key}`).toString("base64")}`;
}

/**************************************************************************
 * REST API CLIENTS
 ***************************************************************************/

async function postCrispPrivateNote(
  sessionId: string,
  content: string,
  creds: CrispCreds
): Promise<{ ok: boolean; error?: string }> {
  const url = `https://api.crisp.chat/v1/website/${creds.websiteId}/conversation/${sessionId}/message`;
  const noteUser = readNoteUser();

  const body: Record<string, unknown> = {
    type: "note",
    from: "operator",
    origin: "chat",
    content,
  };
  if (noteUser) body.user = noteUser;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": buildAuthHeader(creds),
        "X-Crisp-Tier": "plugin",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const responseBody = await response.text();
      return {
        ok: false,
        error: `Crisp API ${response.status}: ${responseBody.slice(0, 500)}`,
      };
    }

    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Network/exception: ${message}` };
  }
}

async function fetchHugoConversations(creds: CrispCreds): Promise<FetchListResult> {
  const url =
    `https://api.crisp.chat/v1/website/${creds.websiteId}/conversations/1` +
    `?filter_inbox_id=${encodeURIComponent(HUGO_INBOX_FILTER)}`;

  try {
    const response = await fetch(url, {
      headers: {
        "Authorization": buildAuthHeader(creds),
        "X-Crisp-Tier": "plugin",
      },
    });
    if (!response.ok) {
      const responseBody = await response.text();
      return {
        conversations: [],
        error: `Crisp list-conversations ${response.status}: ${responseBody.slice(0, 300)}`,
      };
    }
    const json = (await response.json()) as { data?: unknown };
    const items = Array.isArray(json.data) ? (json.data as ConversationLite[]) : [];
    return { conversations: items };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { conversations: [], error: `Network/exception: ${message}` };
  }
}

/**************************************************************************
 * EXPORTS
 ***************************************************************************/

export {
  readCrispCreds,
  readNoteUser,
  buildAuthHeader,
  postCrispPrivateNote,
  fetchHugoConversations,
  HUGO_INBOX_FILTER,
  type CrispCreds,
  type NoteUser,
  type FetchListResult,
};
```

- [ ] **Step 2: Replace handler.ts internals with imports from `src/lib/crisp.ts`**

In `src/mcp/tools/escalate_scroll_issue/handler.ts`, replace the existing `CRISP API CLIENT` section (the entire block from `interface CrispCreds {` down through the end of `fetchHugoConversations` function) with this single import added near the top of the file (just after the `import { findBestSession, ... } from "@/mcp/tools/escalate_scroll_issue/scoring.js";` line):

```ts
import {
  readCrispCreds,
  postCrispPrivateNote,
  fetchHugoConversations,
  type CrispCreds,
} from "@/lib/crisp.js";
```

Also DELETE the `interface NoteUser`, `function readNoteUser`, `interface FetchListResult`, `const HUGO_INBOX_FILTER`, `function buildAuthHeader` from handler.ts — these now live in `src/lib/crisp.ts` and the handler doesn't reference them directly.

The `CrispCreds` type IS still referenced (in `tryPostNote` signature implicitly via `creds`), so keep that import.

- [ ] **Step 3: Verify build succeeds**

Run: `npm run build`
Expected: clean build. No "unused" warnings, no missing imports.

- [ ] **Step 4: Verify tests still pass**

Run: `npm test`
Expected: all 25 existing tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/crisp.ts src/mcp/tools/escalate_scroll_issue/handler.ts
git commit -m "refactor(crisp): extract REST helpers into src/lib/crisp.ts

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Add HMAC signature verification to `src/lib/crisp.ts` (TDD)

**Files:**
- Modify: `src/lib/crisp.ts` (add `verifyHmacSignature`)
- Create: `src/lib/crisp.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/crisp.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { verifyHmacSignature } from "./crisp.ts";

const SECRET = "test-secret-abc";

function sign(rawBody: string): string {
  return crypto.createHmac("sha256", SECRET).update(rawBody).digest("hex");
}

test("verifyHmacSignature: accepts a correctly-signed body", () => {
  const body = '{"event":"message:send","website_id":"abc"}';
  const signature = sign(body);
  assert.equal(verifyHmacSignature(body, signature, SECRET), true);
});

test("verifyHmacSignature: rejects an incorrect signature", () => {
  const body = '{"event":"message:send"}';
  assert.equal(verifyHmacSignature(body, "deadbeef".repeat(8), SECRET), false);
});

test("verifyHmacSignature: rejects when signature header missing", () => {
  const body = "{}";
  assert.equal(verifyHmacSignature(body, undefined, SECRET), false);
  assert.equal(verifyHmacSignature(body, "", SECRET), false);
});

test("verifyHmacSignature: rejects when secret missing", () => {
  const body = "{}";
  const sig = sign(body);
  assert.equal(verifyHmacSignature(body, sig, ""), false);
  assert.equal(verifyHmacSignature(body, sig, undefined), false);
});

test("verifyHmacSignature: uses constant-time compare (different lengths don't crash)", () => {
  const body = "{}";
  // Should not throw; should return false.
  assert.equal(verifyHmacSignature(body, "short", SECRET), false);
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npm test`
Expected: 5 new tests fail (function not yet exported from crisp.ts).

- [ ] **Step 3: Implement `verifyHmacSignature` in `src/lib/crisp.ts`**

Add at the top of `src/lib/crisp.ts`, just after the existing `import { type ConversationLite } ...` line:

```ts
import crypto from "node:crypto";
```

Then add this function (place it near the other helpers, e.g. just after `buildAuthHeader`):

```ts
function verifyHmacSignature(
  rawBody: string,
  signature: string | undefined,
  secret: string | undefined
): boolean {
  if (!signature || !secret) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  // crypto.timingSafeEqual requires equal-length buffers; bail out if lengths differ.
  const expectedBuf = Buffer.from(expected, "hex");
  let receivedBuf: Buffer;
  try {
    receivedBuf = Buffer.from(signature, "hex");
  } catch {
    return false;
  }
  if (expectedBuf.length !== receivedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, receivedBuf);
}
```

Add `verifyHmacSignature` to the exports block at the bottom of the file.

- [ ] **Step 4: Run tests, verify all pass**

Run: `npm test`
Expected: 30 tests pass (25 existing + 5 new).

- [ ] **Step 5: Commit**

```bash
git add src/lib/crisp.ts src/lib/crisp.test.ts
git commit -m "feat(crisp): add HMAC-SHA256 webhook signature verifier

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Add `fetchConversationMessages` to `src/lib/crisp.ts`

**Files:**
- Modify: `src/lib/crisp.ts`

This helper is used by the note forwarder to read the customer's last few messages so Claude can detect their language.

- [ ] **Step 1: Add the function to `src/lib/crisp.ts`**

Insert this function just after `fetchHugoConversations`:

```ts
interface CrispMessage {
  type?: string;
  from?: string;
  content?: unknown;
  fingerprint?: number;
  timestamp?: number;
  user?: { nickname?: string };
}

interface FetchMessagesResult {
  messages: CrispMessage[];
  error?: string;
}

async function fetchConversationMessages(
  sessionId: string,
  creds: CrispCreds
): Promise<FetchMessagesResult> {
  const url = `https://api.crisp.chat/v1/website/${creds.websiteId}/conversation/${sessionId}/messages`;
  try {
    const response = await fetch(url, {
      headers: {
        "Authorization": buildAuthHeader(creds),
        "X-Crisp-Tier": "plugin",
      },
    });
    if (!response.ok) {
      const responseBody = await response.text();
      return {
        messages: [],
        error: `Crisp messages ${response.status}: ${responseBody.slice(0, 300)}`,
      };
    }
    const json = (await response.json()) as { data?: unknown };
    const items = Array.isArray(json.data) ? (json.data as CrispMessage[]) : [];
    return { messages: items };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { messages: [], error: `Network/exception: ${message}` };
  }
}
```

Add `fetchConversationMessages` and `type CrispMessage`, `type FetchMessagesResult` to the exports block.

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: clean build.

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: 30 tests pass (no new tests for this function — pure passthrough wrapper around `fetch`, hard to unit-test without mocking).

- [ ] **Step 4: Commit**

```bash
git add src/lib/crisp.ts
git commit -m "feat(crisp): add fetchConversationMessages for note-forwarder

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Add `postCrispText` to `src/lib/crisp.ts`

**Files:**
- Modify: `src/lib/crisp.ts`

This helper sends a customer-facing message (`type=text`). Mirrors `postCrispPrivateNote` but with `type: "text"`.

- [ ] **Step 1: Add the function to `src/lib/crisp.ts`**

Insert just after `postCrispPrivateNote`:

```ts
async function postCrispText(
  sessionId: string,
  content: string,
  creds: CrispCreds
): Promise<{ ok: boolean; error?: string }> {
  const url = `https://api.crisp.chat/v1/website/${creds.websiteId}/conversation/${sessionId}/message`;
  const noteUser = readNoteUser();

  const body: Record<string, unknown> = {
    type: "text",
    from: "operator",
    origin: "chat",
    content,
  };
  if (noteUser) body.user = noteUser;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": buildAuthHeader(creds),
        "X-Crisp-Tier": "plugin",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const responseBody = await response.text();
      return {
        ok: false,
        error: `Crisp API ${response.status}: ${responseBody.slice(0, 500)}`,
      };
    }

    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Network/exception: ${message}` };
  }
}
```

Add `postCrispText` to exports.

- [ ] **Step 2: Verify build + tests**

Run: `npm run build && npm test`
Expected: clean build, 30 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/lib/crisp.ts
git commit -m "feat(crisp): add postCrispText for customer-facing replies

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Add Claude prompt builder + response parser (TDD)

**Files:**
- Create: `src/lib/anthropic.ts`
- Create: `src/lib/anthropic.test.ts`

- [ ] **Step 1: Create `src/lib/anthropic.ts` skeleton with types and pure functions**

```ts
/**************************************************************************
 * TYPES
 ***************************************************************************/

interface CustomerMessage {
  text: string;
}

interface BuildPromptInputs {
  noteContentWithoutPrefix: string;
  customerMessages: CustomerMessage[];
}

interface BuildPromptOutput {
  system: string;
  userMessage: string;
}

const SYSTEM_PROMPT =
  `You are an assistant that translates and rephrases internal support notes into customer-facing messages.\n\n` +
  `The technical support team writes a note in Vietnamese starting with "Hugo:". Your job:\n` +
  `1. Detect the customer's language from their recent messages (provided).\n` +
  `2. Rewrite the note's intent as a friendly, natural customer-facing message in THAT language.\n` +
  `3. Preserve all URLs, image links, and video links exactly as written (do NOT translate or shorten URLs).\n` +
  `4. Use a warm, polite tone matching PageFly support style.\n` +
  `5. Output ONLY the customer-facing message text — no preamble, no "here's the translation:", no markdown.\n\n` +
  `If the note is unclear or contains no actionable content, output the single token: NO_REPLY`;

/**************************************************************************
 * PROMPT BUILDER
 ***************************************************************************/

function buildPrompt(inputs: BuildPromptInputs): BuildPromptOutput {
  const lines: string[] = [];
  if (inputs.customerMessages.length === 0) {
    lines.push(
      "Customer's recent messages: (none — default to English if note language is ambiguous)"
    );
  } else {
    lines.push("Customer's recent messages (most recent last):");
    inputs.customerMessages.forEach((m, i) => {
      lines.push(`${i + 1}. ${JSON.stringify(m.text)}`);
    });
  }
  lines.push("");
  lines.push("TS note (translate intent + preserve URLs):");
  lines.push(JSON.stringify(inputs.noteContentWithoutPrefix));

  return {
    system: SYSTEM_PROMPT,
    userMessage: lines.join("\n"),
  };
}

/**************************************************************************
 * RESPONSE PARSER
 ***************************************************************************/

function parseClaudeResponse(rawText: string): { kind: "reply"; text: string } | { kind: "skip" } {
  const trimmed = rawText.trim();
  if (trimmed === "NO_REPLY" || trimmed === "") {
    return { kind: "skip" };
  }
  return { kind: "reply", text: trimmed };
}

/**************************************************************************
 * NOTE PREFIX UTIL
 ***************************************************************************/

const NOTE_TRIGGER_PREFIX = "hugo:";

function stripHugoPrefix(content: string): string {
  // Removes a leading "Hugo:" (case-insensitive) plus surrounding whitespace.
  const trimmed = content.trim();
  if (trimmed.toLowerCase().startsWith(NOTE_TRIGGER_PREFIX)) {
    return trimmed.slice(NOTE_TRIGGER_PREFIX.length).trim();
  }
  return trimmed;
}

function hasHugoPrefix(content: string | undefined): boolean {
  if (!content) return false;
  return content.trim().toLowerCase().startsWith(NOTE_TRIGGER_PREFIX);
}

/**************************************************************************
 * EXPORTS
 ***************************************************************************/

export {
  buildPrompt,
  parseClaudeResponse,
  stripHugoPrefix,
  hasHugoPrefix,
  NOTE_TRIGGER_PREFIX,
  SYSTEM_PROMPT,
  type CustomerMessage,
  type BuildPromptInputs,
  type BuildPromptOutput,
};
```

- [ ] **Step 2: Create `src/lib/anthropic.test.ts`**

```ts
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
```

- [ ] **Step 3: Run tests, verify all pass**

Run: `npm test`
Expected: 40 tests pass (30 existing + 10 new). The pure functions in `anthropic.ts` are already implemented so tests should pass on first run.

- [ ] **Step 4: Commit**

```bash
git add src/lib/anthropic.ts src/lib/anthropic.test.ts
git commit -m "feat(notes): add Claude prompt builder and response parser

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Add Claude API client wrapper to `src/lib/anthropic.ts`

**Files:**
- Modify: `src/lib/anthropic.ts`

This is a thin wrapper around the Anthropic SDK. It's hard to unit test directly (needs mocking), so we test via integration in Task 9.

- [ ] **Step 1: Add Anthropic client function**

Add this near the top of `src/lib/anthropic.ts`, just after the existing imports / before `TYPES`:

```ts
import Anthropic from "@anthropic-ai/sdk";
```

Then add this function near the bottom of the file (just before the EXPORTS block):

```ts
/**************************************************************************
 * CLAUDE CLIENT
 ***************************************************************************/

interface CallClaudeResult {
  ok: boolean;
  text?: string;
  error?: string;
}

async function callClaude(
  prompt: BuildPromptOutput
): Promise<CallClaudeResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "ANTHROPIC_API_KEY not configured." };
  }
  const model = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5";

  const client = new Anthropic({ apiKey });
  try {
    const response = await client.messages.create({
      model,
      max_tokens: 600,
      temperature: 0.3,
      system: prompt.system,
      messages: [{ role: "user", content: prompt.userMessage }],
    });
    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return { ok: false, error: "Claude response had no text block." };
    }
    return { ok: true, text: textBlock.text };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Anthropic SDK error: ${message}` };
  }
}
```

Add `callClaude` to the EXPORTS block.

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: clean build (Anthropic SDK types resolve correctly).

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: 40 tests pass (no new test — `callClaude` makes a real network call).

- [ ] **Step 4: Commit**

```bash
git add src/lib/anthropic.ts
git commit -m "feat(notes): add callClaude wrapper around @anthropic-ai/sdk

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Implement note forwarder orchestrator (`src/webhooks/note-forwarder.ts`)

**Files:**
- Create: `src/webhooks/note-forwarder.ts`

This is the orchestrator: given a session_id and raw note content, do the full sequence (fetch customer messages → call Claude → post text or skip → post audit note).

- [ ] **Step 1: Create the file**

```ts
/**************************************************************************
 * IMPORTS
 ***************************************************************************/

import {
  readCrispCreds,
  postCrispPrivateNote,
  postCrispText,
  fetchConversationMessages,
} from "@/lib/crisp.js";
import {
  buildPrompt,
  callClaude,
  parseClaudeResponse,
  stripHugoPrefix,
  type CustomerMessage,
} from "@/lib/anthropic.js";

/**************************************************************************
 * EXTRACT CUSTOMER MESSAGES
 ***************************************************************************/

const MAX_CUSTOMER_MESSAGES = 5;

interface CrispLikeMessage {
  type?: string;
  from?: string;
  content?: unknown;
}

function extractCustomerTexts(messages: CrispLikeMessage[]): CustomerMessage[] {
  const out: CustomerMessage[] = [];
  // Crisp returns oldest first; we want most-recent last (after slicing).
  for (const m of messages) {
    if (m.from !== "user") continue;
    if (m.type !== "text") continue;
    if (typeof m.content !== "string") continue;
    const text = m.content.trim();
    if (!text) continue;
    out.push({ text });
  }
  return out.slice(-MAX_CUSTOMER_MESSAGES);
}

/**************************************************************************
 * ORCHESTRATOR
 ***************************************************************************/

interface ForwardArgs {
  sessionId: string;
  noteContent: string;
}

async function forwardNoteToCustomer(args: ForwardArgs): Promise<void> {
  const { sessionId, noteContent } = args;
  const creds = readCrispCreds();
  if (!creds) {
    console.error(
      `[note-forwarder] session=${sessionId}: missing Crisp creds; cannot post anything.`
    );
    return;
  }

  // 1) Fetch last messages so Claude can detect language.
  const fetched = await fetchConversationMessages(sessionId, creds);
  if (fetched.error) {
    await postCrispPrivateNote(
      sessionId,
      `[Hugo failed: cannot fetch customer messages] ${fetched.error}`,
      creds
    );
    console.error(
      `[note-forwarder] session=${sessionId}: fetchConversationMessages failed: ${fetched.error}`
    );
    return;
  }
  const customerMessages = extractCustomerTexts(fetched.messages);

  // 2) Build prompt and call Claude.
  const prompt = buildPrompt({
    noteContentWithoutPrefix: stripHugoPrefix(noteContent),
    customerMessages,
  });
  const claudeResult = await callClaude(prompt);
  if (!claudeResult.ok || !claudeResult.text) {
    await postCrispPrivateNote(
      sessionId,
      `[Hugo failed to auto-reply]: ${claudeResult.error ?? "unknown error"}`,
      creds
    );
    console.error(
      `[note-forwarder] session=${sessionId}: Claude failed: ${claudeResult.error}`
    );
    return;
  }

  const parsed = parseClaudeResponse(claudeResult.text);
  if (parsed.kind === "skip") {
    await postCrispPrivateNote(
      sessionId,
      `[Hugo skipped: note not actionable]: ${noteContent}`,
      creds
    );
    console.log(`[note-forwarder] session=${sessionId}: NO_REPLY, skipped.`);
    return;
  }

  // 3) Post customer-facing text.
  const sendResult = await postCrispText(sessionId, parsed.text, creds);
  if (!sendResult.ok) {
    await postCrispPrivateNote(
      sessionId,
      `[Hugo failed to send to customer]: ${sendResult.error}`,
      creds
    );
    console.error(
      `[note-forwarder] session=${sessionId}: postCrispText failed: ${sendResult.error}`
    );
    return;
  }

  // 4) Post audit note.
  await postCrispPrivateNote(
    sessionId,
    `[Hugo auto-replied]: ${parsed.text}`,
    creds
  );
  console.log(
    `[note-forwarder] session=${sessionId}: replied (${parsed.text.length} chars)`
  );
}

/**************************************************************************
 * EXPORTS
 ***************************************************************************/

export { forwardNoteToCustomer, extractCustomerTexts };
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: clean build. All imports resolve.

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: 40 tests pass (no new tests yet — covered in Task 9).

- [ ] **Step 4: Commit**

```bash
git add src/webhooks/note-forwarder.ts
git commit -m "feat(notes): add forwardNoteToCustomer orchestrator

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Test `extractCustomerTexts` (TDD)

**Files:**
- Create: `src/webhooks/note-forwarder.test.ts`

The orchestrator itself uses real network calls so we test only the pure helper.

- [ ] **Step 1: Create test file**

```ts
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
```

- [ ] **Step 2: Run tests**

Run: `npm test`
Expected: 44 tests pass (40 existing + 4 new).

- [ ] **Step 3: Commit**

```bash
git add src/webhooks/note-forwarder.test.ts
git commit -m "test(notes): cover extractCustomerTexts filter logic

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Implement webhook filter + Express route (`src/webhooks/crisp.ts`)

**Files:**
- Create: `src/webhooks/crisp.ts`
- Create: `src/webhooks/crisp.test.ts`

- [ ] **Step 1: Write filter tests first**

Create `src/webhooks/crisp.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldForward } from "./crisp.ts";

const DEFAULTS = { selfNickname: "PageFly" };

test("shouldForward: pass on valid Hugo: note from non-self operator", () => {
  assert.equal(
    shouldForward(
      {
        event: "message:send",
        data: {
          type: "note",
          from: "operator",
          content: "Hugo: vui lòng hỏi vấn đề bị từ khi nào",
          user: { nickname: "Logan TS" },
        },
      },
      DEFAULTS
    ),
    true
  );
});

test("shouldForward: reject when event is not message:send", () => {
  assert.equal(
    shouldForward(
      {
        event: "message:received",
        data: {
          type: "note",
          from: "operator",
          content: "Hugo: x",
          user: { nickname: "Logan TS" },
        },
      },
      DEFAULTS
    ),
    false
  );
});

test("shouldForward: reject when type is not note", () => {
  assert.equal(
    shouldForward(
      {
        event: "message:send",
        data: {
          type: "text",
          from: "operator",
          content: "Hugo: x",
          user: { nickname: "Logan TS" },
        },
      },
      DEFAULTS
    ),
    false
  );
});

test("shouldForward: reject when from is user (customer)", () => {
  assert.equal(
    shouldForward(
      {
        event: "message:send",
        data: {
          type: "note",
          from: "user",
          content: "Hugo: x",
          user: { nickname: "Visitor" },
        },
      },
      DEFAULTS
    ),
    false
  );
});

test("shouldForward: reject when posted by self (loop prevention)", () => {
  assert.equal(
    shouldForward(
      {
        event: "message:send",
        data: {
          type: "note",
          from: "operator",
          content: "Hugo: should not loop",
          user: { nickname: "PageFly" },
        },
      },
      DEFAULTS
    ),
    false
  );
});

test("shouldForward: reject when content lacks Hugo: prefix", () => {
  assert.equal(
    shouldForward(
      {
        event: "message:send",
        data: {
          type: "note",
          from: "operator",
          content: "[Hugo auto-replied]: hello",
          user: { nickname: "PageFly" },
        },
      },
      DEFAULTS
    ),
    false
  );
});

test("shouldForward: reject when content missing", () => {
  assert.equal(
    shouldForward(
      {
        event: "message:send",
        data: {
          type: "note",
          from: "operator",
          user: { nickname: "Logan TS" },
        },
      },
      DEFAULTS
    ),
    false
  );
});

test("shouldForward: reject when self nickname empty (cannot apply loop guard)", () => {
  // If selfNickname is empty, treat as misconfig and refuse to forward.
  assert.equal(
    shouldForward(
      {
        event: "message:send",
        data: {
          type: "note",
          from: "operator",
          content: "Hugo: x",
          user: { nickname: "Logan TS" },
        },
      },
      { selfNickname: "" }
    ),
    false
  );
});
```

- [ ] **Step 2: Run tests, verify they fail (function not yet exported)**

Run: `npm test`
Expected: 8 new tests fail with "shouldForward not defined" or similar.

- [ ] **Step 3: Implement `src/webhooks/crisp.ts`**

```ts
/**************************************************************************
 * IMPORTS
 ***************************************************************************/

import type { Request, Response } from "express";
import { verifyHmacSignature } from "@/lib/crisp.js";
import { hasHugoPrefix } from "@/lib/anthropic.js";
import { forwardNoteToCustomer } from "@/webhooks/note-forwarder.js";

/**************************************************************************
 * TYPES
 ***************************************************************************/

interface CrispWebhookEvent {
  event?: string;
  website_id?: string;
  session_id?: string;
  data?: {
    type?: string;
    from?: string;
    content?: string;
    user?: { nickname?: string };
  };
}

interface FilterOpts {
  selfNickname: string;
}

/**************************************************************************
 * FILTER
 ***************************************************************************/

function shouldForward(
  body: CrispWebhookEvent,
  opts: FilterOpts
): boolean {
  if (!opts.selfNickname) return false; // Misconfig: cannot apply loop guard.
  if (body.event !== "message:send") return false;
  const data = body.data;
  if (!data) return false;
  if (data.type !== "note") return false;
  if (data.from !== "operator") return false;
  if (data.user?.nickname === opts.selfNickname) return false; // Loop prevention.
  if (!hasHugoPrefix(data.content)) return false;
  return true;
}

/**************************************************************************
 * EXPRESS HANDLER
 ***************************************************************************/

async function handleCrispWebhook(req: Request, res: Response): Promise<void> {
  // Body must be the raw string for HMAC. We rely on app.ts to capture rawBody.
  const rawBody = (req as Request & { rawBody?: string }).rawBody ?? "";
  const signature = req.header("X-Crisp-Signature");
  const secret = process.env.CRISP_WEBHOOK_SECRET;

  if (!verifyHmacSignature(rawBody, signature, secret)) {
    res.status(401).send("invalid signature");
    return;
  }

  let parsed: CrispWebhookEvent;
  try {
    parsed = JSON.parse(rawBody) as CrispWebhookEvent;
  } catch {
    res.status(400).send("invalid json");
    return;
  }

  const selfNickname = process.env.CRISP_NOTE_USER_NICKNAME ?? "";
  if (!shouldForward(parsed, { selfNickname })) {
    res.status(200).send("ignored");
    return;
  }

  const sessionId = parsed.session_id;
  const content = parsed.data?.content;
  if (!sessionId || !content) {
    res.status(200).send("ignored: missing session_id or content");
    return;
  }

  // Respond 200 immediately, do work async.
  res.status(200).send("queued");
  setImmediate(() => {
    forwardNoteToCustomer({ sessionId, noteContent: content }).catch((err: unknown) => {
      console.error("[crisp-webhook] forwardNoteToCustomer threw:", err);
    });
  });
}

/**************************************************************************
 * EXPORTS
 ***************************************************************************/

export { shouldForward, handleCrispWebhook };
```

- [ ] **Step 4: Run tests, verify all pass**

Run: `npm test`
Expected: 52 tests pass (44 existing + 8 new).

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: clean build.

- [ ] **Step 6: Commit**

```bash
git add src/webhooks/crisp.ts src/webhooks/crisp.test.ts
git commit -m "feat(notes): webhook filter + handler for Hugo: notes

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Wire `/webhooks/crisp` into `src/server.ts`

**Files:**
- Modify: `src/server.ts`

The webhook needs the **raw body** to verify HMAC. We'll use `express.json()` with a `verify` callback that captures `rawBody` on the request object.

- [ ] **Step 1: Replace `src/server.ts` with the wired version**

Open `src/server.ts`. Apply these changes:

(a) Add imports near the top, after existing imports:

```ts
import { handleCrispWebhook } from "@/webhooks/crisp.js";
```

(b) Replace `app.use(express.json());` with:

```ts
// Capture raw body so the Crisp webhook handler can verify HMAC signatures.
app.use(
  express.json({
    verify: (req, _res, buf) => {
      (req as { rawBody?: string }).rawBody = buf.toString("utf8");
    },
  })
);
```

(c) After the existing `app.post("/mcp", ...)` block, add the webhook route:

```ts
app.post("/webhooks/crisp", (req, res) => {
  handleCrispWebhook(req, res).catch((err: unknown) => {
    console.error("[crisp-webhook] handler threw:", err);
    if (!res.headersSent) {
      res.status(500).send("handler error");
    }
  });
});
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: clean build.

- [ ] **Step 3: Verify all tests still pass**

Run: `npm test`
Expected: 52 tests pass.

- [ ] **Step 4: Boot the server briefly to ensure no runtime crash**

```bash
npm start &
SERVER_PID=$!
sleep 3
curl -s http://localhost:3000/health
echo
kill $SERVER_PID 2>/dev/null
wait $SERVER_PID 2>/dev/null
```

Expected:
- Log line `Demo MCP Server running on http://localhost:3000/mcp`
- `curl /health` returns `OK`

- [ ] **Step 5: Commit**

```bash
git add src/server.ts
git commit -m "feat(notes): wire /webhooks/crisp route with raw body capture

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Manual end-to-end smoke test

**Files:** none (manual)

This needs `CRISP_WEBHOOK_SECRET` and `ANTHROPIC_API_KEY` set in `.env`. Cannot proceed without them.

- [ ] **Step 1: Confirm env vars**

```bash
grep -E "^(CRISP_WEBHOOK_SECRET|ANTHROPIC_API_KEY)=" .env
```
Expected: both lines present with non-empty values. If empty, STOP and ask the user to fill them in.

- [ ] **Step 2: Start the server**

In one terminal:
```bash
npm start
```
Wait for `Demo MCP Server running on http://localhost:3000/mcp`.

- [ ] **Step 3: Start cloudflared tunnel**

In a second terminal:
```bash
npm run tunnel
```
Note the public URL (e.g. `https://abcd-1234.trycloudflare.com`).

- [ ] **Step 4: Configure Crisp webhook**

In Crisp dashboard (Settings → Plugins → Webhook), add a webhook:
- URL: `<tunnel-url>/webhooks/crisp`
- Events: `message:send`
- Secret: same as `CRISP_WEBHOOK_SECRET`

- [ ] **Step 5: Trigger a Hugo: note**

In a Crisp test conversation (visitor messaging in any language), an operator (you) leaves a private note:
```
Hugo: vui lòng hỏi xem khách bị lỗi từ khi nào
```

- [ ] **Step 6: Verify customer-facing reply appears**

Within ~5 seconds:
- Customer sees a new public message in their language (e.g. EN: "Could you let us know when this issue started?").
- Operator sees a follow-up audit note: `[Hugo auto-replied]: <same text>`.

- [ ] **Step 7: Verify negative case**

Leave a non-Hugo note like `Internal note for the team`. Verify nothing gets sent to the customer (no audit note either).

- [ ] **Step 8: Verify loop prevention**

Manually craft a note like `Hugo: triggered from PageFly` and post it WHILE pretending to be PageFly identity (this is hard to do via UI; instead, check the audit note from Step 6 — its content starts with `[Hugo auto-replied]:`, so even if the webhook fires for it, the filter rejects on prefix mismatch). No infinite loop should occur.

- [ ] **Step 9: Stop server + tunnel**

`Ctrl-C` both terminals.

(No commit — manual test, no code change.)

---

## Done criteria

- [ ] `npm test` shows 52 tests passing.
- [ ] `npm run build` clean.
- [ ] `src/lib/crisp.ts` contains all shared Crisp helpers (HMAC, REST clients).
- [ ] `src/lib/anthropic.ts` contains pure prompt utils + `callClaude` SDK wrapper.
- [ ] `src/webhooks/crisp.ts` exposes `shouldForward` (pure) and `handleCrispWebhook` (Express).
- [ ] `src/webhooks/note-forwarder.ts` exposes `forwardNoteToCustomer` (orchestrator).
- [ ] `src/server.ts` registers `/webhooks/crisp` with raw body capture.
- [ ] `src/mcp/tools/escalate_scroll_issue/handler.ts` imports Crisp helpers from `@/lib/crisp.js` (no duplicated code).
- [ ] Manual smoke test passes end-to-end (Vietnamese note → English customer reply or appropriate other language).

---

## Notes for the engineer

**On TypeScript and the `.ts` import quirk:** Tests use `./scoring.ts` style imports because tsx loader resolves them. Source files use `@/...` path aliases with `.js` extensions. Don't mix the two — copy the convention from existing files in the same directory.

**On Anthropic SDK versioning:** As of plan write date, install whatever is the latest stable. The `messages.create` API and content block types have been stable across recent versions; if a breaking change appears, update the call site to match — the Anthropic docs are authoritative.

**On Crisp webhook payload:** The exact field names assumed (`event`, `website_id`, `session_id`, `data.type`, `data.from`, `data.content`, `data.user.nickname`) are based on Crisp v1 webhook docs and the GET messages API responses observed in screenshots. If a field is missing in the actual payload during smoke test, log the full payload once and adjust the filter — do not silently fail.
