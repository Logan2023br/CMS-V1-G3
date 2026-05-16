# Design — Shared Store Access Flow

## Mục tiêu

Build 1 lần shared infrastructure cho việc kiểm tra + xin Shopify store access trong escalate_* tools. Bất kỳ tool nào tick "cần access" trong template chỉ cần gọi 1 helper là tự kích hoạt flow — không phải copy logic.

## Vấn đề cần giải quyết

Hiện 3 escalate_* tools (scroll, cart, apps) bypass việc kiểm tra access. TS không biết liệu họ có quyền vào store để debug hay không cho đến khi mở ticket. Một số issue (bundle apps, backend bugs, theme code) bắt buộc phải có collaborator access — nếu không thì TS bị stuck.

User wants: tool nào cần access → trước khi escalate, tool tự:
1. Check Crisp meta API xem khách đã grant access chưa.
2. Nếu rồi → escalate bình thường.
3. Nếu chưa → post `@Logan` note cho TS để xin access, đồng thời báo khách "đang xin access, đợi nhé". TS xin xong post `Hugo: đã xin access xong` → webhook tự gửi khách English instruction (đã dịch sang ngôn ngữ khách).

Flow này build 1 lần — 150 tools tự dùng khi cần.

## Phạm vi

**In-scope:**
- Helper `fetchConversationMeta(sessionId, creds)` trong `src/lib/crisp.ts`.
- Module mới `src/lib/store-access.ts`:
  - `hasStoreAccess(meta): boolean` — pure function.
  - `requireStoreAccess(sessionId): Promise<{ready: true} | {ready: false, output}>` — orchestrator.
  - Constants: `AT_LOGAN_NOTE_CONTENT`, `ACCESS_PENDING_WAIT_MESSAGE_*` (VI/EN).
- Webhook handler pattern match (`src/webhooks/note-forwarder.ts`):
  - Detect `Hugo: đã xin access xong` prefix.
  - Bypass standard Claude diễn giải → send dedicated `ENGLISH_ACCESS_INSTRUCTIONS` translated to customer's language.
- Translate function in `src/lib/anthropic.ts`: `translatePreservingFormat(systemPromptHint, body, customerMessages) → text`.
- Unit tests cho `hasStoreAccess`, pattern-match logic, prompt builder.

**Out-of-scope:**
- KHÔNG modify scroll/cart/apps tools (those don't need access).
- KHÔNG hardcode list of tools that need access — tool tự opt-in bằng cách call `requireStoreAccess`.
- KHÔNG retry meta API trên lỗi (fail-safe: treat fail as "no access").
- KHÔNG deduplicate @Logan notes — re-post nếu re-check vẫn no access (TS sees duplicate, idempotent action).

## Kiến trúc

### File structure

**New:**
- `src/lib/store-access.ts` — orchestrator + constants + types.
- `src/lib/store-access.test.ts` — unit tests for pure functions + pattern matcher.

**Modified:**
- `src/lib/crisp.ts` — add `fetchConversationMeta` + types.
- `src/lib/anthropic.ts` — add `translateAccessInstructions` function (or reuse existing translate primitive).
- `src/webhooks/note-forwarder.ts` — pattern match `Hugo: đã xin access xong` BEFORE generic Claude path.

### Crisp meta API

```
GET https://api.crisp.chat/v1/website/{websiteId}/conversation/{sessionId}/meta
Authorization: Basic <CRISP_IDENTIFIER:CRISP_KEY>
X-Crisp-Tier: plugin
```

Response shape (relevant fields):
```json
{
  "error": false,
  "reason": "resolved",
  "data": {
    "nickname": "...",
    "email": "...",
    "data": {
      "store_access": "https://partners.shopify.com/.../stores/...",
      "store_url": "a8O751.myshopify.com",
      "store_name": "Zen Petals",
      ...
    },
    "device": { ... }
  }
}
```

`store_access` is nested at `data.data.store_access`. Non-empty string = access granted; empty / missing / not-a-string = no access.

### `requireStoreAccess` contract

```ts
type AccessCheckResult =
  | { ready: true }
  | {
      ready: false;
      output: {
        is_ready_for_escalation: false;
        missing_info: ["store_access"];
        crisp_note: { content: ""; formatted_message: "" };
        next_step_for_user: string;  // already in customer's language
        note_posted: boolean;        // true if @Logan note was posted
        note_post_error?: string;
        session_match?: SessionMatchInfo;
      };
    };

async function requireStoreAccess(
  sessionId: string,
  customerLastMessageText?: string
): Promise<AccessCheckResult>;
```

Implementation flow:
1. If sessionId empty → return `{ready: false, output: <wait message>, note_posted: false, error: "session_id missing"}`.
2. Read creds via `readCrispCreds`. Missing creds → `{ready: false, ... error: "creds missing"}`.
3. Call `fetchConversationMeta(sessionId, creds)`.
4. On any error / 5xx / missing field → fall through to "no access" path (Q3 = A fail-safe).
5. Parse `data.data.store_access`. If non-empty string → return `{ready: true}`.
6. Post `@Logan` note via `postCrispPrivateNote` with content = `AT_LOGAN_NOTE_CONTENT` constant.
7. Pick wait message based on `customerLastMessageText` Vietnamese diacritics:
   - VI: "Mình đang xin access store để team technical kiểm tra, bạn vui lòng đợi nhé 😊"
   - EN: "I'm requesting access to your store so our technical team can check, please give us a few minutes 😊"
8. Return `{ready: false, output: { note_posted: true, next_step_for_user: <wait>, ... }}`.

### Per-tool integration

Tool's handler at top:

```ts
import { requireStoreAccess } from "@/lib/store-access.js";

async function escalateXxxHandler(input: EscalateXxxInput): Promise<EscalateXxxOutput> {
  const access = await requireStoreAccess(
    input.crisp_session_id ?? "",
    input.customer_last_message_text
  );
  if (!access.ready) {
    return {
      issue_summary: "Need store access before escalating to the technical team.",
      ...access.output,
    } as EscalateXxxOutput;
  }
  // existing flow: validate inputs, post note, etc.
}
```

Tool description (in `main.ts`): a paragraph that explains the access flow to Hugo:
> "This issue requires Shopify store access. The tool will automatically check whether access has been granted. If not, it posts a note for the TS team and returns a wait message — relay that to the customer verbatim. The customer accepting access does NOT require any action from you; the system handles it. Once granted, the customer will tell you so — call this tool again with the same args to proceed."

### Webhook pattern match

In `src/webhooks/note-forwarder.ts` `forwardNoteToCustomer`, BEFORE the generic prompt build:

```ts
const accessAcknowledged = stripSlackBridgePrefix(noteContent)
  .trim()
  .toLowerCase()
  .startsWith("hugo: đã xin access xong");

if (accessAcknowledged) {
  // ... fetch customer messages for language detection
  const translated = await translateAccessInstructions(customerMessages);
  // Post text + audit note
  // Return early — skip standard Claude path
  return;
}
```

### Fixed access-instruction text

```
I need to access your store administration to take a look and just sent a collaborator access request. Minimum permissions are requested. Just enough for us to examine the issue.

If you are ok with that, please visit your Shopify Dashboard => Check the notification, and accept the request.
You will see our request like this: https://drive.google.com/file/d/1dZijbCDVp_F57MG3RArK2-DaItN84hEF/view

Once you have accepted the request, please leave a message here to let me know and I will assist you right away!
```

Translation strategy: send to Claude with system prompt:

> "You translate this access-request instruction message to the customer's language detected from their recent messages. Preserve the URL exactly. Preserve the 'Shopify Dashboard' / 'collaborator access' / 'notification' technical terms. Preserve line breaks. Output only the translation."

### `@Logan` note text (fixed)

```
@Logan vui lòng xin access store này. Các access cần thiết là: Home, Products, Customers, Discounts, Content, Online Store, App Development, Store settings, Manage and install apps and channels
```

This stays in Vietnamese — it's for the Vietnamese TS team. No translation.

## Edge cases

| Case | Behavior |
|---|---|
| Crisp meta API 5xx / timeout / network fail | Treat as "no access" → post @Logan + wait msg |
| Meta API 404 (session_not_found) | Treat as "no access" (likely real issue worth flagging) |
| Hugo calls tool repeatedly while access pending | Each call: re-check meta, post @Logan again if still no access. TS sees duplicates, idempotent |
| Hugo calls tool AFTER access granted but before customer confirms verbally | Tool proceeds to escalate (access is the gate, not customer's words) |
| Customer chats Vietnamese, accessed instructions sent in VI via Claude translate | Claude must preserve URL + technical terms |
| `customer_last_message_text` empty / not provided | Default to English wait message |
| `crisp_session_id` empty | Return `{ready: false, error: "session_id missing"}`; don't post @Logan note (no session to post to) |

## Testing

**Unit tests** (`src/lib/store-access.test.ts`):

- `hasStoreAccess(meta)`:
  - non-empty URL string → true
  - empty string → false
  - undefined → false
  - object / null / number → false (defensive)
- `pickAccessPendingWaitMessage(customerText)`:
  - Vietnamese diacritics → VI
  - English/empty → EN

**Webhook integration tests** (`src/webhooks/note-forwarder.test.ts` extension or new file):

- Note content `Hugo: đã xin access xong` (with/without Slack-bridge prefix) → triggers fixed-text path.
- Note content `Hugo: vui lòng hỏi khách info` → goes to standard Claude path (no regression).

**Mocking strategy**: stub `fetchConversationMeta` and `postCrispPrivateNote` for orchestrator tests.

## Migration / rollout

- Existing 3 tools don't change — they don't tick "cần access".
- When first tool needing access is built (future), it imports `requireStoreAccess` and uses 1 short snippet at handler top.
- Webhook is global — applies to ALL conversations automatically.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Crisp meta API rate limiting | One call per tool invocation; matches existing API usage volume. If rate-limited, fail-safe degrades gracefully (post @Logan = noise but correct) |
| Customer language detection wrong → instruction translated to wrong language | Customer always understands the link + sees similar terminology; minor UX issue. Worst case: customer sees their own language even if not native. |
| @Logan note duplicates if Hugo calls tool repeatedly | TS sees multiple identical @Logan notes — acceptable noise. Could add idempotency later if it becomes a problem. |
| Pattern match `Hugo: đã xin access xong` is fragile (TS might type slightly different wording) | Spec: tool description for tools that use this flow tells Hugo / instructs TS to use the exact phrase. If false-negatives become common, expand to substring match or add a second variant pattern. |

## Implementation order (preview for plan)

1. `fetchConversationMeta` + types in `crisp.ts`.
2. `hasStoreAccess` pure function + tests.
3. Constants (@Logan note, wait messages, English instructions) + `pickAccessPendingWaitMessage`.
4. `translateAccessInstructions` Claude wrapper.
5. `requireStoreAccess` orchestrator + tests (mocked).
6. Webhook pattern match in `note-forwarder.ts` + tests.
7. Manual smoke (deferred until a tool that uses this flow is built — out of scope for this feature).

## Tool integration snippet (copy-paste reference)

When building a new `escalate_<category>_issue` tool whose template B3 is ticked as "Cần Shopify collaborator access", add this at the top of `handler.ts`:

```ts
import { requireStoreAccess } from "@/lib/store-access.js";

async function escalateXxxIssueHandler(input: EscalateXxxInput): Promise<EscalateXxxOutput> {
  const access = await requireStoreAccess(
    input.crisp_session_id ?? "",
    input.customer_last_message_text
  );
  if (!access.ready) {
    return {
      issue_summary: "Need Shopify store access before escalating to the technical team.",
      session_match: undefined,
      ...access.output,
    } as EscalateXxxOutput;
  }
  // ... existing missing-info gate + post-note flow ...
}
```

And in `main.ts` tool description, add this paragraph in the WHAT YOU MUST DO section:

> "This issue requires Shopify store access. When you call this tool, it automatically checks whether collaborator access has been granted. If not, the tool posts a private note for the TS team to request access and returns a wait message — relay `next_step_for_user` to the customer verbatim. The system handles the access flow automatically; once granted, the customer will tell you they accepted — at that point call this tool again with the same arguments to proceed."
