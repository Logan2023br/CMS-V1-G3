# escalate_cart_drawer_issue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a new MCP tool `escalate_cart_drawer_issue` (cart/ATC bug escalation) mirroring `escalate_scroll_issue`, while refactoring scoring + escalation helpers into `src/lib/` so both tools share one implementation.

**Architecture:** Phase 1 refactors: move `scoring.ts` to `src/lib/` and extract a new `src/lib/escalation-shared.ts` (placeholder detection, ticket URL builder, WAIT_MESSAGE, generic `tryPostNoteWithScoring`). Phase 2 creates the cart drawer tool that consumes these shared modules. Phase 3 registers it and smoke-tests it.

**Tech Stack:** TypeScript + Zod (existing), Node `node:test` runner with tsx, MCP SDK (existing).

**Spec:** `docs/superpowers/specs/2026-05-13-escalate-cart-drawer-issue-design.md`

---

## File structure

**Create:**
- `src/lib/scoring.ts` (moved from `escalate_scroll_issue/scoring.ts`)
- `src/lib/scoring.test.ts` (moved from `escalate_scroll_issue/scoring.test.ts`)
- `src/lib/escalation-shared.ts` (new — placeholders, ticket URL, WAIT_MESSAGE, generic post-with-scoring)
- `src/mcp/tools/escalate_cart_drawer_issue/main.ts`
- `src/mcp/tools/escalate_cart_drawer_issue/handler.ts`
- `src/mcp/tools/escalate_cart_drawer_issue/shapes.ts`
- `src/mcp/tools/escalate_cart_drawer_issue/handler.test.ts`

**Modify:**
- `src/mcp/tools/escalate_scroll_issue/handler.ts` (consume shared lib)
- `src/mcp/tools/index.ts` (register cart tool)

**Delete (moved, not retained):**
- `src/mcp/tools/escalate_scroll_issue/scoring.ts`
- `src/mcp/tools/escalate_scroll_issue/scoring.test.ts`

---

### Task 1: Move scoring module from tool folder to `src/lib/`

**Files:**
- Move: `src/mcp/tools/escalate_scroll_issue/scoring.ts` → `src/lib/scoring.ts`
- Move: `src/mcp/tools/escalate_scroll_issue/scoring.test.ts` → `src/lib/scoring.test.ts`
- Modify: `src/mcp/tools/escalate_scroll_issue/handler.ts` (update import)
- Modify: `src/lib/crisp.ts` (update import of `ConversationLite` from scoring)

- [ ] **Step 1: Use git mv to move both files preserving history**

```bash
git mv src/mcp/tools/escalate_scroll_issue/scoring.ts src/lib/scoring.ts
git mv src/mcp/tools/escalate_scroll_issue/scoring.test.ts src/lib/scoring.test.ts
```

- [ ] **Step 2: Update import in `src/mcp/tools/escalate_scroll_issue/handler.ts`**

Find the line:
```ts
import { findBestSession } from "@/mcp/tools/escalate_scroll_issue/scoring.js";
```

Replace with:
```ts
import { findBestSession } from "@/lib/scoring.js";
```

- [ ] **Step 3: Update import in `src/lib/crisp.ts`**

Current `src/lib/crisp.ts` has:
```ts
import { type ConversationLite } from "@/mcp/tools/escalate_scroll_issue/scoring.js";
```

Replace with:
```ts
import { type ConversationLite } from "@/lib/scoring.js";
```

- [ ] **Step 4: Verify nothing else imports the old path**

Run: `grep -rn "escalate_scroll_issue/scoring" src/`
Expected: no matches (after the edits above).

- [ ] **Step 5: Verify build + tests**

Run: `npm run build && npm test`
Expected: clean build, 53 tests still pass.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(scoring): move scoring module to src/lib for sharing

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Create `src/lib/escalation-shared.ts` with placeholder/ticket helpers + WAIT_MESSAGE

**Files:**
- Create: `src/lib/escalation-shared.ts`
- Modify: `src/mcp/tools/escalate_scroll_issue/handler.ts` (remove duplicates, import from shared)

- [ ] **Step 1: Create `src/lib/escalation-shared.ts` with this exact content**

```ts
/**************************************************************************
 * CONSTANTS
 ***************************************************************************/

const WAIT_MESSAGE =
  "Cảm ơn bạn đã cung cấp đầy đủ thông tin nhé 😊 Mình đã chuyển vấn đề này đến team technical để kiểm tra chi tiết. Bạn vui lòng chờ trong vài phút, team sẽ xem xét và phản hồi bạn sớm nhất có thể!";

const TICKET_URL_FALLBACK = "(unknown — tool was called without ticket_url)";

const PLACEHOLDER_PATTERNS: RegExp[] = [
  /YOUR_STORE/i,
  /YOUR_SHOP/i,
  /YOUR_DOMAIN/i,
  /STORE_NAME/i,
  /SHOP_NAME/i,
  /PAGE_ID/i,
  /<[^<>]+>/, // angle-bracket placeholders like <store_name>
  /\{[^{}]+\}/, // curly-brace placeholders like {store_name}
  /dummyimage\.com/i,
  /placehold(er|it|\.co)/i,
  /\bexample\.(com|org|net)\b/i,
  /\bfake[-_/]/i,
  /\bsample[-_/]/i,
  /\btest[-_/]?(image|url|store|page)\b/i,
  /lorempixel/i,
  /loremipsum/i,
];

/**************************************************************************
 * FUNCTIONS
 ***************************************************************************/

function looksLikePlaceholder(url: string | undefined): boolean {
  if (!url) return false;
  return PLACEHOLDER_PATTERNS.some((re) => re.test(url));
}

function buildTicketUrl(websiteId: string, sessionId: string): string {
  return `https://app.crisp.chat/website/${websiteId}/inbox/${sessionId}`;
}

/**************************************************************************
 * EXPORTS
 ***************************************************************************/

export {
  WAIT_MESSAGE,
  TICKET_URL_FALLBACK,
  PLACEHOLDER_PATTERNS,
  looksLikePlaceholder,
  buildTicketUrl,
};
```

- [ ] **Step 2: Edit `src/mcp/tools/escalate_scroll_issue/handler.ts` — replace local constants and helpers with imports**

In `src/mcp/tools/escalate_scroll_issue/handler.ts`:

**a)** Add a new import block right after the existing `from "@/lib/crisp.js"` import block (around line 14):

```ts
import {
  WAIT_MESSAGE,
  TICKET_URL_FALLBACK,
  looksLikePlaceholder,
  buildTicketUrl,
} from "@/lib/escalation-shared.js";
```

**b)** Delete these from `handler.ts`:
- `const WAIT_MESSAGE = "Cảm ơn bạn đã cung cấp...";` (around line 20-21)
- `const TICKET_URL_FALLBACK = "(unknown — tool was called without ticket_url)";` (around line 30)
- `const PLACEHOLDER_PATTERNS: RegExp[] = [...];` (the whole array, around line 32-49)
- `function looksLikePlaceholder(url) { ... }` (around line 51-54)
- `function buildTicketUrl(...) { ... }` (around line 78-80)

Do NOT delete: `WAIT_MESSAGE` references inside the handler body, `looksLikePlaceholder(...)` calls, `buildTicketUrl(...)` calls, `TICKET_URL_FALLBACK` uses — those are USAGES, they will now reach the imported names.

Do NOT delete: `MissingField`, `MISSING_FIELD_LABEL`, `SessionMatchInfo`, `NoteFields`, `PostNoteResult`, `formatNoteContent`, `tryPostNote`, `escalateScrollIssueHandler` — those stay in this handler (cart-specific stuff will live in cart handler in later tasks; we're not yet extracting the generic post flow).

- [ ] **Step 3: Verify build + tests**

Run: `npm run build && npm test`
Expected: clean build, 53 tests pass, no regressions.

- [ ] **Step 4: Commit**

```bash
git add src/lib/escalation-shared.ts src/mcp/tools/escalate_scroll_issue/handler.ts
git commit -m "refactor(escalation): extract shared helpers to src/lib/escalation-shared.ts

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Extract generic `tryPostNoteWithScoring` to `src/lib/escalation-shared.ts`

**Files:**
- Modify: `src/lib/escalation-shared.ts` (add generic function)
- Modify: `src/mcp/tools/escalate_scroll_issue/handler.ts` (consume the generic, drop local `tryPostNote`)

The current scroll handler has a `tryPostNote(hintedSessionId, noteFields, scoringInputs)` function. We'll move the orchestration to shared lib, parameterized via a `formatNote` callback so each tool can build its own note string.

- [ ] **Step 1: Add imports at the top, then append types + function at the bottom of `src/lib/escalation-shared.ts`**

**(a)** Add these import statements at the VERY TOP of the file (before all existing code):

```ts
import {
  readCrispCreds,
  postCrispPrivateNote,
  fetchHugoConversations,
} from "@/lib/crisp.js";
import {
  findBestSession,
  type ScoringInputs,
} from "@/lib/scoring.js";
```

**(b)** Append this block ABOVE the existing `EXPORTS` block (the imports above must NOT be repeated here):

```ts
/**************************************************************************
 * POST-WITH-SCORING GENERIC
 ***************************************************************************/

interface SessionMatchInfo {
  score: number;
  signalsMatched: string[];
  thresholdMet: boolean;
}

interface PostNoteResult {
  posted: boolean;
  error?: string;
  sessionUsed?: string;
  sessionSource?: "input" | "scored";
  match?: SessionMatchInfo;
  noteContent: string;
}

interface TryPostArgs<TFields> {
  hintedSessionId?: string;
  fields: TFields;
  providedTicketUrl?: string;
  scoringInputs: ScoringInputs;
  formatNote: (fields: TFields, ticketUrl: string) => string;
}

async function tryPostNoteWithScoring<TFields>(
  args: TryPostArgs<TFields>
): Promise<PostNoteResult> {
  const { hintedSessionId, fields, providedTicketUrl, scoringInputs, formatNote } = args;

  const creds = readCrispCreds();
  if (!creds) {
    return {
      posted: false,
      error:
        "Crisp API credentials not configured (set CRISP_WEBSITE_ID, CRISP_IDENTIFIER, CRISP_KEY in .env).",
      noteContent: formatNote(fields, providedTicketUrl ?? TICKET_URL_FALLBACK),
    };
  }

  // 1) Hugo truyền session_id → POST thẳng, không cần scoring.
  if (hintedSessionId) {
    const ticketUrl = providedTicketUrl ?? buildTicketUrl(creds.websiteId, hintedSessionId);
    const noteContent = formatNote(fields, ticketUrl);
    const r = await postCrispPrivateNote(hintedSessionId, noteContent, creds);
    if (r.ok) {
      return {
        posted: true,
        sessionUsed: hintedSessionId,
        sessionSource: "input",
        noteContent,
      };
    }
    return {
      posted: false,
      error: `Posting to provided session ${hintedSessionId} failed: ${r.error}`,
      sessionUsed: hintedSessionId,
      sessionSource: "input",
      noteContent,
    };
  }

  // 2) Auto-resolve qua hybrid scoring.
  const list = await fetchHugoConversations(creds);
  if (list.error) {
    return {
      posted: false,
      error: list.error,
      noteContent: formatNote(fields, providedTicketUrl ?? TICKET_URL_FALLBACK),
    };
  }
  if (list.conversations.length === 0) {
    return {
      posted: false,
      error: "Hugo's inbox không có conversation nào để match.",
      noteContent: formatNote(fields, providedTicketUrl ?? TICKET_URL_FALLBACK),
    };
  }

  const best = findBestSession(list.conversations, scoringInputs);
  const matchInfo: SessionMatchInfo = {
    score: best.score,
    signalsMatched: best.signalsMatched,
    thresholdMet: best.thresholdMet,
  };

  if (!best.thresholdMet || !best.sessionId) {
    return {
      posted: false,
      error: `Không tìm thấy conversation đủ tin cậy (top score ${best.score} < threshold 50). Signals: [${best.signalsMatched.join(", ")}]. Hugo nên xin user paste lại link hoặc dev xử tay.`,
      match: matchInfo,
      noteContent: formatNote(fields, providedTicketUrl ?? TICKET_URL_FALLBACK),
    };
  }

  const ticketUrl = providedTicketUrl ?? buildTicketUrl(creds.websiteId, best.sessionId);
  const noteContent = formatNote(fields, ticketUrl);
  const r = await postCrispPrivateNote(best.sessionId, noteContent, creds);
  if (r.ok) {
    return {
      posted: true,
      sessionUsed: best.sessionId,
      sessionSource: "scored",
      match: matchInfo,
      noteContent,
    };
  }
  return {
    posted: false,
    error: `Auto-resolved session ${best.sessionId} (score ${best.score}, signals [${best.signalsMatched.join(", ")}]) but POSTing failed: ${r.error}`,
    sessionUsed: best.sessionId,
    sessionSource: "scored",
    match: matchInfo,
    noteContent,
  };
}
```

Update the EXPORTS block of `src/lib/escalation-shared.ts` to include the new symbols:

```ts
export {
  WAIT_MESSAGE,
  TICKET_URL_FALLBACK,
  PLACEHOLDER_PATTERNS,
  looksLikePlaceholder,
  buildTicketUrl,
  tryPostNoteWithScoring,
  type SessionMatchInfo,
  type PostNoteResult,
};
```

- [ ] **Step 2: Update `src/mcp/tools/escalate_scroll_issue/handler.ts` to use the generic**

**a)** Update the import from `@/lib/escalation-shared.js` to add `tryPostNoteWithScoring`, `type PostNoteResult`:

```ts
import {
  WAIT_MESSAGE,
  TICKET_URL_FALLBACK,
  looksLikePlaceholder,
  buildTicketUrl,
  tryPostNoteWithScoring,
  type PostNoteResult,
} from "@/lib/escalation-shared.js";
```

**b)** Remove the now-unused `findBestSession` import — the generic owns this. Open file, change:

```ts
import { findBestSession } from "@/lib/scoring.js";
```

to:

```ts
// findBestSession is consumed inside tryPostNoteWithScoring; no direct import needed here.
```

(Or simply delete the line.)

**c)** Remove the existing local `interface SessionMatchInfo`, `interface PostNoteResult`, and the entire `async function tryPostNote(...) { ... }` block from scroll handler. (We keep `interface NoteFields` because it's scroll-specific, and `function formatNoteContent` because that's the scroll-specific formatter passed to the generic.)

**d)** Replace the body of `escalateScrollIssueHandler` where it called `tryPostNote(...)` with a call to `tryPostNoteWithScoring(...)`. Find this block:

```ts
  const noteResult: PostNoteResult = await tryPostNote(
    input.crisp_session_id,
    {
      issueDescription: input.issue_description,
      screenshotUrl,
      editorLink,
      providedTicketUrl: input.ticket_url,
    },
    {
      customerLastMessageText: input.customer_last_message_text,
      screenshotUrl,
      editorLink,
    }
  );
```

Replace with:

```ts
  const noteResult: PostNoteResult = await tryPostNoteWithScoring({
    hintedSessionId: input.crisp_session_id,
    fields: {
      issueDescription: input.issue_description,
      screenshotUrl,
      editorLink,
    },
    providedTicketUrl: input.ticket_url,
    scoringInputs: {
      customerLastMessageText: input.customer_last_message_text,
      screenshotUrl,
      editorLink,
    },
    formatNote: formatNoteContent,
  });
```

(`formatNoteContent` is the existing scroll-specific function defined in the same file — passed by reference into the generic.)

- [ ] **Step 3: Verify build + tests**

Run: `npm run build && npm test`
Expected: clean build, 53 tests still pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/escalation-shared.ts src/mcp/tools/escalate_scroll_issue/handler.ts
git commit -m "refactor(escalation): extract generic tryPostNoteWithScoring

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Create `escalate_cart_drawer_issue/shapes.ts`

**Files:**
- Create: `src/mcp/tools/escalate_cart_drawer_issue/shapes.ts`

- [ ] **Step 1: Create the shapes file with this exact content**

```ts
/**************************************************************************
 * IMPORTS
 ***************************************************************************/

import { z } from "zod";

/**************************************************************************
 * INPUT SCHEMA
 ***************************************************************************/

const ESCALATE_CART_DRAWER_INPUT_SHAPE = z.object({
  issue_description: z
    .string()
    .min(1)
    .describe(
      "Hugo's paraphrase of the user's complaint. Examples: 'Cart drawer không mở khi click ATC', 'ATC button không update cart, cần reload page'."
    ),

  editor_link: z
    .string()
    .url()
    .describe(
      "The PageFly editor link the user pasted in this conversation. Take whatever URL the user actually sent — do not invent or use a placeholder."
    ),

  live_preview_url: z
    .string()
    .url()
    .describe(
      "The live preview / storefront URL the user pasted (e.g. https://store.myshopify.com/products/...). Required so the technical team can reproduce the cart drawer / ATC bug. Take what the user sent — do not invent."
    ),

  screenshot_url: z
    .string()
    .url()
    .optional()
    .describe(
      "ANY URL pointing to a picture of the issue, if the user attached one. Optional — cart drawer bugs are typically behavioral, so screenshots may not exist. Take the URL the user actually provided, never fabricate."
    ),

  ticket_url: z
    .string()
    .url()
    .optional()
    .describe(
      "Optional — only include if your runtime exposes the live Crisp conversation URL. Auto-built from crisp_session_id otherwise."
    ),

  crisp_session_id: z
    .string()
    .optional()
    .describe(
      "The Crisp conversation session ID (looks like 'session_xxxxxxxx-xxxx-xxxx-...'). If you have it from runtime context, include it — the tool will POST the private note directly. If you do not have it, the tool will try to auto-resolve via hybrid scoring."
    ),

  customer_last_message_text: z
    .string()
    .optional()
    .describe(
      "Verbatim text of the user's LAST message in this conversation. Copy as-is — KHÔNG paraphrase, KHÔNG trim, KHÔNG fix typo, KHÔNG translate. Used to find the correct conversation when crisp_session_id is missing. Omit if the last message has no text content (e.g. attachment only)."
    ),
});

type EscalateCartDrawerInput = z.infer<typeof ESCALATE_CART_DRAWER_INPUT_SHAPE>;

/**************************************************************************
 * OUTPUT SCHEMA
 ***************************************************************************/

const CRISP_NOTE = z.object({
  content: z
    .string()
    .describe(
      "Plain-text Crisp note. Empty string if not ready for escalation."
    ),
  formatted_message: z
    .string()
    .describe(
      "Same content, ready to post directly into Crisp. Empty string if not ready."
    ),
});

const SESSION_MATCH = z.object({
  score: z
    .number()
    .describe("Total scoring of the chosen conversation (or the top conversation if none met threshold)."),
  signals_matched: z
    .array(z.string())
    .describe(
      "Signals matched: 'exact_text', 'substring_text', 'url_screenshot', 'url_editor', 'waiting_since_top', 'updated_at_top'."
    ),
  threshold_met: z
    .boolean()
    .describe("True if top score ≥ 50 and the tool posted the note. False if below threshold (note NOT posted)."),
});

const ESCALATE_CART_DRAWER_OUTPUT_SHAPE = z.object({
  issue_summary: z
    .string()
    .describe("Short summary Hugo can echo back to the user."),

  is_ready_for_escalation: z
    .boolean()
    .describe(
      "True iff editor_link and live_preview_url are provided and not placeholders."
    ),

  missing_info: z
    .array(z.string())
    .describe(
      "List of fields still missing. Possible values: 'editor_link', 'live_preview_url'. screenshot is optional and never blocks escalation."
    ),

  crisp_note: CRISP_NOTE.describe(
    "The note Hugo should post on the Crisp conversation. Empty when not ready."
  ),

  next_step_for_user: z
    .string()
    .describe(
      "Exact sentence Hugo should say to the user next — either a request for missing info, or the wait-for-technical-team message."
    ),

  note_posted: z
    .boolean()
    .describe(
      "True if the tool successfully POSTed the private note to Crisp. False otherwise."
    ),

  note_post_error: z
    .string()
    .optional()
    .describe(
      "Error message if posting failed or was skipped. Useful for Hugo and the developer to diagnose."
    ),

  session_match: SESSION_MATCH.optional().describe(
    "Details of session matching when tool auto-resolved crisp_session_id. Absent when Hugo passed crisp_session_id directly."
  ),
});

type EscalateCartDrawerOutput = z.infer<typeof ESCALATE_CART_DRAWER_OUTPUT_SHAPE>;

/**************************************************************************
 * EXPORTS
 ***************************************************************************/

export {
  ESCALATE_CART_DRAWER_INPUT_SHAPE,
  ESCALATE_CART_DRAWER_OUTPUT_SHAPE,
  type EscalateCartDrawerInput,
  type EscalateCartDrawerOutput,
};
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: clean build (no errors). Tests unchanged at 53 since this file doesn't add tests yet.

- [ ] **Step 3: Commit**

```bash
git add src/mcp/tools/escalate_cart_drawer_issue/shapes.ts
git commit -m "feat(cart): add Zod schema for escalate_cart_drawer_issue

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: TDD `escalate_cart_drawer_issue/handler.ts` — missing-info gate

**Files:**
- Create: `src/mcp/tools/escalate_cart_drawer_issue/handler.ts`
- Create: `src/mcp/tools/escalate_cart_drawer_issue/handler.test.ts`

This task introduces the handler with ONLY the missing-info / placeholder branch implemented and tested. Subsequent task (6) adds the successful-escalation branch.

- [ ] **Step 1: Write the failing tests first**

Create `src/mcp/tools/escalate_cart_drawer_issue/handler.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { escalateCartDrawerIssueHandler } from "./handler.ts";

test("cart handler: missing editor_link → missing_info includes editor_link", async () => {
  const out = await escalateCartDrawerIssueHandler({
    issue_description: "Cart drawer không mở",
    editor_link: undefined as unknown as string,
    live_preview_url: "https://store.myshopify.com/products/test",
  });
  assert.equal(out.is_ready_for_escalation, false);
  assert.ok(out.missing_info.includes("editor_link"));
  assert.equal(out.note_posted, false);
  assert.equal(out.crisp_note.content, "");
});

test("cart handler: missing live_preview_url → missing_info includes live_preview_url", async () => {
  const out = await escalateCartDrawerIssueHandler({
    issue_description: "Cart drawer không mở",
    editor_link: "https://admin.shopify.com/store/x/apps/pagefly/editor/abc",
    live_preview_url: undefined as unknown as string,
  });
  assert.equal(out.is_ready_for_escalation, false);
  assert.ok(out.missing_info.includes("live_preview_url"));
});

test("cart handler: missing both → both in missing_info", async () => {
  const out = await escalateCartDrawerIssueHandler({
    issue_description: "Cart issue",
    editor_link: undefined as unknown as string,
    live_preview_url: undefined as unknown as string,
  });
  assert.ok(out.missing_info.includes("editor_link"));
  assert.ok(out.missing_info.includes("live_preview_url"));
});

test("cart handler: placeholder editor_link → treated as missing", async () => {
  const out = await escalateCartDrawerIssueHandler({
    issue_description: "Cart issue",
    editor_link: "https://YOUR_STORE.myshopify.com/admin/apps/pagefly",
    live_preview_url: "https://store.myshopify.com/products/test",
  });
  assert.ok(out.missing_info.includes("editor_link"));
  assert.equal(out.note_posted, false);
});

test("cart handler: placeholder live_preview → treated as missing", async () => {
  const out = await escalateCartDrawerIssueHandler({
    issue_description: "Cart issue",
    editor_link: "https://admin.shopify.com/store/x/apps/pagefly/editor/abc",
    live_preview_url: "https://example.com/products/test",
  });
  assert.ok(out.missing_info.includes("live_preview_url"));
});

test("cart handler: next_step_for_user mentions both labels when both missing", async () => {
  const out = await escalateCartDrawerIssueHandler({
    issue_description: "Cart issue",
    editor_link: undefined as unknown as string,
    live_preview_url: undefined as unknown as string,
  });
  assert.match(out.next_step_for_user, /link editor/);
  assert.match(out.next_step_for_user, /link live preview/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: 6 new tests fail with "Cannot find module './handler.ts'" or similar import error (handler.ts doesn't exist yet).

- [ ] **Step 3: Create the handler with the missing-info branch only**

Create `src/mcp/tools/escalate_cart_drawer_issue/handler.ts`:

```ts
/**************************************************************************
 * IMPORTS
 ***************************************************************************/

import type {
  EscalateCartDrawerInput,
  EscalateCartDrawerOutput,
} from "@/mcp/tools/escalate_cart_drawer_issue/shapes.js";
import {
  looksLikePlaceholder,
} from "@/lib/escalation-shared.js";

/**************************************************************************
 * CONSTANTS
 ***************************************************************************/

type MissingField = "editor_link" | "live_preview_url";

const MISSING_FIELD_LABEL: Record<MissingField, string> = {
  editor_link: "link editor",
  live_preview_url: "link live preview",
};

/**************************************************************************
 * MAIN HANDLER
 ***************************************************************************/

async function escalateCartDrawerIssueHandler(
  input: EscalateCartDrawerInput
): Promise<EscalateCartDrawerOutput> {
  const missing: MissingField[] = [];

  if (!input.editor_link) missing.push("editor_link");
  if (!input.live_preview_url) missing.push("live_preview_url");

  // Reject obvious placeholders. Hugo sometimes invents values like
  // "YOUR_STORE", "example.com", "dummyimage.com" to satisfy the schema
  // instead of asking the user. Treat these as "missing".
  if (input.editor_link && looksLikePlaceholder(input.editor_link)) {
    if (!missing.includes("editor_link")) missing.push("editor_link");
  }
  if (input.live_preview_url && looksLikePlaceholder(input.live_preview_url)) {
    if (!missing.includes("live_preview_url")) missing.push("live_preview_url");
  }

  if (missing.length > 0) {
    const labels = missing.map((key) => MISSING_FIELD_LABEL[key]).join(", ");
    return {
      issue_summary: "Cần thêm thông tin trước khi escalate cho technical team.",
      is_ready_for_escalation: false,
      missing_info: missing,
      crisp_note: { content: "", formatted_message: "" },
      next_step_for_user: `Để team technical kiểm tra giúp bạn nhanh nhất, bạn vui lòng gửi giúp mình ${labels} nhé 😊 Khi có đủ thông tin, mình sẽ chuyển ngay cho team xử lý.`,
      note_posted: false,
      note_post_error:
        "Not ready for escalation — Hugo MUST ask the user for the real editor link and live preview URL, then call this tool again with the user's actual values. Do NOT fabricate placeholder URLs.",
    };
  }

  // Successful-escalation branch is added in Task 6.
  throw new Error("not implemented: ready-to-escalate branch (added in Task 6)");
}

/**************************************************************************
 * EXPORTS
 ***************************************************************************/

export { escalateCartDrawerIssueHandler };
```

- [ ] **Step 4: Run tests, verify all 6 missing-info tests pass**

Run: `npm test`
Expected: 59 tests pass (53 existing + 6 new). Build also clean.

- [ ] **Step 5: Commit**

```bash
git add src/mcp/tools/escalate_cart_drawer_issue/handler.ts src/mcp/tools/escalate_cart_drawer_issue/handler.test.ts
git commit -m "feat(cart): cart-drawer handler with missing-info gate (TDD)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: TDD note formatter + successful-escalation branch in cart handler

**Files:**
- Modify: `src/mcp/tools/escalate_cart_drawer_issue/handler.ts`
- Modify: `src/mcp/tools/escalate_cart_drawer_issue/handler.test.ts`

- [ ] **Step 1: Append note-format tests to `handler.test.ts`**

Append:

```ts
import { formatCartNoteContent } from "./handler.ts";

test("formatCartNoteContent: all fields incl. screenshot", () => {
  const note = formatCartNoteContent(
    {
      issueDescription: "Cart drawer không mở khi click ATC",
      livePreviewUrl: "https://store.myshopify.com/products/test",
      editorLink: "https://admin.shopify.com/store/x/apps/pagefly/editor/abc",
      screenshotUrl: "https://prnt.sc/abc",
    },
    "https://app.crisp.chat/website/W/inbox/session_S"
  );
  assert.equal(
    note,
    "Issue: Cart drawer không mở khi click ATC, live preview: https://store.myshopify.com/products/test, hình ảnh: https://prnt.sc/abc\nEditor: https://admin.shopify.com/store/x/apps/pagefly/editor/abc\nTicket: https://app.crisp.chat/website/W/inbox/session_S"
  );
});

test("formatCartNoteContent: omits hình ảnh when screenshot missing", () => {
  const note = formatCartNoteContent(
    {
      issueDescription: "Cart drawer không mở",
      livePreviewUrl: "https://store.myshopify.com/products/test",
      editorLink: "https://admin.shopify.com/store/x/apps/pagefly/editor/abc",
    },
    "https://app.crisp.chat/website/W/inbox/session_S"
  );
  assert.equal(
    note,
    "Issue: Cart drawer không mở, live preview: https://store.myshopify.com/products/test\nEditor: https://admin.shopify.com/store/x/apps/pagefly/editor/abc\nTicket: https://app.crisp.chat/website/W/inbox/session_S"
  );
});

test("formatCartNoteContent: silently drops placeholder screenshot", () => {
  const note = formatCartNoteContent(
    {
      issueDescription: "Cart drawer không mở",
      livePreviewUrl: "https://store.myshopify.com/products/test",
      editorLink: "https://admin.shopify.com/store/x/apps/pagefly/editor/abc",
      screenshotUrl: "https://dummyimage.com/600x400",
    },
    "https://app.crisp.chat/website/W/inbox/session_S"
  );
  // Should NOT include the placeholder URL.
  assert.ok(!note.includes("dummyimage.com"));
  assert.ok(!note.includes("hình ảnh"));
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npm test`
Expected: 3 new tests fail with `"formatCartNoteContent is not a function"` or import error.

- [ ] **Step 3: Add the formatter + successful-escalation branch to `handler.ts`**

Replace the entire contents of `src/mcp/tools/escalate_cart_drawer_issue/handler.ts` with:

```ts
/**************************************************************************
 * IMPORTS
 ***************************************************************************/

import type {
  EscalateCartDrawerInput,
  EscalateCartDrawerOutput,
} from "@/mcp/tools/escalate_cart_drawer_issue/shapes.js";
import {
  WAIT_MESSAGE,
  looksLikePlaceholder,
  tryPostNoteWithScoring,
  type PostNoteResult,
} from "@/lib/escalation-shared.js";

/**************************************************************************
 * CONSTANTS
 ***************************************************************************/

type MissingField = "editor_link" | "live_preview_url";

const MISSING_FIELD_LABEL: Record<MissingField, string> = {
  editor_link: "link editor",
  live_preview_url: "link live preview",
};

/**************************************************************************
 * NOTE FORMAT
 ***************************************************************************/

interface CartNoteFields {
  issueDescription: string;
  livePreviewUrl: string;
  editorLink: string;
  screenshotUrl?: string;
}

function formatCartNoteContent(fields: CartNoteFields, ticketUrl: string): string {
  // Silently drop placeholder screenshot URLs (already filtered upstream,
  // but defend in depth in case future call sites skip the gate).
  const hasScreenshot =
    fields.screenshotUrl && !looksLikePlaceholder(fields.screenshotUrl);

  const issueLine = hasScreenshot
    ? `Issue: ${fields.issueDescription}, live preview: ${fields.livePreviewUrl}, hình ảnh: ${fields.screenshotUrl}`
    : `Issue: ${fields.issueDescription}, live preview: ${fields.livePreviewUrl}`;

  return `${issueLine}\nEditor: ${fields.editorLink}\nTicket: ${ticketUrl}`;
}

/**************************************************************************
 * MAIN HANDLER
 ***************************************************************************/

async function escalateCartDrawerIssueHandler(
  input: EscalateCartDrawerInput
): Promise<EscalateCartDrawerOutput> {
  const missing: MissingField[] = [];

  if (!input.editor_link) missing.push("editor_link");
  if (!input.live_preview_url) missing.push("live_preview_url");

  if (input.editor_link && looksLikePlaceholder(input.editor_link)) {
    if (!missing.includes("editor_link")) missing.push("editor_link");
  }
  if (input.live_preview_url && looksLikePlaceholder(input.live_preview_url)) {
    if (!missing.includes("live_preview_url")) missing.push("live_preview_url");
  }

  if (missing.length > 0) {
    const labels = missing.map((key) => MISSING_FIELD_LABEL[key]).join(", ");
    return {
      issue_summary: "Cần thêm thông tin trước khi escalate cho technical team.",
      is_ready_for_escalation: false,
      missing_info: missing,
      crisp_note: { content: "", formatted_message: "" },
      next_step_for_user: `Để team technical kiểm tra giúp bạn nhanh nhất, bạn vui lòng gửi giúp mình ${labels} nhé 😊 Khi có đủ thông tin, mình sẽ chuyển ngay cho team xử lý.`,
      note_posted: false,
      note_post_error:
        "Not ready for escalation — Hugo MUST ask the user for the real editor link and live preview URL, then call this tool again with the user's actual values. Do NOT fabricate placeholder URLs.",
    };
  }

  // Past the gate above, both fields are guaranteed present.
  const editorLink = input.editor_link as string;
  const livePreviewUrl = input.live_preview_url as string;
  // Drop placeholder screenshots silently.
  const screenshotUrl =
    input.screenshot_url && !looksLikePlaceholder(input.screenshot_url)
      ? input.screenshot_url
      : undefined;

  const noteResult: PostNoteResult = await tryPostNoteWithScoring({
    hintedSessionId: input.crisp_session_id,
    fields: {
      issueDescription: input.issue_description,
      livePreviewUrl,
      editorLink,
      screenshotUrl,
    },
    providedTicketUrl: input.ticket_url,
    scoringInputs: {
      customerLastMessageText: input.customer_last_message_text,
      screenshotUrl,
      editorLink,
    },
    formatNote: formatCartNoteContent,
  });

  if (noteResult.posted) {
    console.log(
      `[escalate_cart_drawer_issue] match: session=${noteResult.sessionUsed} source=${noteResult.sessionSource} score=${noteResult.match?.score ?? "n/a"} signals=[${noteResult.match?.signalsMatched.join(", ") ?? ""}] posted=true`
    );
  } else {
    console.error(
      `[escalate_cart_drawer_issue] match: posted=false error=${noteResult.error}`
    );
  }

  return {
    issue_summary: input.issue_description,
    is_ready_for_escalation: true,
    missing_info: [],
    crisp_note: {
      content: noteResult.noteContent,
      formatted_message: noteResult.noteContent,
    },
    next_step_for_user: WAIT_MESSAGE,
    note_posted: noteResult.posted,
    note_post_error: noteResult.error,
    session_match: noteResult.match
      ? {
          score: noteResult.match.score,
          signals_matched: noteResult.match.signalsMatched,
          threshold_met: noteResult.match.thresholdMet,
        }
      : undefined,
  };
}

/**************************************************************************
 * EXPORTS
 ***************************************************************************/

export { escalateCartDrawerIssueHandler, formatCartNoteContent };
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: 62 tests pass (53 existing + 6 missing-info + 3 format).

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: clean build.

- [ ] **Step 6: Commit**

```bash
git add src/mcp/tools/escalate_cart_drawer_issue/handler.ts src/mcp/tools/escalate_cart_drawer_issue/handler.test.ts
git commit -m "feat(cart): note formatter + ready-to-escalate flow

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Create `escalate_cart_drawer_issue/main.ts` (tool description + registration)

**Files:**
- Create: `src/mcp/tools/escalate_cart_drawer_issue/main.ts`

- [ ] **Step 1: Create main.ts**

```ts
/**************************************************************************
 * IMPORTS
 ***************************************************************************/

import { escalateCartDrawerIssueHandler } from "@/mcp/tools/escalate_cart_drawer_issue/handler.js";
import {
  ESCALATE_CART_DRAWER_INPUT_SHAPE,
  ESCALATE_CART_DRAWER_OUTPUT_SHAPE,
} from "@/mcp/tools/escalate_cart_drawer_issue/shapes.js";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  EscalateCartDrawerInput,
  EscalateCartDrawerOutput,
} from "@/mcp/tools/escalate_cart_drawer_issue/shapes.js";

/**************************************************************************
 * TOOL REGISTRATION
 ***************************************************************************/

/**
 * Register the "escalate_cart_drawer_issue" tool with the MCP server.
 *
 * Pure-escalation tool: collects editor link + live preview URL,
 * formats a 3-line Crisp note for the technical team, and (if Crisp
 * credentials + session_id are available) posts it automatically.
 */
function registerEscalateCartDrawerIssueTool(server: McpServer): void {
  server.registerTool(
    "escalate_cart_drawer_issue",
    {
      title: "Escalate PageFly cart drawer / ATC issue to technical team",
      description: `
        Call this tool when the user reports that the cart drawer does not work or the Add-to-Cart (ATC) button does not update the cart properly. Common phrasings:
          - "Cart drawer không hoạt động" / "Cart drawer không mở"
          - "Click ATC nhưng cart không update, phải reload page"
          - "Click ATC nhưng cart drawer không mở và update"
          - Any cart / ATC / add-to-cart related complaint.

        ===========================================================
        ABSOLUTE RULE — READ THIS FIRST
        ===========================================================

        DO NOT call this tool until you have BOTH:
          1. A real PageFly editor link the user has actually pasted, AND
          2. A real live preview / storefront URL the user has actually pasted.

        NEVER fabricate, invent, paraphrase, or substitute placeholder values to "satisfy the schema". The tool's server-side validation will REJECT placeholders (YOUR_STORE, example.com, dummyimage.com, etc.) and force you to ask the user again, wasting the user's time.

        If the user has not yet provided BOTH real links, follow STEP 1 below.

        ===========================================================
        INPUTS
        ===========================================================

        - issue_description (required) — Your one-line paraphrase of the user's complaint in Vietnamese.
        - editor_link (required) — The PageFly editor URL the user pasted. Take what the user sent. No placeholders.
        - live_preview_url (required) — The live preview / storefront URL the user pasted (e.g. https://store.myshopify.com/products/abc). Required so the technical team can reproduce the cart drawer / ATC bug. No placeholders.
        - screenshot_url (optional) — Any URL pointing to a picture, IF the user attached one. Cart drawer bugs are usually behavioral, so screenshots may not exist. Omit if not provided.
        - ticket_url (optional) — Only include if your runtime exposes the live Crisp conversation URL. Auto-built from crisp_session_id otherwise.
        - crisp_session_id (optional but STRONGLY recommended) — The Crisp session ID for THIS conversation. Include it if your runtime has access.
        - customer_last_message_text (optional but STRONGLY recommended) — Verbatim copy of user's last text message. KHÔNG paraphrase, KHÔNG translate, KHÔNG fix typo, KHÔNG trim. Omit if the last message had no text (e.g. attachment only).

        ===========================================================
        WHAT YOU MUST DO
        ===========================================================

        STEP 1 — User reports a cart drawer / ATC issue, but has not yet shared editor link AND live preview link.
        Reply:
        "Thông thường vấn đề này là do code theme chưa match với chức năng ATC của PageFly. Vì vậy chúng tôi sẽ cần kiểm tra và giúp bạn add code để fix issue này. Vui lòng cung cấp editor page đang lỗi và link live preview để chúng tôi có thể kiểm tra."

        STEP 2 — User has provided only ONE piece. Ask for the missing one. Do not call the tool yet.

        STEP 3 — User has provided BOTH editor link AND live preview link.
        a) Call escalate_cart_drawer_issue with: issue_description, editor_link, live_preview_url. Include screenshot_url if user attached one. Include ticket_url and crisp_session_id if you have them. ALWAYS include customer_last_message_text (verbatim copy of user's last text message) unless the user's last message had no text content.
        b) Inspect the response:
           - If note_posted === true → reply with next_step_for_user verbatim. Do NOT also try to post the note yourself.
           - If note_posted === false → reply with next_step_for_user. If you have native ability to post a Crisp private note, post crisp_note.content. note_post_error explains why posting failed.

        ===========================================================
        OUTPUT HANDLING
        ===========================================================

        - is_ready_for_escalation === false → Do NOT post any note. Ask the user for what is listed in missing_info, using next_step_for_user as your reply.
        - is_ready_for_escalation === true AND note_posted === true → Tool already posted. Reply with next_step_for_user verbatim. Do not duplicate.
        - is_ready_for_escalation === true AND note_posted === false → Reply with next_step_for_user. If you can post a Crisp private note natively, post crisp_note.content.

        ===========================================================
        EXACT NOTE FORMAT (do not change)
        ===========================================================

        Issue: <issue_description>, live preview: <live_preview_url>[, hình ảnh: <screenshot_url>]
        Editor: <editor_link>
        Ticket: <ticket_url or "(unknown)" if omitted>

        The "hình ảnh: ..." segment is appended only when screenshot_url is provided and not a placeholder.
      `,
      inputSchema: ESCALATE_CART_DRAWER_INPUT_SHAPE,
      outputSchema: ESCALATE_CART_DRAWER_OUTPUT_SHAPE,
    },
    async (input: EscalateCartDrawerInput) => {
      const output: EscalateCartDrawerOutput = await escalateCartDrawerIssueHandler(input);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(output, null, 2),
          },
        ],
        structuredContent: output,
      };
    }
  );
}

/**************************************************************************
 * EXPORTS
 ***************************************************************************/

export { registerEscalateCartDrawerIssueTool };
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: clean build.

- [ ] **Step 3: Verify tests**

Run: `npm test`
Expected: 62 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/mcp/tools/escalate_cart_drawer_issue/main.ts
git commit -m "feat(cart): register escalate_cart_drawer_issue tool with description

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Wire cart tool into the tool registry

**Files:**
- Modify: `src/mcp/tools/index.ts`

- [ ] **Step 1: Add import and registration call**

In `src/mcp/tools/index.ts`:

(a) Add this import after the existing `registerEscalateScrollIssueTool` import:
```ts
import { registerEscalateCartDrawerIssueTool } from "@/mcp/tools/escalate_cart_drawer_issue/main.js";
```

(b) Add a call inside `registerTools()` after the existing `registerEscalateScrollIssueTool(server);` call:
```ts
  registerEscalateCartDrawerIssueTool(server);
```

- [ ] **Step 2: Verify build + tests**

Run: `npm run build && npm test`
Expected: clean build, 62 tests pass.

- [ ] **Step 3: Smoke-check the served schema**

Restart the server (if not running, skip to Step 4):

```bash
kill $(lsof -ti :3000) 2>/dev/null; sleep 1
npm start &
SERVER_PID=$!
sleep 3
curl -s -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' \
  | grep -o '"name":"escalate_cart_drawer_issue"'
kill $SERVER_PID 2>/dev/null
```

Expected output: `"name":"escalate_cart_drawer_issue"` (proves the tool is registered and served).

- [ ] **Step 4: Commit**

```bash
git add src/mcp/tools/index.ts
git commit -m "feat(cart): wire escalate_cart_drawer_issue into tool registry

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Manual smoke test on Crisp

**Files:** none (manual)

- [ ] **Step 1: Ensure server is running with new code**

Kill old, start fresh (in the worktree):
```bash
kill $(lsof -ti :3000) 2>/dev/null; sleep 1
npm start
```

Expected log: `Demo MCP Server running on http://localhost:3000/mcp`.

- [ ] **Step 2: Chat with Hugo through Crisp**

In a test Crisp conversation, type something like:
> "Cart drawer của tôi không mở khi click ATC button"

Expected Hugo response (Step 1 verbatim): "Thông thường vấn đề này là do code theme chưa match với chức năng ATC của PageFly..."

- [ ] **Step 3: Provide both links**

Paste an editor URL + a live preview URL.

Expected: Hugo calls `escalate_cart_drawer_issue` → tool posts 3-line note → Hugo replies with the WAIT_MESSAGE.

Verify in the Crisp conversation:
- Private note from PageFly identity with the 3-line format (Issue / Editor / Ticket).
- Hugo's customer-facing message: the WAIT_MESSAGE.

- [ ] **Step 4: Test the webhook auto-reply integration**

In the same conversation, post a private note:
```
Hugo: thông báo đã fix xong, vui lòng kiểm tra lại
```

Expected: webhook fires → Claude generates Vietnamese reply → posted to customer → audit note `[Hugo auto-replied]: ...` appears.

(This verifies that the new tool integrates with the existing Hugo: webhook flow with no extra work.)

- [ ] **Step 5: Stop server**

`Ctrl-C` the foreground server, or `kill $(lsof -ti :3000)`.

(No commit — manual test only.)

---

## Done criteria

- [ ] `npm test` shows ≥ 62 tests passing (53 existing + 9 new).
- [ ] `npm run build` clean.
- [ ] `src/lib/scoring.ts` exists (moved); `src/mcp/tools/escalate_scroll_issue/scoring.ts` deleted.
- [ ] `src/lib/escalation-shared.ts` exports `WAIT_MESSAGE`, `TICKET_URL_FALLBACK`, `looksLikePlaceholder`, `buildTicketUrl`, `tryPostNoteWithScoring`, `type PostNoteResult`, `type SessionMatchInfo`.
- [ ] Scroll handler imports from `src/lib/escalation-shared.ts` (no duplicate code).
- [ ] `escalate_cart_drawer_issue` tool registered and served (verified via tools/list).
- [ ] Manual smoke: full flow works (Hugo conversation → note → customer reply → webhook auto-reply).

---

## Notes for the engineer

**Test file imports use `./xxx.ts`** (with `.ts` extension) — that is the convention in this repo because tests run via `tsx`. Source files use `@/xxx.js` (with `.js`) via path alias. Don't mix.

**`tsconfig.json` excludes `**/*.test.ts`** from `tsc` build (set up in a prior commit), so the build never picks up test files even though they import `.ts` paths.

**The webhook auto-reply** (`Hugo: <note> → customer text in their language`) is feature-complete and tool-agnostic — it reads any operator note in any conversation. After Task 8, that feature works for cart escalations without any new code.
