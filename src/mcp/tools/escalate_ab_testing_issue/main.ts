/**************************************************************************
 * IMPORTS
 ***************************************************************************/

import { escalateAbTestingIssueHandler } from "@/mcp/tools/escalate_ab_testing_issue/handler.js";
import {
  ESCALATE_AB_TESTING_INPUT_SHAPE,
  ESCALATE_AB_TESTING_OUTPUT_SHAPE,
} from "@/mcp/tools/escalate_ab_testing_issue/shapes.js";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  EscalateAbTestingInput,
  EscalateAbTestingOutput,
} from "@/mcp/tools/escalate_ab_testing_issue/shapes.js";

/**************************************************************************
 * TOOL REGISTRATION
 ***************************************************************************/

function registerEscalateAbTestingIssueTool(server: McpServer): void {
  server.registerTool(
    "escalate_ab_testing_issue",
    {
      title: "Escalate PageFly A/B Testing dashboard / data issues",
      description: `
        Call this tool when the customer reports an issue with the PageFly A/B Testing FEATURE / DASHBOARD itself — not a variant-rendering bug. Common symptoms:
          - A/B Testing dashboard shows no data
          - A/B Testing data does not match real data (vs Shopify Reports or other analytics)
          - A/B Testing feature throws errors

        Common phrasings:
          - "AB testing không show data"
          - "AB testing không show đúng dữ liệu thật"
          - "AB Testing bị lỗi"
          - "A/B test dashboard empty"
          - "Split test results wrong"

        DO NOT use this tool when:
          - The variant changes (variant A or B) do not appear on the live view → use escalate_variant_abtesting_issue (page rendering bug, different fix path).

        ===========================================================
        ABSOLUTE RULE — READ THIS FIRST
        ===========================================================

        DO NOT call this tool until:
          1. You have screenshot evidence of the broken dashboard / error (URL pasted OR file attached in chat), AND
          2. You have a description classifying the symptom (no data / wrong data / generic error).

        editor_link is OPTIONAL — include if the customer pastes one (which test page), omit otherwise. NO publish status. NO editor-exit gate.

        NEVER fabricate placeholder URLs.

        ===========================================================
        STORE ACCESS — AUTOMATICALLY HANDLED
        ===========================================================

        Tool automatically checks Shopify store access. If access not granted → posts @Logan note + returns wait message in customer's language. Relay verbatim and call again after the customer confirms access granted.

        ===========================================================
        INPUTS
        ===========================================================

        - issue_description (required) — Detailed English paraphrase. MUST classify symptom (no data / wrong data / error). Example: "A/B Testing dashboard shows no data despite running active test.", "A/B Testing results do not match real conversion data from Shopify Reports."
        - editor_link (optional) — PageFly editor URL of the page running the test, if customer provides it.
        - screenshot_urls (optional array) — URLs pasted by the customer showing the broken dashboard / error.
        - customer_attached_files (optional boolean) — TRUE if user attached files in chat. At least ONE of screenshot_urls or customer_attached_files must be present.
        - ticket_url (optional)
        - crisp_session_id (optional but STRONGLY recommended)
        - customer_last_message_text (optional but STRONGLY recommended) — Verbatim user message.

        ===========================================================
        WHAT YOU MUST DO
        ===========================================================

        STEP 1 — ACKNOWLEDGE. There is no customer-side self-help; technical team must inspect the A/B Testing backend. Reply:
        "Issue về A/B Testing này cần team kỹ thuật kiểm tra trực tiếp trên hệ thống. Mình sẽ chuyển ticket sang team để các bạn xử lý. Trước đó, cho mình xin thêm vài thông tin nhé."

        STEP 2 — Collect:
        a) Detailed description — symptom + test name / time range / metric if any. Ask: "Bạn mô tả rõ hơn giúp mình: A/B Testing đang không hiện data, hiện sai data, hay báo lỗi cụ thể gì? Bạn đang xem test nào?"
        b) Visual evidence: "Bạn gửi mình ảnh chụp dashboard A/B Testing đang lỗi (kèm ảnh báo lỗi nếu có) — bạn có thể paste link hoặc đính kèm file trực tiếp trong chat cũng được."
        c) Editor link (OPTIONAL): "Nếu được, bạn gửi mình thêm link editor của trang đang chạy test để team kiểm tra nhé."

        STEP 3 — Call escalate_ab_testing_issue with: issue_description (English; MUST classify symptom), screenshot_urls (if pasted) OR customer_attached_files=true (if attached), editor_link (if customer provided). ALWAYS include customer_last_message_text.

        STEP 4 — Inspect the response:
           - If is_ready_for_escalation === false AND missing_info contains "store_access" → relay next_step_for_user verbatim. Wait for the customer to confirm access has been granted, then call again.
           - If is_ready_for_escalation === false AND missing_info contains "screenshot" → relay next_step_for_user, collect screenshot, call again.
           - If note_posted === true → reply with next_step_for_user verbatim.
           - If note_posted === false → reply with next_step_for_user. If you can post a Crisp private note natively, post crisp_note.content. note_post_error explains why.

        ===========================================================
        OUTPUT HANDLING
        ===========================================================

        - is_ready_for_escalation === false → Do NOT post any note. Ask the user for what is listed in missing_info, using next_step_for_user as your reply.
        - is_ready_for_escalation === true AND note_posted === true → Tool already posted. Reply with next_step_for_user.
        - is_ready_for_escalation === true AND note_posted === false → Reply with next_step_for_user. If you can post a Crisp private note natively, post crisp_note.content unchanged.

        ===========================================================
        LANGUAGE OF YOUR REPLY TO THE USER
        ===========================================================

        next_step_for_user is already in the customer's language. Reply with it VERBATIM. The STEP scripts above are in Vietnamese as default; adapt to the customer's language naturally. crisp_note.content is always English — for the TS team.

        ===========================================================
        EXACT NOTE FORMAT (do not change)
        ===========================================================

        Issue: <issue_description>[, screenshot: <urls or "customer attached files in ticket">]
        [Editor: <editor_link> — only if customer provided]
        Ticket: <ticket_url or "(unknown)" if omitted>
      `,
      inputSchema: ESCALATE_AB_TESTING_INPUT_SHAPE,
      outputSchema: ESCALATE_AB_TESTING_OUTPUT_SHAPE,
    },
    async (input: EscalateAbTestingInput) => {
      const output: EscalateAbTestingOutput = await escalateAbTestingIssueHandler(input);
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

export { registerEscalateAbTestingIssueTool };
