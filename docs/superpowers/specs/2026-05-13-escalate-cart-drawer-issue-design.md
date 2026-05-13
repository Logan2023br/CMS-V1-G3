# Design — `escalate_cart_drawer_issue` MCP Tool

## Mục tiêu

Thêm tool MCP mới giúp Hugo xử lý báo cáo lỗi cart drawer / ATC (Add-to-Cart) từ user. Cấu trúc tool đồng nhất với `escalate_scroll_issue` — pure escalation, không tự fix. Trả về Crisp private note 3 dòng và message wait cho khách.

## Vấn đề cần giải quyết

Khi user PageFly báo các tình huống thường gặp:
- "Cart drawer không hoạt động / không mở"
- "Click ATC nhưng cart không update, phải reload page"
- "Click ATC nhưng cart drawer không mở và update"

Hiện tại Hugo chưa có tool riêng cho case này. Cần một tool tương tự `escalate_scroll_issue` để:
1. Thu thập đủ thông tin (editor link + live preview link).
2. Post Crisp private note theo format chuẩn để TS xử lý.
3. Trả lời user message wait.

Sau khi tool post note, feature `Hugo: note → auto-reply customer` (đã build trước đó) sẽ tự động xử khi TS để note `Hugo: ...` trong cùng conversation — không cần code mới cho luồng phản hồi.

## Phạm vi

**In-scope**:
- Tool `escalate_cart_drawer_issue` với 3 file (`main.ts`, `handler.ts`, `shapes.ts`).
- Refactor `src/mcp/tools/escalate_scroll_issue/scoring.ts` → `src/lib/scoring.ts` (shared 2+ tools).
- Extract 3 helpers từ `escalate_scroll_issue/handler.ts` → `src/lib/escalation-shared.ts`: `looksLikePlaceholder`, `buildTicketUrl`, `formatNoteContent`-style note builder.
- Cập nhật scroll handler để import từ shared locations.
- Đăng ký tool mới trong tool registry.

**Out-of-scope**:
- KHÔNG đụng feature webhook auto-reply (đã hoạt động, sẽ tự fire cho note của tool mới).
- KHÔNG implement chức năng tự fix code theme.
- KHÔNG validate URL hợp lệ theo cấu trúc cụ thể (chỉ check placeholder).

## Kiến trúc

### Files mới
- `src/mcp/tools/escalate_cart_drawer_issue/main.ts` — registration + tool description (Hugo's playbook).
- `src/mcp/tools/escalate_cart_drawer_issue/handler.ts` — orchestration, validate, build note, call shared post-note flow.
- `src/mcp/tools/escalate_cart_drawer_issue/shapes.ts` — Zod input/output schema.

### Files modified (refactor)
- **Move** `src/mcp/tools/escalate_scroll_issue/scoring.ts` → `src/lib/scoring.ts`.
- **Move** `src/mcp/tools/escalate_scroll_issue/scoring.test.ts` → `src/lib/scoring.test.ts`.
- **Create** `src/lib/escalation-shared.ts` chứa:
  - `looksLikePlaceholder(url)` (lấy nguyên từ scroll handler)
  - `PLACEHOLDER_PATTERNS` regex array
  - `TICKET_URL_FALLBACK` constant
  - `buildTicketUrl(websiteId, sessionId)` (đã có ở scroll handler)
  - `tryPostNoteWithScoring(...)` — function generic xử lý: resolve session via input/scoring → format note → POST → return result với match info. Cả 2 tool dùng chung.
- **Modify** `src/mcp/tools/escalate_scroll_issue/handler.ts` — import shared helpers, xoá duplicate.
- **Modify** `src/mcp/index.ts` (hoặc nơi register tools) — thêm `registerEscalateCartDrawerIssueTool`.

## Tool description (snippet quan trọng cho Hugo)

```text
Call this tool when the user reports issues with the cart drawer or
Add-to-Cart (ATC) button:
- "Cart drawer không hoạt động / không mở"
- "Click ATC nhưng cart không update, phải reload page"
- "Click ATC nhưng cart drawer không mở"
- Similar cart/ATC-related complaints

ABSOLUTE RULE — same as escalate_scroll_issue: never fabricate URLs.

STEP 1 — User reports cart/ATC issue but has not yet shared editor link and live preview link.
Reply:
"Thông thường vấn đề này là do code theme chưa match với chức năng ATC
của PageFly. Vì vậy chúng tôi sẽ cần kiểm tra và giúp bạn add code để
fix issue này. Vui lòng cung cấp editor page đang lỗi và link live
preview để chúng tôi có thể kiểm tra."

STEP 2 — User has provided editor link AND live preview link.
Call escalate_cart_drawer_issue with issue_description, editor_link,
live_preview_url. Include screenshot_url if user attached one, and
crisp_session_id + customer_last_message_text per usual convention.

STEP 3 — Reply next_step_for_user verbatim (the standard "team
technical đang kiểm tra, vui lòng chờ" message).
```

Tool description sẽ chi tiết hơn — viết theo template scroll tool's, swap nội dung phù hợp cart/ATC.

## Schema

### Input

```ts
{
  issue_description: z.string().min(1).describe(
    "Hugo's paraphrase of the user's complaint. Examples: 'Cart drawer không mở khi click ATC', 'ATC button không update cart, cần reload'."
  ),
  editor_link: z.string().url().describe(
    "The PageFly editor link the user pasted. Take whatever URL the user actually sent."
  ),
  live_preview_url: z.string().url().describe(
    "The live preview / storefront URL the user pasted (e.g. https://store.myshopify.com/products/...). Required so the technical team can reproduce the bug."
  ),
  screenshot_url: z.string().url().optional().describe(
    "ANY URL pointing to a picture of the issue. Optional — cart drawer bugs are often behavioral, screenshot may not exist."
  ),
  ticket_url: z.string().url().optional().describe(
    "Optional Crisp conversation URL. Auto-built from session_id if omitted."
  ),
  crisp_session_id: z.string().optional().describe(
    "Crisp session ID if Hugo has runtime context."
  ),
  customer_last_message_text: z.string().optional().describe(
    "Verbatim copy of user's last message — used for hybrid session matching when crisp_session_id is missing."
  ),
}
```

### Output

Đồng nhất với scroll tool's output (cùng cấu trúc, cùng kiểu):
- `issue_summary`
- `is_ready_for_escalation`
- `missing_info` — possible values: `"editor_link"`, `"live_preview_url"` (KHÔNG có `"screenshot"` vì optional)
- `crisp_note` — `{content, formatted_message}`
- `next_step_for_user`
- `note_posted`
- `note_post_error?`
- `session_match?` — `{score, signals_matched, threshold_met}`

## Validation

Missing-info gate, trả `is_ready_for_escalation: false` nếu:
- `editor_link` missing/placeholder → push `"editor_link"`
- `live_preview_url` missing/placeholder → push `"live_preview_url"`

`screenshot_url` (optional) — nếu có VÀ là placeholder thì coi như không truyền (silent drop, không block escalation).

`next_step_for_user` khi missing-info: ghép labels Vietnamese — vd "link editor, link live preview" — và thông báo user gửi thêm.

## Note format (3 dòng)

```
Issue: <issue_description>, live preview: <live_preview_url>[, hình ảnh: <screenshot_url>]
Editor: <editor_link>
Ticket: <ticket_url>
```

Phần `[, hình ảnh: ...]` chỉ append khi `screenshot_url` valid (không placeholder, có giá trị).

Ticket URL: dùng `input.ticket_url` nếu Hugo truyền; else build từ `creds.websiteId` + `sessionId` đã resolve; else fallback constant.

## Wait message cho user

```
Cảm ơn bạn đã cung cấp đầy đủ thông tin nhé 😊 Mình đã chuyển vấn đề
này đến team technical để kiểm tra chi tiết. Bạn vui lòng chờ trong
vài phút, team sẽ xem xét và phản hồi bạn sớm nhất có thể!
```

Constant `WAIT_MESSAGE` — extract sang `src/lib/escalation-shared.ts` để cả 2 tool import cùng giá trị (DRY).

## Shared infra reuse

| Component | Vị trí mới | Dùng bởi |
|---|---|---|
| `findBestSession`, `ConversationLite`, `ScoringInputs`, `BestSessionResult`, `SCORE_THRESHOLD`, `scoreConversation` | `src/lib/scoring.ts` | scroll + cart |
| `looksLikePlaceholder`, `PLACEHOLDER_PATTERNS`, `TICKET_URL_FALLBACK`, `buildTicketUrl` | `src/lib/escalation-shared.ts` | scroll + cart |
| `readCrispCreds`, `postCrispPrivateNote`, `fetchHugoConversations`, `readNoteUser`, etc. | `src/lib/crisp.ts` (đã có) | scroll + cart + webhook |
| Webhook auto-reply (`Hugo: note → customer`) | `src/webhooks/crisp.ts`, `note-forwarder.ts` | cả 2 tool (tự nhận note) |

## tryPostNoteWithScoring (shared function)

Logic resolve session + post note hiện trùng giữa 2 tool. Extract thành:

```ts
interface PostNoteResult {
  posted: boolean;
  error?: string;
  sessionUsed?: string;
  sessionSource?: "input" | "scored";
  match?: { score: number; signalsMatched: string[]; thresholdMet: boolean };
  noteContent: string;
}

async function tryPostNoteWithScoring<TFields>(args: {
  hintedSessionId?: string;
  fields: TFields;
  providedTicketUrl?: string;
  scoringInputs: ScoringInputs;
  formatNote: (fields: TFields, ticketUrl: string) => string;
}): Promise<PostNoteResult>;
```

Mỗi tool gọi với `TFields` riêng:
- Scroll: `{ issueDescription, screenshotUrl, editorLink }` → `formatNote` trả "Issue: …, đây là hình ảnh: …\nEditor: …\nTicket: …".
- Cart: `{ issueDescription, livePreviewUrl, editorLink, screenshotUrl? }` → `formatNote` trả "Issue: …, live preview: …[, hình ảnh: …]\nEditor: …\nTicket: …".

Tool handler chỉ còn validate + chuẩn bị `fields` + gọi shared function + map kết quả vào output Zod-conforming. ~80 dòng/tool thay vì ~250.

## Test plan

**Unit tests mới** (`src/mcp/tools/escalate_cart_drawer_issue/handler.test.ts`):
- Missing editor_link → reject với missing_info=["editor_link"].
- Missing live_preview_url → reject với missing_info=["live_preview_url"].
- Missing cả 2 → missing_info=["editor_link", "live_preview_url"].
- Placeholder editor → treated as missing.
- Placeholder live_preview → treated as missing.
- Placeholder screenshot → silently dropped (not in missing_info, note formatted WITHOUT image).
- All valid + screenshot → note string contains all 3 components in correct order.
- All valid, no screenshot → note string omits hình ảnh part.

Mocks cho `postCrispPrivateNote` / `fetchHugoConversations` qua test doubles của shared function — không call thật.

**Tests sau refactor** (giữ nguyên hành vi):
- 25 scoring tests vẫn pass sau khi move scoring.ts.
- Tests scroll handler (nếu có) vẫn pass với imports mới.

**Manual smoke**:
- Chat với Hugo: "cart drawer của tôi không mở khi click ATC" → Hugo reply step 1 verbatim.
- Cung cấp editor + live preview → Hugo gọi tool → note 3 dòng xuất hiện trên ticket.
- Verify webhook auto-reply tự fire khi TS gõ `Hugo: ...` (đã work, không cần code mới).

## Migration / backward compat

- Scroll tool tests phải pass sau refactor. Nếu test import từ old path, update path.
- Existing escalate_scroll_issue endpoint không đổi behavior — chỉ tổ chức code lại.
- Tool mới đăng ký song song, không thay thế gì.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Refactor scoring move làm vỡ scroll tests | Chạy `npm test` sau mỗi step refactor, kiểm tra 53+ tests vẫn pass |
| `tryPostNoteWithScoring` generic quá khó đọc | Giữ signature đơn giản, comments rõ ràng; nếu thấy nặng nề thì rollback và để mỗi tool có handler riêng (chấp nhận duplicate ~50 line) |
| Tool description quá dài Hugo bỏ qua | Format gọn, có dấu ngăn `===` rõ như scroll tool đã làm |
| Hugo confuse khi nào dùng cart vs scroll tool | Tool description phải list rõ trigger keywords (cart drawer, ATC, add to cart) khác hẳn scroll keywords |
