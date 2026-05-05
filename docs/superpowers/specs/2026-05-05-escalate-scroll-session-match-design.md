# Design — Hybrid Session Matching cho `escalate_scroll_issue`

## Mục tiêu

Tăng độ chính xác khi tool tự resolve `crisp_session_id` (lúc Hugo không truyền session_id), để note issue được post vào **đúng** conversation của user đang báo lỗi, thay vì nhầm sang ticket khác.

Đây là giải pháp **tạm thời** cho đến khi Crisp expose `session_id` ra runtime của Hugo. Khi Hugo truyền được session_id trực tiếp, tool sẽ bypass toàn bộ logic match này và POST thẳng (đã có sẵn path đó).

## Vấn đề hiện tại

Logic resolve session hiện tại trong `findLatestActiveSession`:
1. Match URL trong `last_message`
2. Fallback: conversation có `waiting_since` mới nhất
3. Fallback cuối: conversation `updated_at` mới nhất

Failure mode đã gặp:
- User vừa nhắn text mô tả không kèm URL → bước 1 miss → rơi vào `waiting_since`
- Nhiều visitor cùng đang chờ → `waiting_since` chọn sai
- Tool vẫn post note vào conversation sai mà không có cảnh báo

Ngoài ra, API list conversations hiện không filter theo inbox → có thể score cả conversation **không phải** Hugo handle (operator người đang xử lý), dẫn đến nhầm lẫn thêm.

## Phạm vi

**In-scope**:
- Đổi API list conversations sang endpoint có filter `filter_inbox_id=_internal:agent` (chỉ ticket Hugo handle).
- Thêm input field `customer_last_message_text` (verbatim text user vừa nhắn) — Hugo copy nguyên xi.
- Implement hybrid scoring với nhiều signal.
- Threshold tối thiểu = 50: dưới ngưỡng → trả error, không đoán bừa.
- Mở rộng output để debug được (`session_match.score`, `signals_matched`, `threshold_met`).

**Out-of-scope**:
- Path "Hugo có `crisp_session_id`" giữ nguyên — vẫn POST thẳng, không qua match logic.
- Không paginate qua nhiều page conversation — chỉ page 1.
- Không fetch message history per conversation (đắt N API call) — chỉ dùng `last_message` từ list response.
- Không tự "fix" scroll — vẫn là tool pure-escalation.

## Kiến trúc

Sửa 2 file:
- `src/mcp/tools/escalate_scroll_issue/shapes.ts` — thêm input field + mở rộng output.
- `src/mcp/tools/escalate_scroll_issue/handler.ts` — đổi endpoint list, thay logic match bằng scoring.

## Schema thay đổi

### Input — thêm field

```ts
customer_last_message_text: z
  .string()
  .optional()
  .describe(
    "Verbatim text của tin nhắn CUỐI CÙNG mà user gửi trong cuộc hội thoại " +
    "này. Copy nguyên xi — KHÔNG paraphrase, KHÔNG trim, KHÔNG sửa typo, " +
    "KHÔNG dịch. Tool dùng text này để tìm đúng conversation. Bỏ qua field " +
    "này nếu tin nhắn cuối là attachment/file (không có text)."
  ),
```

Optional vì Hugo có thể không capture được (vd tin nhắn cuối là attachment); tool vẫn chạy với các signal khác.

### Output — thêm block `session_match`

```ts
session_match: z.object({
  score: z.number().describe("Tổng điểm scoring của conversation được chọn (hoặc cao nhất nếu không có cái nào đạt threshold)."),
  signals_matched: z.array(z.string()).describe("Danh sách signal đã match: 'exact_text', 'substring_text', 'url_screenshot', 'url_editor', 'waiting_since_top', 'updated_at_top'."),
  threshold_met: z.boolean().describe("True nếu score ≥ 50 và tool đã post note. False nếu dưới threshold (note KHÔNG post)."),
}).optional()
```

`optional` ở output level vì khi Hugo truyền `crisp_session_id` thì block này không có ý nghĩa.

## Scoring logic

### API endpoint mới

```
GET /v1/website/{websiteId}/conversations/1?filter_inbox_id=_internal:agent
```

Chỉ lấy page 1, chỉ ticket Hugo handle.

### Bảng điểm

Cho mỗi conversation trong list response, tính tổng:

| Signal | Điểm | Điều kiện |
|---|---|---|
| `exact_text` | +100 | `normalize(last_message) === normalize(customer_last_message_text)` |
| `substring_text` | +60 | `last_message` chứa substring liên tiếp của `customer_last_message_text` đạt độ dài tối thiểu (xem dưới) |
| `url_screenshot` | +50 | `last_message` chứa `screenshot_url` |
| `url_editor` | +50 | `last_message` chứa `editor_link` |
| `waiting_since_top` | +20 | Conversation có `waiting_since` lớn nhất trong list |
| `updated_at_top` | +5 | Conversation có `updated_at` lớn nhất trong list |

Hàm `normalize` chỉ làm: trim 2 đầu + collapse multiple whitespace thành single space. Không lowercase (giữ phân biệt Hoa/thường), không strip dấu (giữ tiếng Việt nguyên).

**Substring length tối thiểu**:
- Nếu `customer_last_message_text` (đã normalize) độ dài ≥ 40 → cần substring liên tiếp ≥ 40 ký tự.
- Nếu < 40 → cần substring chính là toàn bộ text (≥ 100% độ dài) — tức `last_message` phải chứa nguyên text gốc. Trường hợp này gần tương đương `exact_text` nhưng chỉ cộng +60 (vì có thể `last_message` còn chữ thừa khác).
- Nếu `customer_last_message_text` không truyền hoặc rỗng → skip signal này.

### Threshold

Threshold = **50**.

- Nếu top score ≥ 50 → chọn conversation đó, POST note.
- Nếu top score < 50 → KHÔNG post, return output với `note_posted=false`, `session_match.threshold_met=false`, `note_post_error` mô tả "không tìm thấy conversation đủ tin cậy". Hugo sẽ đọc lỗi và xin user paste lại link, hoặc fallback xử tay.

Lý do chọn 50: tương đương "ít nhất phải có 1 signal nội dung mạnh" (URL hoặc substring). Không cho phép post chỉ dựa vào `waiting_since` (20) hoặc `updated_at` (5) — đó chính là nguồn gốc của bug nhầm ticket.

### Tiebreaker

Nếu ≥ 2 conversations cùng top score:
1. Chọn `waiting_since` mới hơn.
2. Nếu cùng `waiting_since` (hoặc cùng null) → chọn `updated_at` mới hơn.

## Flow

```
escalateScrollIssueHandler(input)
├─ validate missing screenshot/editor_link/placeholder → return early nếu thiếu
├─ Có input.crisp_session_id?
│  ├─ Có → POST thẳng /conversation/{session_id}/message → return
│  └─ Không → tiếp tục
├─ GET /conversations/1?filter_inbox_id=_internal:agent
├─ Score từng conversation theo bảng điểm
├─ Top score ≥ 50?
│  ├─ Có → POST note, return với session_match đầy đủ
│  └─ Không → return error, KHÔNG post, kèm session_match để debug
```

## API token usage

- Best case (Hugo có session_id): **1 call** (POST note).
- Worst case (Hugo không có session_id): **2 calls** (list filtered + POST note nếu ≥ threshold).
- Khi top score < 50: **1 call** (chỉ list, không post).

Đã tối ưu hết mức: page 1, có filter inbox, không fetch history per conversation.

## Edge cases & error handling

- `customer_last_message_text` không truyền → bỏ qua signal `exact_text` và `substring_text`, vẫn dùng URL match + waiting_since.
- `customer_last_message_text` rỗng/whitespace → coi như không truyền.
- Crisp list trả 0 conversation → return error rõ "Hugo's inbox không có conversation nào".
- Crisp list API lỗi 5xx → return error nguyên văn để debug.
- Tất cả conversation đều score 0 → return error với top conversation và score 0 (không post).
- POST note fail sau khi đã match → return error với session_id đã chọn để debug tay.

## Logging

- Log mỗi escalation: `session_id_chosen`, `score`, `signals_matched`, `posted` (true/false), `error` (nếu có).
- Format: `[escalate_scroll_issue] match: session=xxx score=N signals=[...] posted=true|false`

## Migration path tới session_id từ Crisp

Khi Crisp add `session_id` vào runtime của Hugo:
1. Đổi schema: `crisp_session_id` từ `optional` → `required`.
2. Xoá `findLatestActiveSession` + scoring logic.
3. Xoá field `customer_last_message_text`.
4. Output `session_match` thành luôn không có ý nghĩa → có thể xoá.

Toàn bộ scoring logic là **temporary** — design có chú ý đảm bảo việc gỡ bỏ sau này dễ.

## Test plan

(Sẽ chi tiết hơn trong implementation plan, nhưng minimum):

- Unit test cho hàm `scoreConversation`: mỗi signal đơn lẻ, kết hợp signal, normalize whitespace.
- Unit test cho `findBestSession`: chọn đúng top score, tiebreaker đúng, threshold reject đúng.
- Integration test (mock fetch): toàn bộ handler với từng kịch bản — Hugo có session_id, không có session_id + match đủ, không có session_id + match thiếu (dưới threshold).
