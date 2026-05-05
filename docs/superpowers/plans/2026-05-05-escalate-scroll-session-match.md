# Hybrid Session Matching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tăng độ chính xác khi `escalate_scroll_issue` tự resolve `crisp_session_id` (lúc Hugo không truyền), bằng hybrid scoring nhiều signal (verbatim text + URL + waiting_since) với threshold 50, và đổi list-conversations API sang endpoint có filter `filter_inbox_id=_internal:agent`.

**Architecture:** Tách logic scoring (pure functions) ra module riêng `scoring.ts` để test được độc lập. Handler chỉ giữ phần I/O (fetch list, POST note). Khi Hugo truyền `crisp_session_id`, handler vẫn POST thẳng — bỏ qua hoàn toàn scoring. Threshold dưới 50 → không POST, return error rõ ràng để debug.

**Tech Stack:** TypeScript + Zod (đã có), Node `node:test` runtime + `tsx` loader (đã có tsx ở devDeps).

**Spec:** `docs/superpowers/specs/2026-05-05-escalate-scroll-session-match-design.md`

---

### File structure

- **Create:** `src/mcp/tools/escalate_scroll_issue/scoring.ts` — pure scoring functions
- **Create:** `src/mcp/tools/escalate_scroll_issue/scoring.test.ts` — tests cho scoring
- **Modify:** `src/mcp/tools/escalate_scroll_issue/shapes.ts` — input + output schema
- **Modify:** `src/mcp/tools/escalate_scroll_issue/handler.ts` — endpoint mới, dùng scoring module
- **Modify:** `src/mcp/tools/escalate_scroll_issue/main.ts` — cập nhật mô tả tool để dạy Hugo về `customer_last_message_text`
- **Modify:** `package.json` — thêm script `test`

---

### Task 1: Setup test runner

**Files:**
- Modify: `package.json:8-15` (scripts)

- [ ] **Step 1: Thêm script `test` vào package.json**

```json
"scripts": {
  "test": "node --import tsx --test 'src/**/*.test.ts'",
  ...rest unchanged
}
```

- [ ] **Step 2: Tạo file smoke test tạm để verify runner chạy được**

Create `src/_smoke.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";

test("smoke: node:test runner works", () => {
  assert.equal(1 + 1, 2);
});
```

- [ ] **Step 3: Chạy test, verify pass**

Run: `npm test`
Expected: `# pass 1` (1 test passed).

- [ ] **Step 4: Xoá smoke test**

Delete: `src/_smoke.test.ts`

- [ ] **Step 5: Commit**

```bash
git add package.json
git commit -m "chore(test): add node:test runner via tsx"
```

---

### Task 2: Tạo scoring module skeleton + types

**Files:**
- Create: `src/mcp/tools/escalate_scroll_issue/scoring.ts`

- [ ] **Step 1: Tạo file scoring.ts với types và signature, chưa implement**

```ts
/**************************************************************************
 * TYPES
 ***************************************************************************/

interface ConversationLite {
  session_id?: string;
  updated_at?: number;
  waiting_since?: number | null;
  last_message?: string;
}

interface ScoringInputs {
  customerLastMessageText?: string;
  screenshotUrl?: string;
  editorLink?: string;
}

interface ScoreResult {
  score: number;
  signalsMatched: string[];
}

interface BestSessionResult {
  sessionId: string | null;
  score: number;
  signalsMatched: string[];
  thresholdMet: boolean;
}

const SCORE_THRESHOLD = 50;
const SUBSTRING_MIN_LENGTH = 40;

/**************************************************************************
 * EXPORTS (placeholders — implement in next tasks)
 ***************************************************************************/

function normalize(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function scoreConversation(
  _conv: ConversationLite,
  _inputs: ScoringInputs,
  _isTopWaitingSince: boolean,
  _isTopUpdatedAt: boolean
): ScoreResult {
  throw new Error("not implemented");
}

function findBestSession(
  _conversations: ConversationLite[],
  _inputs: ScoringInputs
): BestSessionResult {
  throw new Error("not implemented");
}

export {
  SCORE_THRESHOLD,
  SUBSTRING_MIN_LENGTH,
  normalize,
  scoreConversation,
  findBestSession,
  type ConversationLite,
  type ScoringInputs,
  type ScoreResult,
  type BestSessionResult,
};
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npm run build`
Expected: build succeeds, no TS errors.

- [ ] **Step 3: Commit**

```bash
git add src/mcp/tools/escalate_scroll_issue/scoring.ts
git commit -m "feat(scroll): scaffold scoring module with types"
```

---

### Task 3: TDD `normalize`

**Files:**
- Create: `src/mcp/tools/escalate_scroll_issue/scoring.test.ts`

- [ ] **Step 1: Viết test cho normalize**

```ts
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
```

- [ ] **Step 2: Chạy test, verify pass**

Run: `npm test`
Expected: 4 tests pass (normalize đã implement đúng ở Task 2).

- [ ] **Step 3: Commit**

```bash
git add src/mcp/tools/escalate_scroll_issue/scoring.test.ts
git commit -m "test(scroll): cover normalize() in scoring module"
```

---

### Task 4: TDD `scoreConversation` — exact text signal

**Files:**
- Modify: `src/mcp/tools/escalate_scroll_issue/scoring.test.ts`
- Modify: `src/mcp/tools/escalate_scroll_issue/scoring.ts:25-32` (scoreConversation body)

- [ ] **Step 1: Viết test cho exact_text signal**

Append to `scoring.test.ts`:
```ts
import { scoreConversation } from "./scoring.ts";

test("scoreConversation: exact_text gives +100", () => {
  const result = scoreConversation(
    { last_message: "Khách hàng không scroll được" },
    { customerLastMessageText: "Khách hàng không scroll được" },
    false,
    false
  );
  assert.equal(result.score, 100);
  assert.deepEqual(result.signalsMatched, ["exact_text"]);
});

test("scoreConversation: exact_text matches after normalize whitespace", () => {
  const result = scoreConversation(
    { last_message: "  Khách hàng   không scroll  được  " },
    { customerLastMessageText: "Khách hàng không scroll được" },
    false,
    false
  );
  assert.equal(result.score, 100);
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
```

- [ ] **Step 2: Chạy test, verify FAIL**

Run: `npm test`
Expected: 4 new tests fail with "not implemented".

- [ ] **Step 3: Implement exact_text trong `scoreConversation`**

Replace function body in `scoring.ts`:
```ts
function scoreConversation(
  conv: ConversationLite,
  inputs: ScoringInputs,
  isTopWaitingSince: boolean,
  isTopUpdatedAt: boolean
): ScoreResult {
  const signalsMatched: string[] = [];
  let score = 0;

  const lastMessage = conv.last_message ?? "";
  const lastMessageNorm = normalize(lastMessage);

  const verbatim = inputs.customerLastMessageText?.trim() ?? "";
  if (verbatim) {
    const verbatimNorm = normalize(verbatim);
    if (lastMessageNorm === verbatimNorm) {
      score += 100;
      signalsMatched.push("exact_text");
    }
  }

  // isTopWaitingSince và isTopUpdatedAt sẽ dùng ở task 6.
  void isTopWaitingSince;
  void isTopUpdatedAt;

  return { score, signalsMatched };
}
```

- [ ] **Step 4: Chạy test, verify PASS**

Run: `npm test`
Expected: all tests pass (4 normalize + 4 exact_text).

- [ ] **Step 5: Commit**

```bash
git add src/mcp/tools/escalate_scroll_issue/scoring.ts src/mcp/tools/escalate_scroll_issue/scoring.test.ts
git commit -m "feat(scroll): score exact_text signal in scoring module"
```

---

### Task 5: TDD `scoreConversation` — substring_text signal

**Files:**
- Modify: `src/mcp/tools/escalate_scroll_issue/scoring.test.ts`
- Modify: `src/mcp/tools/escalate_scroll_issue/scoring.ts` (scoreConversation body)

- [ ] **Step 1: Viết test cho substring_text**

Append to `scoring.test.ts`:
```ts
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

test("scoreConversation: substring_text NOT triggered when overlap < 40 chars", () => {
  const result = scoreConversation(
    { last_message: "hello there friend" },
    { customerLastMessageText: "hello there" },
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
```

- [ ] **Step 2: Chạy test, verify FAIL**

Run: `npm test`
Expected: 5 new tests fail.

- [ ] **Step 3: Implement substring_text logic**

Add helper function near top of `scoring.ts`:
```ts
function hasLongSubstring(haystack: string, needle: string, minLen: number): boolean {
  if (!needle || !haystack) return false;
  if (needle.length < minLen) {
    // Khi verbatim ngắn hơn ngưỡng, yêu cầu haystack chứa nguyên needle.
    return haystack.includes(needle);
  }
  // Trượt cửa sổ độ dài minLen trên needle, check xem haystack có chứa cửa sổ nào không.
  for (let i = 0; i + minLen <= needle.length; i++) {
    const window = needle.slice(i, i + minLen);
    if (haystack.includes(window)) return true;
  }
  return false;
}
```

Add substring scoring inside `scoreConversation`, after the exact_text block:
```ts
  if (verbatim) {
    const verbatimNorm = normalize(verbatim);
    if (hasLongSubstring(lastMessageNorm, verbatimNorm, SUBSTRING_MIN_LENGTH)) {
      score += 60;
      signalsMatched.push("substring_text");
    }
  }
```

- [ ] **Step 4: Chạy test, verify PASS**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/mcp/tools/escalate_scroll_issue/scoring.ts src/mcp/tools/escalate_scroll_issue/scoring.test.ts
git commit -m "feat(scroll): score substring_text signal with sliding window"
```

---

### Task 6: TDD `scoreConversation` — URL signals + recency signals

**Files:**
- Modify: `src/mcp/tools/escalate_scroll_issue/scoring.test.ts`
- Modify: `src/mcp/tools/escalate_scroll_issue/scoring.ts` (scoreConversation body)

- [ ] **Step 1: Viết test cho url + recency signals**

Append to `scoring.test.ts`:
```ts
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
  // 100 (exact) + 60 (substring) + 50 + 50 (urls) + 20 + 5 (recency) = 285
  assert.equal(result.score, 285);
});
```

- [ ] **Step 2: Chạy test, verify FAIL**

Run: `npm test`
Expected: 6 new tests fail.

- [ ] **Step 3: Implement url + recency signals**

Add inside `scoreConversation`, after substring block:
```ts
  if (inputs.screenshotUrl && lastMessage.includes(inputs.screenshotUrl)) {
    score += 50;
    signalsMatched.push("url_screenshot");
  }
  if (inputs.editorLink && lastMessage.includes(inputs.editorLink)) {
    score += 50;
    signalsMatched.push("url_editor");
  }
  if (isTopWaitingSince) {
    score += 20;
    signalsMatched.push("waiting_since_top");
  }
  if (isTopUpdatedAt) {
    score += 5;
    signalsMatched.push("updated_at_top");
  }
```

(Lưu ý: URL match chạy trên `lastMessage` raw, không qua normalize — tránh trường hợp normalize làm hỏng URL.)

- [ ] **Step 4: Chạy test, verify PASS**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/mcp/tools/escalate_scroll_issue/scoring.ts src/mcp/tools/escalate_scroll_issue/scoring.test.ts
git commit -m "feat(scroll): score url and recency signals"
```

---

### Task 7: TDD `findBestSession` — chọn top + threshold + tiebreaker

**Files:**
- Modify: `src/mcp/tools/escalate_scroll_issue/scoring.test.ts`
- Modify: `src/mcp/tools/escalate_scroll_issue/scoring.ts:34-39` (findBestSession body)

- [ ] **Step 1: Viết test cho findBestSession**

Append to `scoring.test.ts`:
```ts
import { findBestSession } from "./scoring.ts";

test("findBestSession: chooses conversation with highest score", () => {
  const result = findBestSession(
    [
      { session_id: "low", last_message: "unrelated", waiting_since: 100, updated_at: 200 },
      { session_id: "high", last_message: "https://prnt.sc/abc", waiting_since: 50, updated_at: 100 },
    ],
    { screenshotUrl: "https://prnt.sc/abc" }
  );
  assert.equal(result.sessionId, "high");
  assert.equal(result.thresholdMet, true);
});

test("findBestSession: threshold reject when top score < 50", () => {
  const result = findBestSession(
    [
      { session_id: "weak", last_message: "", waiting_since: 200, updated_at: 200 },
    ],
    {}
  );
  // weak chỉ score 25 (waiting_since_top + updated_at_top)
  assert.equal(result.thresholdMet, false);
  assert.equal(result.sessionId, null);
  assert.equal(result.score, 25);
});

test("findBestSession: tiebreaker — waiting_since DESC wins ties", () => {
  const result = findBestSession(
    [
      { session_id: "older", last_message: "https://prnt.sc/abc", waiting_since: 100, updated_at: 100 },
      { session_id: "newer", last_message: "https://prnt.sc/abc", waiting_since: 200, updated_at: 50 },
    ],
    { screenshotUrl: "https://prnt.sc/abc" }
  );
  assert.equal(result.sessionId, "newer");
});

test("findBestSession: tiebreaker — updated_at DESC wins when waiting_since equal", () => {
  const result = findBestSession(
    [
      { session_id: "older", last_message: "https://prnt.sc/abc", waiting_since: 100, updated_at: 100 },
      { session_id: "newer", last_message: "https://prnt.sc/abc", waiting_since: 100, updated_at: 200 },
    ],
    { screenshotUrl: "https://prnt.sc/abc" }
  );
  assert.equal(result.sessionId, "newer");
});

test("findBestSession: empty list returns null", () => {
  const result = findBestSession([], {});
  assert.equal(result.sessionId, null);
  assert.equal(result.thresholdMet, false);
  assert.equal(result.score, 0);
});

test("findBestSession: surfaces signals matched on winner", () => {
  const result = findBestSession(
    [
      {
        session_id: "win",
        last_message: "https://prnt.sc/abc https://pagefly.io/editor/xyz",
        waiting_since: 100,
        updated_at: 100,
      },
    ],
    {
      screenshotUrl: "https://prnt.sc/abc",
      editorLink: "https://pagefly.io/editor/xyz",
    }
  );
  assert.equal(result.sessionId, "win");
  assert.ok(result.signalsMatched.includes("url_screenshot"));
  assert.ok(result.signalsMatched.includes("url_editor"));
});
```

- [ ] **Step 2: Chạy test, verify FAIL**

Run: `npm test`
Expected: 6 new tests fail with "not implemented".

- [ ] **Step 3: Implement findBestSession**

Replace function body in `scoring.ts`:
```ts
function findBestSession(
  conversations: ConversationLite[],
  inputs: ScoringInputs
): BestSessionResult {
  if (conversations.length === 0) {
    return { sessionId: null, score: 0, signalsMatched: [], thresholdMet: false };
  }

  // Tìm top waiting_since và top updated_at trong toàn list (chỉ 1 winner mỗi loại).
  let topWaitingId: string | undefined;
  let topWaitingValue = -Infinity;
  for (const c of conversations) {
    if (typeof c.waiting_since === "number" && c.waiting_since > topWaitingValue) {
      topWaitingValue = c.waiting_since;
      topWaitingId = c.session_id;
    }
  }

  let topUpdatedId: string | undefined;
  let topUpdatedValue = -Infinity;
  for (const c of conversations) {
    if (typeof c.updated_at === "number" && c.updated_at > topUpdatedValue) {
      topUpdatedValue = c.updated_at;
      topUpdatedId = c.session_id;
    }
  }

  const scored = conversations.map((c) => ({
    conv: c,
    result: scoreConversation(
      c,
      inputs,
      c.session_id !== undefined && c.session_id === topWaitingId,
      c.session_id !== undefined && c.session_id === topUpdatedId
    ),
  }));

  // Sort: score DESC, waiting_since DESC, updated_at DESC
  scored.sort((a, b) => {
    if (b.result.score !== a.result.score) return b.result.score - a.result.score;
    const aw = a.conv.waiting_since ?? -Infinity;
    const bw = b.conv.waiting_since ?? -Infinity;
    if (bw !== aw) return bw - aw;
    const au = a.conv.updated_at ?? -Infinity;
    const bu = b.conv.updated_at ?? -Infinity;
    return bu - au;
  });

  const top = scored[0];
  const thresholdMet = top.result.score >= SCORE_THRESHOLD;

  return {
    sessionId: thresholdMet ? top.conv.session_id ?? null : null,
    score: top.result.score,
    signalsMatched: top.result.signalsMatched,
    thresholdMet,
  };
}
```

- [ ] **Step 4: Chạy test, verify PASS**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/mcp/tools/escalate_scroll_issue/scoring.ts src/mcp/tools/escalate_scroll_issue/scoring.test.ts
git commit -m "feat(scroll): findBestSession with threshold and tiebreaker"
```

---

### Task 8: Update input schema

**Files:**
- Modify: `src/mcp/tools/escalate_scroll_issue/shapes.ts:11-48`

- [ ] **Step 1: Thêm field `customer_last_message_text` vào input schema**

Trong `ESCALATE_SCROLL_INPUT_SHAPE`, sau field `crisp_session_id` thêm:
```ts
  customer_last_message_text: z
    .string()
    .optional()
    .describe(
      "Verbatim text của tin nhắn CUỐI CÙNG mà user gửi trong cuộc hội thoại này. Copy nguyên xi — KHÔNG paraphrase, KHÔNG trim, KHÔNG sửa typo, KHÔNG dịch. Tool dùng text này để tìm đúng conversation khi crisp_session_id không có. Bỏ qua field này nếu tin nhắn cuối là attachment/file (không có text)."
    ),
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npm run build`
Expected: build OK.

- [ ] **Step 3: Commit**

```bash
git add src/mcp/tools/escalate_scroll_issue/shapes.ts
git commit -m "feat(scroll): add customer_last_message_text input field"
```

---

### Task 9: Update output schema (`session_match` block)

**Files:**
- Modify: `src/mcp/tools/escalate_scroll_issue/shapes.ts` (after CRISP_NOTE)

- [ ] **Step 1: Thêm SESSION_MATCH schema và gắn vào output**

Trên `ESCALATE_SCROLL_OUTPUT_SHAPE`, sau `CRISP_NOTE`, thêm:
```ts
const SESSION_MATCH = z.object({
  score: z
    .number()
    .describe("Tổng điểm scoring của conversation được chọn (hoặc cao nhất nếu không cái nào đạt threshold)."),
  signals_matched: z
    .array(z.string())
    .describe(
      "Signal đã match: 'exact_text', 'substring_text', 'url_screenshot', 'url_editor', 'waiting_since_top', 'updated_at_top'."
    ),
  threshold_met: z
    .boolean()
    .describe("True nếu top score ≥ 50 và tool đã post note. False nếu dưới threshold (note KHÔNG được post)."),
});
```

Trong `ESCALATE_SCROLL_OUTPUT_SHAPE`, sau `note_post_error`, thêm:
```ts
  session_match: SESSION_MATCH.optional().describe(
    "Chi tiết session matching khi tool tự resolve crisp_session_id. Không có khi Hugo truyền crisp_session_id trực tiếp."
  ),
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npm run build`
Expected: build OK.

- [ ] **Step 3: Commit**

```bash
git add src/mcp/tools/escalate_scroll_issue/shapes.ts
git commit -m "feat(scroll): add session_match block to output schema"
```

---

### Task 10: Đổi list-conversations endpoint sang filter inbox + xoá logic match cũ

**Files:**
- Modify: `src/mcp/tools/escalate_scroll_issue/handler.ts:117-206`

- [ ] **Step 1: Xoá hàm `findLatestActiveSession` và import scoring module**

Tại đầu file `handler.ts`, sau import shapes, thêm:
```ts
import {
  findBestSession,
  type ConversationLite,
} from "@/mcp/tools/escalate_scroll_issue/scoring.js";
```

Xoá toàn bộ:
- Block comment "Crisp's conversation list API returns last_message…" (lines 117-130)
- `interface ConversationLite { ... }` (lines 131-136) — đã import từ scoring.ts
- Hàm `findLatestActiveSession` (lines 138-206)

- [ ] **Step 2: Tạo hàm mới `fetchHugoConversations`**

Thêm vào handler.ts, vị trí đã xoá:
```ts
const HUGO_INBOX_FILTER = "_internal:agent";

interface FetchListResult {
  conversations: ConversationLite[];
  error?: string;
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
      const body = await response.text();
      return {
        conversations: [],
        error: `Crisp list-conversations ${response.status}: ${body.slice(0, 300)}`,
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
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npm run build`
Expected: build OK (sẽ có warning unused vì `tryPostNote` chưa cập nhật — fix ở task tiếp).

- [ ] **Step 4: Commit**

```bash
git add src/mcp/tools/escalate_scroll_issue/handler.ts
git commit -m "feat(scroll): list conversations via filter_inbox_id=_internal:agent"
```

---

### Task 11: Wire scoring vào `tryPostNote` + surface `session_match`

**Files:**
- Modify: `src/mcp/tools/escalate_scroll_issue/handler.ts` (PostNoteResult, tryPostNote, escalateScrollIssueHandler)

- [ ] **Step 1: Mở rộng `PostNoteResult` type để mang session_match**

Thay block:
```ts
interface PostNoteResult {
  posted: boolean;
  error?: string;
  sessionUsed?: string;
  sessionSource?: "input" | "auto-latest";
}
```

bằng:
```ts
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
}
```

- [ ] **Step 2: Thay nội dung `tryPostNote` để dùng scoring**

Thay nguyên hàm `tryPostNote` bằng:
```ts
async function tryPostNote(
  hintedSessionId: string | undefined,
  content: string,
  scoringInputs: {
    customerLastMessageText?: string;
    screenshotUrl?: string;
    editorLink?: string;
  }
): Promise<PostNoteResult> {
  const creds = readCrispCreds();
  if (!creds) {
    return {
      posted: false,
      error:
        "Crisp API credentials not configured (set CRISP_WEBSITE_ID, CRISP_IDENTIFIER, CRISP_KEY in .env).",
    };
  }

  // 1) Hugo truyền session_id → POST thẳng, không cần scoring.
  if (hintedSessionId) {
    const r = await postCrispPrivateNote(hintedSessionId, content, creds);
    if (r.ok) {
      return { posted: true, sessionUsed: hintedSessionId, sessionSource: "input" };
    }
    return {
      posted: false,
      error: `Posting to provided session ${hintedSessionId} failed: ${r.error}`,
      sessionUsed: hintedSessionId,
      sessionSource: "input",
    };
  }

  // 2) Auto-resolve qua hybrid scoring.
  const list = await fetchHugoConversations(creds);
  if (list.error) {
    return { posted: false, error: list.error };
  }
  if (list.conversations.length === 0) {
    return {
      posted: false,
      error: "Hugo's inbox không có conversation nào để match.",
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
    };
  }

  const r = await postCrispPrivateNote(best.sessionId, content, creds);
  if (r.ok) {
    return {
      posted: true,
      sessionUsed: best.sessionId,
      sessionSource: "scored",
      match: matchInfo,
    };
  }
  return {
    posted: false,
    error: `Auto-resolved session ${best.sessionId} (score ${best.score}, signals [${best.signalsMatched.join(", ")}]) but POSTing failed: ${r.error}`,
    sessionUsed: best.sessionId,
    sessionSource: "scored",
    match: matchInfo,
  };
}
```

- [ ] **Step 3: Cập nhật caller trong `escalateScrollIssueHandler` và surface session_match ra output**

Thay block:
```ts
  const matchTokens = [input.screenshot_url, input.editor_link].filter(
    (s): s is string => typeof s === "string" && s.length > 0
  );
  const noteResult: PostNoteResult = await tryPostNote(
    input.crisp_session_id,
    noteContent,
    matchTokens
  );
```

bằng:
```ts
  const noteResult: PostNoteResult = await tryPostNote(
    input.crisp_session_id,
    noteContent,
    {
      customerLastMessageText: input.customer_last_message_text,
      screenshotUrl: input.screenshot_url,
      editorLink: input.editor_link,
    }
  );
```

Cập nhật log line:
```ts
  if (noteResult.posted) {
    console.log(
      `[escalate_scroll_issue] match: session=${noteResult.sessionUsed} source=${noteResult.sessionSource} score=${noteResult.match?.score ?? "n/a"} signals=[${noteResult.match?.signalsMatched.join(", ") ?? ""}] posted=true`
    );
  } else {
    console.error(
      `[escalate_scroll_issue] match: posted=false error=${noteResult.error}`
    );
  }
```

Cập nhật return statement (success path):
```ts
  return {
    issue_summary: input.issue_description,
    is_ready_for_escalation: true,
    missing_info: [],
    crisp_note: {
      content: noteContent,
      formatted_message: noteContent,
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
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npm run build`
Expected: build OK, no warnings about unused imports/symbols.

- [ ] **Step 5: Chạy unit tests xác nhận không break gì**

Run: `npm test`
Expected: all scoring tests vẫn pass.

- [ ] **Step 6: Commit**

```bash
git add src/mcp/tools/escalate_scroll_issue/handler.ts
git commit -m "feat(scroll): use hybrid scoring + surface session_match in output"
```

---

### Task 12: Cập nhật mô tả tool trong main.ts để dạy Hugo về `customer_last_message_text`

**Files:**
- Modify: `src/mcp/tools/escalate_scroll_issue/main.ts:55-69` (INPUTS section)

- [ ] **Step 1: Thêm hướng dẫn về `customer_last_message_text` vào INPUTS**

Trong description, sau dòng `crisp_session_id`, thêm:
```
        - customer_last_message_text (optional but STRONGLY recommended) — Copy nguyên xi tin nhắn CUỐI CÙNG của user trong conversation này. KHÔNG paraphrase, KHÔNG dịch, KHÔNG sửa typo, KHÔNG trim. Tool dùng text này để tìm đúng conversation khi crisp_session_id không có. Bỏ qua field này nếu tin nhắn cuối là attachment/file (không có text).
```

- [ ] **Step 2: Cập nhật STEP 4 để Hugo biết truyền field mới**

Thay:
```
        a) Call escalate_scroll_issue with: issue_description, editor_link, screenshot_url. Include ticket_url and crisp_session_id if you have them.
```

bằng:
```
        a) Call escalate_scroll_issue with: issue_description, editor_link, screenshot_url. Include ticket_url and crisp_session_id if you have them. ALWAYS include customer_last_message_text (verbatim copy of user's last text message) unless the user's last message had no text content.
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: build OK.

- [ ] **Step 4: Commit**

```bash
git add src/mcp/tools/escalate_scroll_issue/main.ts
git commit -m "feat(scroll): teach Hugo to pass customer_last_message_text"
```

---

### Task 13: Manual smoke test

**Files:** none (manual)

- [ ] **Step 1: Start dev server**

Run: `npm run dev`
Expected: server boots, `[mcp] registered tool: escalate_scroll_issue` log line.

- [ ] **Step 2: Inspect tool schema with MCP inspector**

In another terminal: `npm run inspect`
Connect via stdio, list tools, expand `escalate_scroll_issue`. Verify:
- Input has `customer_last_message_text` field with the verbatim instruction.
- Output has `session_match` block.

- [ ] **Step 3: Document smoke result**

Add a one-line PR/commit note describing what was verified manually. No code change.

- [ ] **Step 4: Stop dev server**

Ctrl-C the `npm run dev` process.

(Không có step commit ở task này — chỉ là manual verify.)

---

## Done criteria

- [ ] `npm test` xanh, ≥ 25 unit tests covering scoring/findBestSession.
- [ ] `npm run build` không lỗi/cảnh báo TypeScript.
- [ ] `findLatestActiveSession` đã bị xoá hoàn toàn khỏi handler.ts.
- [ ] List conversation API gọi với `?filter_inbox_id=_internal:agent`.
- [ ] Output có `session_match` khi tool tự resolve, không có khi Hugo truyền `crisp_session_id`.
- [ ] Khi top score < 50, tool trả error rõ và **không** post note (verified bằng test `findBestSession`).
- [ ] Tool description trong main.ts dạy Hugo về `customer_last_message_text`.

---

## Migration path khi Crisp expose session_id cho Hugo

(Không nằm trong plan này — chỉ ghi chú để sau làm:)

1. Đổi `crisp_session_id` từ `optional` → `required` trong shapes.ts.
2. Xoá `customer_last_message_text` field.
3. Xoá file `scoring.ts` + `scoring.test.ts`.
4. Xoá `fetchHugoConversations` trong handler.ts.
5. Xoá block `session_match` trong output schema.
6. Đơn giản hoá `tryPostNote` còn 1 path duy nhất (POST thẳng).

Toàn bộ scope task 2-7 và 9-11 sẽ revert được sạch.
