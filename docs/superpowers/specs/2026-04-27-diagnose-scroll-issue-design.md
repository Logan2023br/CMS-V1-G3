# Design — `diagnose_scroll_issue` MCP Tool

## Mục tiêu

Khi user của PageFly báo cáo "page không scroll được" hoặc "scroll lỗi", Hugo (AI agent) sẽ:

1. Thu thập 2 thông tin bắt buộc: **screenshot** + **editor link**
2. Gọi tool `diagnose_scroll_issue`
3. Tool trả về Crisp note với cấu trúc cố định
4. Hugo post note đó lên Crisp conversation và yêu cầu user đợi technical team kiểm tra

Đây là tool **pure-escalation** (không tự fix). Sẽ là template cho các escalation-only tool tiếp theo.

## Phạm vi

**In-scope**:
- Validate đầu vào (đủ editor link + ticket URL + xác nhận screenshot).
- Format Crisp note theo cấu trúc 3 dòng (Issue / Editor / Ticket).
- Trả về message Hugo nói với user sau khi post note.
- Embedding conversation flow vào field `description` của tool để Hugo tự follow.

**Out-of-scope**:
- Không gọi Crisp API trực tiếp (Hugo handle việc post note — đúng pattern các tool hiện tại).
- Không tự diagnose / suggest CSS fix.
- Không poll signal từ technical team. Việc phản hồi user khi đã fix xong là conversation logic riêng.

## Kiến trúc & Pattern

Theo đúng pattern của 2 tool đã có trong repo:
- `src/mcp/tools/diagnose_font_issue/`
- `src/mcp/tools/diagnose_pagesize_issue/`

3 file:
- `shapes.ts` — Zod schema cho input/output + types
- `handler.ts` — Pure logic: nhận input → return output
- `main.ts` — `registerDiagnosizeScrollIssueTool(server)` đăng ký tool với MCP server, kèm `description` chứa conversation script cho Hugo

Sau đó:
- Đăng ký vào `src/mcp/tools/index.ts`
- Update `instructions` trong `src/mcp/index.ts` để mention scroll issue capability

## Input Schema

```typescript
{
  issue_description: string,   // Required. Hugo paraphrase từ user, vd:
                               //   "Khách hàng không scroll được page"
                               //   "Page scroll bị giật ở mobile"

  editor_link: string (url),   // Required. Link PageFly editor user cung cấp.

  ticket_url: string (url),    // Required. Link Crisp conversation ticket
                               // (Hugo có sẵn từ context conversation).

  has_screenshot: boolean      // Required. Hugo confirm user đã gửi ảnh
                               // trong conversation.
}
```

## Output Schema

```typescript
{
  issue_summary: string,
    // Câu summary ngắn để Hugo paraphrase lại cho user

  is_ready_for_escalation: boolean,
    // true nếu đủ info, false nếu thiếu

  missing_info: string[],
    // ["screenshot"] hoặc ["editor_link"] hoặc cả hai
    // empty array nếu đủ

  crisp_note: {
    content: string,
      // Plain text note theo format đúng yêu cầu:
      //   Issue: <issue_description>
      //   Editor: <editor_link>
      //   Ticket: <ticket_url>

    formatted_message: string
      // Optional Markdown format nếu Crisp note hỗ trợ
  },

  next_step_for_user: string
    // Câu Hugo nói với user sau khi post note xong.
    // Mặc định: "Vui lòng chờ vài phút, technical team đang kiểm tra
    //            và sẽ phản hồi bạn sớm nhất."
}
```

## Crisp Note Format

```
Issue: Khách hàng không scroll được page
Editor: https://admin.shopify.com/store/example/apps/pagefly/editor?type=page&id=abc123
Ticket: https://app.crisp.chat/website/example-id/inbox/conversation-id
```

3 dòng. Không markdown. Không emoji. Không cc tag. Đơn giản — đúng yêu cầu user.

Phần `Issue:` được lấy trực tiếp từ `issue_description` mà Hugo paraphrase từ user.

## Conversation Flow (Hugo's behavior)

Đây là logic Hugo follow theo `description` của tool. **Không phải logic của handler** — handler chỉ format note.

```
User: "Page tôi không scroll được"
   ↓
Hugo: "Vui lòng cung cấp hình ảnh và link editor để chúng tôi
       forward đến team technical kiểm tra giúp bạn."
   ↓
   ├─ User cung cấp đủ image + editor link
   │     ↓
   │  Hugo: [call diagnose_scroll_issue với input đầy đủ]
   │     ↓
   │  Hugo: [post Crisp note với content từ tool output]
   │     ↓
   │  Hugo: "Vui lòng chờ vài phút, technical team đang kiểm tra..."
   │
   ├─ User chỉ cung cấp 1 trong 2 (vd thiếu screenshot)
   │     ↓
   │  Hugo: "Bạn còn thiếu [screenshot]. Vui lòng gửi giúp tôi
   │         để technical team có thể kiểm tra."
   │
   └─ User đòi gặp human trước khi cung cấp đủ
         ↓
      Hugo: "Tôi hiểu bạn cần gặp Human, tuy nhiên đây là 2 yếu tố
             cần thiết để giúp bạn xử lý vấn đề. Vui lòng cung cấp,
             tôi sẽ giúp bạn chuyển nó đến human và họ sẽ fix giúp bạn."
```

Toàn bộ flow trên được mô tả trong field `description` của tool registration (giống cách `diagnose_font_issue` đang làm). Hugo đọc description và làm theo.

## Handler Logic

```
function diagnoseScrollIssueHandler(input):
  missing = []
  if not input.has_screenshot: missing.push("screenshot")
  if not input.editor_link:    missing.push("editor_link")
  if not input.ticket_url:     missing.push("ticket_url")

  if missing.length > 0:
    return {
      is_ready_for_escalation: false,
      missing_info: missing,
      issue_summary: "Cần thêm thông tin trước khi escalate",
      crisp_note: { content: "", formatted_message: "" },
      next_step_for_user: "Vui lòng cung cấp: " + missing.join(", ")
    }

  noteContent =
    "Issue: " + input.issue_description + "\n" +
    "Editor: " + input.editor_link + "\n" +
    "Ticket: " + input.ticket_url

  return {
    is_ready_for_escalation: true,
    missing_info: [],
    issue_summary: input.issue_description,
    crisp_note: {
      content: noteContent,
      formatted_message: noteContent
    },
    next_step_for_user:
      "Vui lòng chờ vài phút, technical team đang kiểm tra và sẽ phản hồi bạn sớm nhất."
  }
```

Pure function. Không side effect. Không network call.

## Files Changed

### Tạo mới
- `src/mcp/tools/diagnose_scroll_issue/shapes.ts`
- `src/mcp/tools/diagnose_scroll_issue/handler.ts`
- `src/mcp/tools/diagnose_scroll_issue/main.ts`

### Sửa
- `src/mcp/tools/index.ts` — import + register
- `src/mcp/index.ts` — thêm 1 dòng vào `instructions` để mention scroll capability

## Testing

Manual test flow qua MCP Inspector (`npm run inspect`):

1. **Đủ info** → expect `is_ready_for_escalation: true`, note format đúng 3 dòng.
2. **Thiếu screenshot** → `missing_info: ["screenshot"]`, `is_ready_for_escalation: false`.
3. **Thiếu editor_link** → Zod validation fail (vì required URL).
4. **Editor link sai format** (không phải URL) → Zod validation fail.

Không cần unit test framework — handler là pure function, test qua Inspector là đủ ở stage này.

## Mở rộng tương lai

User đã nói: "Sẽ còn rất nhiều mcp tool sau sẽ có 2 cách hoạt động: 1 là tự fix, 2 là gửi đến technical."

→ Khi có tool escalation thứ 2 (vd `diagnose_click_issue`), refactor common note-formatting logic ra `src/mcp/tools/_shared/escalation.ts`. Chưa làm bây giờ — YAGNI.

## Approval Checklist

- [ ] User confirm tool name: `diagnose_scroll_issue`
- [ ] User confirm note format đúng 3 dòng (Issue / Editor / Ticket)
- [ ] User confirm conversation script trong `description` đúng tone
