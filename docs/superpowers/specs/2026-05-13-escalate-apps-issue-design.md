# Design — `escalate_apps_issue` MCP Tool

## Mục tiêu

Thêm MCP tool xử lý báo cáo lỗi về **apps không hoạt động hoặc không hiển thị** trên page PageFly (bao gồm bundle apps, 3rd-party apps, mọi loại app nhúng vào page). Cấu trúc giống các tool escalation đã có (`escalate_scroll_issue`, `escalate_cart_drawer_issue`) — pure escalation, không tự fix.

## Vấn đề cần giải quyết

User PageFly thường báo các tình huống:
- "App bundle không work"
- "App 3rd-party không hiển thị / không show lên page"
- "Cài app rồi nhưng không thấy gì"
- Các biến thể khác có chung pattern: **apps không work, không show, không giới hạn app cụ thể nào**.

Khác với scroll/cart drawer (chỉ cần editor + 1 media), case apps cần:
- **Có thể nhiều editor link** (lỗi có thể trải trên nhiều page).
- **Hình ảnh hoặc video** show vị trí lỗi (1 trở lên — user chat support thường paste cả ảnh + video Loom).
- **Trạng thái publish**: published vs save-only. Issue chỉ check được nếu page đã publish, nên Hugo phải hỏi và note trạng thái này cho TS.

## Phạm vi

**In-scope**:
- Tool `escalate_apps_issue` (3 file: `main.ts`, `handler.ts`, `shapes.ts`, + tests).
- Schema input có 3 trường required: `editor_links` (array), `media_urls` (array), `publish_status` (enum).
- Note format mới: 3 dòng + 1 status line.
- Register vào `src/mcp/tools/index.ts`.

**Out-of-scope**:
- Hugo's conversation logic (nói "vui lòng publish trước" khi user mới save) là phần Hugo runtime quyết định — tool không enforce, chỉ ghi nhận giá trị Hugo truyền cuối cùng.
- KHÔNG validate URL thật là editor PageFly hay không (chỉ check placeholder pattern).
- KHÔNG test mới cho webhook auto-reply (đã hoạt động cho mọi note từ tool nào).

## Kiến trúc

### Files mới
- `src/mcp/tools/escalate_apps_issue/main.ts` — tool registration + Hugo description.
- `src/mcp/tools/escalate_apps_issue/handler.ts` — validation + note formatter + orchestration qua shared lib.
- `src/mcp/tools/escalate_apps_issue/shapes.ts` — Zod input/output schema.
- `src/mcp/tools/escalate_apps_issue/handler.test.ts` — unit tests.

### Files modified
- `src/mcp/tools/index.ts` — thêm 1 import + 1 dòng register.

### Reuse (không thay đổi)
- `src/lib/escalation-shared.ts` — `WAIT_MESSAGE`, `looksLikePlaceholder`, `tryPostNoteWithScoring<TFields>`, types.
- `src/lib/scoring.ts` — hybrid session matching.
- `src/lib/crisp.ts` — REST helpers + identity.
- `src/webhooks/crisp.ts` + `note-forwarder.ts` — webhook auto-reply áp dụng tự động cho mọi note từ tool này.

## Hugo conversation flow

**STEP 1** — User báo issue về apps không work/show. Hugo reply:

> "Để team technical kiểm tra giúp bạn, vui lòng gửi link editor của các page đang bị lỗi (nếu lỗi trên nhiều page, gửi hết các link), và hình ảnh hoặc video show vị trí lỗi để chúng tôi có thể định vị chính xác."

**STEP 2** — User cung cấp editor link(s) + ảnh/video. Hugo hỏi tiếp:

> "Page đã được publish chưa hay chỉ save? Vì cần publish mới check được issue này."

**STEP 3** — Tuỳ câu trả lời:
- User: **"Đã publish"** → Hugo gọi tool với `publish_status: "published"`.
- User: **"Chỉ save"** → Hugo reply:
  > "Vui lòng publish page trước nhé, vì publish mới check được issue này. Nếu bạn không thể publish, mình vẫn forward team kiểm tra, nhưng có thể hạn chế thông tin."
  Sau đó:
  - User confirm đã publish → tool call với `"published"`.
  - User không publish được → tool call với `"only_save"`.

**STEP 4** — Tool trả output. Hugo reply `next_step_for_user` (WAIT_MESSAGE).

## Schema

### Input

```ts
{
  issue_description: z.string().min(1).describe(
    "Hugo's paraphrase of the user's complaint. Examples: 'App bundle không hiển thị', 'App 3rd-party không work trên page'."
  ),
  editor_links: z.array(z.string().url()).min(1).describe(
    "Array of PageFly editor links where the apps are broken. ≥1 link. Hugo collects all links the user pasted. Take what user sent — no placeholders."
  ),
  media_urls: z.array(z.string().url()).min(1).describe(
    "Array of image/video URLs showing where the apps are broken. ≥1 URL. Accepts any URL the user paste — image hosts, Loom, YouTube, file uploads, etc. No placeholders."
  ),
  publish_status: z.enum(["published", "only_save"]).describe(
    "Whether the page has been published or only saved. 'published' = can be checked on live storefront. 'only_save' = user did not / could not publish; TS will note limitation."
  ),
  ticket_url: z.string().url().optional().describe(
    "Optional Crisp conversation URL. Auto-built from session_id otherwise."
  ),
  crisp_session_id: z.string().optional().describe(
    "Crisp session ID if Hugo has runtime context. Enables deterministic posting; otherwise tool auto-resolves via hybrid scoring."
  ),
  customer_last_message_text: z.string().optional().describe(
    "Verbatim text of user's last message — used for hybrid session matching. Copy as-is, no paraphrase/translation/trim."
  ),
}
```

### Output

Same structure as the other escalation tools:
- `issue_summary`
- `is_ready_for_escalation`
- `missing_info` — possible values: `"editor_links"`, `"media_urls"`, `"publish_status"`
- `crisp_note` — `{content, formatted_message}`
- `next_step_for_user`
- `note_posted`
- `note_post_error?`
- `session_match?`

## Validation

Missing-info gate (treat any of these as missing):
- `editor_links` is missing, empty array, OR every element is a placeholder.
- `media_urls` is missing, empty array, OR every element is a placeholder.
- `publish_status` is missing (Zod would normally reject at parse, but handler also defends).

Filter placeholder URLs per-item in arrays. If after filtering an array becomes empty, treat the field as missing.

`next_step_for_user` when missing-info: ghép labels Vietnamese:
- `editor_links` → "link editor"
- `media_urls` → "hình ảnh hoặc video"
- `publish_status` → "trạng thái publish (đã publish hay chỉ save)"

## Note format

```
Issue: <issue_description>, editor: <url1>, <url2>, ..., hình ảnh/video: <url1>, <url2>, ...
Ticket: <ticket_url or "(unknown)" if omitted>
<Allowed to publish | Only Save>
```

3 dòng + 1 status line. Status line là plain text, không có prefix label.

Status text mapping:
- `publish_status === "published"` → `Allowed to publish`
- `publish_status === "only_save"` → `Only Save`

URLs trong dòng Issue được join bằng `, `. Filter ra placeholder URLs trước khi format (defense in depth — handler đã filter ở missing-info gate, formatter cũng tự bảo vệ).

## Wait message cho user

Dùng chung `WAIT_MESSAGE` constant trong `src/lib/escalation-shared.ts`:

> "Cảm ơn bạn đã cung cấp đầy đủ thông tin nhé 😊 Mình đã chuyển vấn đề này đến team technical để kiểm tra chi tiết. Bạn vui lòng chờ trong vài phút, team sẽ xem xét và phản hồi bạn sớm nhất có thể!"

## Shared infra reuse

| Component | Vị trí | Sử dụng |
|---|---|---|
| `WAIT_MESSAGE`, `looksLikePlaceholder`, `tryPostNoteWithScoring`, `PostNoteResult`, `SessionMatchInfo` | `src/lib/escalation-shared.ts` | Import direct |
| `ScoringInputs`, `findBestSession` | `src/lib/scoring.ts` | Consumed inside `tryPostNoteWithScoring` |
| Crisp REST clients (post note, fetch list, identity) | `src/lib/crisp.ts` | Inside shared post function |
| Webhook auto-reply pipeline | `src/webhooks/crisp.ts` + `note-forwarder.ts` | **Tự áp dụng** cho note do tool này post (TS gõ `Hugo: ...` reply → khách nhận message bằng ngôn ngữ của họ) |

## Tool description (snippet cho main.ts)

```text
Call this tool when the user reports apps or bundles not working / not
showing on their PageFly page:
- "App bundle không work" / "App không hiển thị"
- "App 3rd-party không show lên page"
- "Cài app xong không thấy gì"
- Any complaint about apps not working or not appearing on the page.

ABSOLUTE RULE: never fabricate URLs or status values.

STEP 1 — Ask for editor link(s) + image/video:
"Để team technical kiểm tra giúp bạn, vui lòng gửi link editor của các
page đang bị lỗi (nếu lỗi trên nhiều page, gửi hết các link), và hình
ảnh hoặc video show vị trí lỗi để chúng tôi có thể định vị chính xác."

STEP 2 — After user provides editors + media, ask publish status:
"Page đã được publish chưa hay chỉ save? Vì cần publish mới check
được issue này."

STEP 3 — Based on answer:
- "Published" → call tool with publish_status="published".
- "Save only" → reply asking user to publish first. If user finally
  cannot publish, call tool with publish_status="only_save".

STEP 4 — Call escalate_apps_issue with the collected fields.
Reply next_step_for_user verbatim.

ALWAYS include crisp_session_id and customer_last_message_text if you
have them (deterministic vs. hybrid scoring fallback).
```

Tool description sẽ chi tiết hơn — viết theo template `escalate_cart_drawer_issue/main.ts`.

## Test plan

**Unit tests** (`handler.test.ts`):

Missing-info gate:
- editor_links undefined → missing_info has "editor_links"
- editor_links empty array → missing
- editor_links all placeholders → missing
- media_urls undefined → missing
- media_urls empty array → missing
- publish_status undefined → missing
- Combination: 2 missing fields → both in missing_info
- next_step_for_user contains correct Vietnamese labels

Note formatter (extract `formatAppsNoteContent` as named export):
- Single editor + single media + published → exact note string
- Multiple editors + multiple media + only_save → exact note string (joined with ", "; status line "Only Save")
- Placeholder URLs filtered out from arrays before formatting

Total: ~12 tests. Adds to current 62 → ~74 after this tool.

**Manual smoke**:
- Chat with Hugo about apps not showing → Hugo asks for links + media → user provides → Hugo asks publish status → user answers → Hugo calls tool → note appears in ticket.
- TS posts `Hugo: vui lòng hỏi khách dùng theme gì` → webhook auto-reply works (since shared infra).

## Migration / backward compat

- Existing tools (`escalate_scroll_issue`, `escalate_cart_drawer_issue`) không thay đổi.
- Shared lib không thay đổi (đã chuẩn bị xong từ refactor trước).
- Tool mới đăng ký song song.
- `.env` không cần env vars mới.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Hugo confuse `published` vs `only_save` | Enum field name + value rõ ràng, tool description nói rõ Step 3 mapping |
| User paste nhiều link nhưng có 1-2 placeholder | Filter per-item, giữ valid; nếu sau filter rỗng coi như missing |
| Note quá dài khi nhiều URLs | Acceptable — TS đọc note tay, nhiều URL là bình thường |
| Hugo gọi tool khi user vẫn chưa publish | Tool không enforce — chỉ ghi nhận `only_save`. TS đọc note tự quyết định flow tiếp theo |
