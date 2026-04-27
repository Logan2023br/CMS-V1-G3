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
