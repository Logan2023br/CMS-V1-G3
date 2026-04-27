# `diagnose_scroll_issue` MCP Tool — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a pure-escalation MCP tool `diagnose_scroll_issue` that collects screenshot + editor link from a PageFly user reporting scroll problems, returns a 3-line Crisp note (Issue / Editor / Ticket) for Hugo to post, and instructs Hugo to ask the user to wait for the technical team.

**Architecture:** Mirror the file/code structure of `src/mcp/tools/diagnose_font_issue` (3 files: `shapes.ts`, `handler.ts`, `main.ts`). Pure synchronous handler — no network calls, no Crisp API. Conversation flow lives in the tool's `description` field so Hugo follows it directly. Register the tool through the existing `registerTools` pipeline.

**Tech Stack:** TypeScript, Zod (input/output schemas), `@modelcontextprotocol/sdk`. No test framework in this repo — verification is done by `npm run build` + manual exercise through `npm run inspect` (MCP Inspector), matching the existing pattern.

**Spec:** `docs/superpowers/specs/2026-04-27-diagnose-scroll-issue-design.md`

---

## File Structure

| File | Status | Responsibility |
|------|--------|----------------|
| `src/mcp/tools/diagnose_scroll_issue/shapes.ts` | Create | Zod input/output schemas + inferred TS types |
| `src/mcp/tools/diagnose_scroll_issue/handler.ts` | Create | Pure function: validate + format the 3-line Crisp note |
| `src/mcp/tools/diagnose_scroll_issue/main.ts` | Create | Register tool with MCP server, embed Hugo conversation script in `description` |
| `src/mcp/tools/index.ts` | Modify | Import + call `registerDiagnosizeScrollIssueTool(server)` |
| `src/mcp/index.ts` | Modify | Add scroll-issue capability to server `instructions` |

---

## Task 1: Create input/output schemas

**Files:**
- Create: `src/mcp/tools/diagnose_scroll_issue/shapes.ts`

- [ ] **Step 1: Write the schema file**

Create `src/mcp/tools/diagnose_scroll_issue/shapes.ts` with this exact content:

```typescript
/**************************************************************************
 * IMPORTS
 ***************************************************************************/

import { z } from "zod";

/**************************************************************************
 * INPUT SCHEMA
 ***************************************************************************/

const DIAGNOSE_SCROLL_INPUT_SHAPE = z.object({
  issue_description: z
    .string()
    .min(1)
    .describe(
      "Hugo's paraphrase of the user's complaint. Examples: 'Khách hàng không scroll được page', 'Page scroll bị giật ở mobile', 'Scroll bị stuck giữa chừng'."
    ),

  editor_link: z
    .string()
    .url()
    .describe(
      "PageFly editor link provided by the user. Format: https://admin.shopify.com/store/*/apps/pagefly/editor?type=page&id=*"
    ),

  ticket_url: z
    .string()
    .url()
    .describe(
      "Crisp conversation ticket URL pulled from the conversation context. Format: https://app.crisp.chat/website/*/inbox/*"
    ),

  has_screenshot: z
    .boolean()
    .describe(
      "True if Hugo has confirmed the user already sent a screenshot in the conversation. False otherwise — tool will refuse to escalate."
    ),
});

type DiagnosizeScrollInput = z.infer<typeof DIAGNOSE_SCROLL_INPUT_SHAPE>;

/**************************************************************************
 * OUTPUT SCHEMA
 ***************************************************************************/

const CRISP_NOTE = z.object({
  content: z
    .string()
    .describe(
      "Plain-text Crisp note in the exact 3-line format: 'Issue: ...\\nEditor: ...\\nTicket: ...'. Empty string if not ready."
    ),
  formatted_message: z
    .string()
    .describe(
      "Same content, ready to post directly into Crisp. Empty string if not ready."
    ),
});

const DIAGNOSE_SCROLL_OUTPUT_SHAPE = z.object({
  issue_summary: z
    .string()
    .describe("Short summary Hugo can echo back to the user."),

  is_ready_for_escalation: z
    .boolean()
    .describe(
      "True only when has_screenshot is true AND editor_link AND ticket_url are present."
    ),

  missing_info: z
    .array(z.string())
    .describe(
      "List of fields still missing. Possible values: 'screenshot', 'editor_link', 'ticket_url'. Empty when ready."
    ),

  crisp_note: CRISP_NOTE.describe(
    "The note Hugo should post on the Crisp conversation. Empty when not ready."
  ),

  next_step_for_user: z
    .string()
    .describe(
      "Exact sentence Hugo should say to the user next — either a request for missing info, or the wait-for-technical-team message."
    ),
});

type DiagnosizeScrollOutput = z.infer<typeof DIAGNOSE_SCROLL_OUTPUT_SHAPE>;

/**************************************************************************
 * EXPORTS
 ***************************************************************************/

export {
  DIAGNOSE_SCROLL_INPUT_SHAPE,
  DIAGNOSE_SCROLL_OUTPUT_SHAPE,
  type DiagnosizeScrollInput,
  type DiagnosizeScrollOutput,
};
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npm run build`
Expected: Exits 0 with no errors. New compiled files appear under `dist/src/mcp/tools/diagnose_scroll_issue/`.

- [ ] **Step 3: Commit**

```bash
git add src/mcp/tools/diagnose_scroll_issue/shapes.ts
git commit -m "feat(scroll): add zod schemas for diagnose_scroll_issue tool"
```

---

## Task 2: Implement handler logic

**Files:**
- Create: `src/mcp/tools/diagnose_scroll_issue/handler.ts`

- [ ] **Step 1: Write the handler**

Create `src/mcp/tools/diagnose_scroll_issue/handler.ts` with this exact content:

```typescript
/**************************************************************************
 * IMPORTS
 ***************************************************************************/

import type {
  DiagnosizeScrollInput,
  DiagnosizeScrollOutput,
} from "@/mcp/tools/diagnose_scroll_issue/shapes.js";

/**************************************************************************
 * CONSTANTS
 ***************************************************************************/

const WAIT_MESSAGE =
  "Vui lòng chờ vài phút, technical team đang kiểm tra và sẽ phản hồi bạn sớm nhất.";

const MISSING_FIELD_LABEL: Record<string, string> = {
  screenshot: "hình ảnh (screenshot)",
  editor_link: "link editor",
  ticket_url: "ticket URL",
};

/**************************************************************************
 * MAIN HANDLER
 ***************************************************************************/

function diagnosizeScrollIssueHandler(
  input: DiagnosizeScrollInput
): DiagnosizeScrollOutput {
  const missing: string[] = [];

  if (!input.has_screenshot) missing.push("screenshot");
  if (!input.editor_link) missing.push("editor_link");
  if (!input.ticket_url) missing.push("ticket_url");

  if (missing.length > 0) {
    const labels = missing
      .map((key) => MISSING_FIELD_LABEL[key] ?? key)
      .join(", ");

    return {
      issue_summary: "Cần thêm thông tin trước khi escalate cho technical team.",
      is_ready_for_escalation: false,
      missing_info: missing,
      crisp_note: {
        content: "",
        formatted_message: "",
      },
      next_step_for_user: `Vui lòng cung cấp ${labels} để chúng tôi forward đến team technical kiểm tra giúp bạn.`,
    };
  }

  const noteContent =
    `Issue: ${input.issue_description}\n` +
    `Editor: ${input.editor_link}\n` +
    `Ticket: ${input.ticket_url}`;

  return {
    issue_summary: input.issue_description,
    is_ready_for_escalation: true,
    missing_info: [],
    crisp_note: {
      content: noteContent,
      formatted_message: noteContent,
    },
    next_step_for_user: WAIT_MESSAGE,
  };
}

/**************************************************************************
 * EXPORTS
 ***************************************************************************/

export { diagnosizeScrollIssueHandler };
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npm run build`
Expected: Exits 0. No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/mcp/tools/diagnose_scroll_issue/handler.ts
git commit -m "feat(scroll): implement diagnose_scroll_issue handler"
```

---

## Task 3: Register tool with MCP server

**Files:**
- Create: `src/mcp/tools/diagnose_scroll_issue/main.ts`

- [ ] **Step 1: Write the registration file**

Create `src/mcp/tools/diagnose_scroll_issue/main.ts` with this exact content:

```typescript
/**************************************************************************
 * IMPORTS
 ***************************************************************************/

import { diagnosizeScrollIssueHandler } from "@/mcp/tools/diagnose_scroll_issue/handler.js";
import {
  DIAGNOSE_SCROLL_INPUT_SHAPE,
  DIAGNOSE_SCROLL_OUTPUT_SHAPE,
} from "@/mcp/tools/diagnose_scroll_issue/shapes.js";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  DiagnosizeScrollInput,
  DiagnosizeScrollOutput,
} from "@/mcp/tools/diagnose_scroll_issue/shapes.js";

/**************************************************************************
 * TOOL REGISTRATION
 ***************************************************************************/

/**
 * Register the "diagnose_scroll_issue" tool with the MCP server.
 *
 * Pure-escalation tool: collects user-provided screenshot + editor link,
 * then returns a 3-line Crisp note for Hugo to post. Does not attempt to
 * auto-fix the scroll issue — always forwards to the technical team.
 */
function registerDiagnosizeScrollIssueTool(server: McpServer): void {
  server.registerTool(
    "diagnose_scroll_issue",
    {
      title: "Escalate PageFly scroll issue to technical team",
      description: `
        Use this tool when the user reports that their PageFly page does not scroll, scrolls incorrectly, scroll is laggy, scroll is stuck, or any similar scroll-related problem.

        This is a PURE-ESCALATION tool. It does NOT attempt to auto-fix the scroll issue. Instead, it collects information and produces a Crisp note for the technical team to investigate.

        ===========================================================
        REQUIRED INPUTS (all must be present before calling the tool)
        ===========================================================

        1. issue_description — Hugo's paraphrase of the user's complaint, e.g.
             "Khách hàng không scroll được page"
             "Page scroll bị giật ở mobile"
             "Scroll bị stuck giữa chừng"
        2. editor_link — PageFly editor URL the user provided
        3. ticket_url — Crisp conversation ticket URL (Hugo has this from context)
        4. has_screenshot — true ONLY if the user already sent a screenshot in the conversation

        If ANY of (screenshot, editor_link) is missing, ASK the user for it BEFORE calling the tool.

        ===========================================================
        CONVERSATION SCRIPT FOR HUGO
        ===========================================================

        STEP 1 — User reports a scroll issue
        Hugo: "Vui lòng cung cấp hình ảnh và link editor để chúng tôi forward đến team technical kiểm tra giúp bạn."

        STEP 2 — User provides image + editor link
        Hugo: [calls diagnose_scroll_issue with all 4 inputs]
        Hugo: [posts the returned crisp_note.content as a NOTE on the Crisp conversation — this is the Crisp "note" feature]
        Hugo: [says next_step_for_user to the user, which will be the wait-for-technical-team message]

        STEP 3 — User asks to talk to a human BEFORE providing the required info
        Hugo MUST say (do NOT escalate yet):
        "Tôi hiểu bạn cần gặp Human, tuy nhiên vì đây là 2 yếu tố cần thiết để giúp bạn xử lý vấn đề nên vui lòng cung cấp, tôi sẽ giúp bạn chuyển nó đến human và họ sẽ fix giúp bạn."

        STEP 4 — User provides only one of the two pieces
        Hugo: ask for the missing piece. Do NOT call the tool until both are present.

        ===========================================================
        OUTPUT USAGE
        ===========================================================

        - If is_ready_for_escalation === false → Hugo asks the user for what is in missing_info, using next_step_for_user as the prompt. Do NOT post any Crisp note.
        - If is_ready_for_escalation === true → Hugo posts crisp_note.content as a Crisp NOTE (3 lines: Issue / Editor / Ticket), then tells the user next_step_for_user.

        ===========================================================
        EXACT NOTE FORMAT (do not change)
        ===========================================================

        Issue: <issue_description>
        Editor: <editor_link>
        Ticket: <ticket_url>
      `,
      inputSchema: DIAGNOSE_SCROLL_INPUT_SHAPE,
      outputSchema: DIAGNOSE_SCROLL_OUTPUT_SHAPE,
    },
    async (input: DiagnosizeScrollInput) => {
      const output: DiagnosizeScrollOutput = diagnosizeScrollIssueHandler(input);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(output, null, 2),
          },
        ],
        structuredContent: output,
      };
    },
  );
}

/**************************************************************************
 * EXPORTS
 ***************************************************************************/

export { registerDiagnosizeScrollIssueTool };
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npm run build`
Expected: Exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/mcp/tools/diagnose_scroll_issue/main.ts
git commit -m "feat(scroll): register diagnose_scroll_issue tool with conversation script"
```

---

## Task 4: Wire tool into the registration pipeline

**Files:**
- Modify: `src/mcp/tools/index.ts`

- [ ] **Step 1: Add the import**

Open `src/mcp/tools/index.ts`. Find the line:

```typescript
import { registerDiagnosizeFontIssueTool } from "@/mcp/tools/diagnose_font_issue/main.js";
```

Add immediately AFTER it:

```typescript
import { registerDiagnosizeScrollIssueTool } from "@/mcp/tools/diagnose_scroll_issue/main.js";
```

- [ ] **Step 2: Add the registration call**

In the same file, find the line:

```typescript
  registerDiagnosizeFontIssueTool(server);
```

Add immediately AFTER it:

```typescript
  registerDiagnosizeScrollIssueTool(server);
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npm run build`
Expected: Exits 0.

- [ ] **Step 4: Commit**

```bash
git add src/mcp/tools/index.ts
git commit -m "feat(scroll): wire diagnose_scroll_issue into tool registry"
```

---

## Task 5: Update server-level instructions

**Files:**
- Modify: `src/mcp/index.ts`

- [ ] **Step 1: Add the scroll capability to server instructions**

Open `src/mcp/index.ts`. Replace the existing `instructions` string (the multi-line template literal currently inside `new McpServer({...}, { instructions: ... })`) with this exact value:

```typescript
      instructions: `
        This server exposes tools to access the store's database information and to diagnose common PageFly issues. Use it to:
        - Get user data (by ID or email address)
        - Get product information (by ID)
        - Get order details (by ID)
        - Diagnose page-size issues (page exceeding the 256KB limit)
        - Diagnose font issues (live page shows different font than the editor)
        - Escalate scroll issues to the technical team (page does not scroll or scrolls incorrectly)

        Tools can be used succesively to list a user's orders, then get an order details, and then get a product's information.
      `,
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npm run build`
Expected: Exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/mcp/index.ts
git commit -m "feat(scroll): mention scroll-issue tool in server instructions"
```

---

## Task 6: Manual verification through MCP Inspector

**Files:** None (verification only).

- [ ] **Step 1: Build the project**

Run: `npm run build`
Expected: Exits 0. `dist/src/mcp/tools/diagnose_scroll_issue/` contains `main.js`, `handler.js`, `shapes.js`.

- [ ] **Step 2: Launch the inspector**

Run: `npm run inspect`
Expected: Inspector UI opens. The tool list includes `diagnose_scroll_issue`.

- [ ] **Step 3: Verify Test Case A — full happy path**

In the inspector, call `diagnose_scroll_issue` with:

```json
{
  "issue_description": "Khách hàng không scroll được page",
  "editor_link": "https://admin.shopify.com/store/example/apps/pagefly/editor?type=page&id=abc123",
  "ticket_url": "https://app.crisp.chat/website/example-id/inbox/conv-xyz",
  "has_screenshot": true
}
```

Expected `structuredContent`:
- `is_ready_for_escalation`: `true`
- `missing_info`: `[]`
- `crisp_note.content` equals exactly:
  ```
  Issue: Khách hàng không scroll được page
  Editor: https://admin.shopify.com/store/example/apps/pagefly/editor?type=page&id=abc123
  Ticket: https://app.crisp.chat/website/example-id/inbox/conv-xyz
  ```
- `next_step_for_user`: `"Vui lòng chờ vài phút, technical team đang kiểm tra và sẽ phản hồi bạn sớm nhất."`

- [ ] **Step 4: Verify Test Case B — missing screenshot**

Call `diagnose_scroll_issue` with:

```json
{
  "issue_description": "Scroll bị stuck",
  "editor_link": "https://admin.shopify.com/store/example/apps/pagefly/editor?type=page&id=abc123",
  "ticket_url": "https://app.crisp.chat/website/example-id/inbox/conv-xyz",
  "has_screenshot": false
}
```

Expected `structuredContent`:
- `is_ready_for_escalation`: `false`
- `missing_info`: `["screenshot"]`
- `crisp_note.content`: `""`
- `next_step_for_user` contains the substring `"hình ảnh (screenshot)"`

- [ ] **Step 5: Verify Test Case C — invalid editor URL**

Call `diagnose_scroll_issue` with:

```json
{
  "issue_description": "Scroll lỗi",
  "editor_link": "not-a-url",
  "ticket_url": "https://app.crisp.chat/website/example-id/inbox/conv-xyz",
  "has_screenshot": true
}
```

Expected: Inspector shows a Zod validation error on `editor_link` (not a valid URL). The handler is never invoked.

- [ ] **Step 6: Stop the inspector**

Press `Ctrl+C` in the terminal running `npm run inspect`.

- [ ] **Step 7: Final cleanup commit (only if needed)**

If steps 3–5 surfaced any issues that required code changes, fix them and commit:

```bash
git add -A
git commit -m "fix(scroll): address inspector verification findings"
```

If everything passed, no commit is needed for this task.

---

## Self-Review Checklist (run before handing off)

- Spec coverage: every section of `docs/superpowers/specs/2026-04-27-diagnose-scroll-issue-design.md` is implemented by Tasks 1–5; Task 6 covers the manual testing section of the spec.
- Naming consistency: `diagnose_scroll_issue` (tool name), `diagnosizeScrollIssueHandler` (function), `registerDiagnosizeScrollIssueTool` (register fn), `DIAGNOSE_SCROLL_INPUT_SHAPE` / `DIAGNOSE_SCROLL_OUTPUT_SHAPE` (zod), `DiagnosizeScrollInput` / `DiagnosizeScrollOutput` (types) — match the typo `Diagnosize*` already used in the codebase for `diagnose_font_issue` so future-grep stays consistent.
- Note format is plain 3 lines, no emoji, no markdown — matches user's spec exactly.
- Conversation flow (ask for info, redirect human request, post note + wait) lives in the tool's `description` field — Hugo reads it.
