/**************************************************************************
 * IMPORTS
 ***************************************************************************/

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerEscalateRedirectCheckoutIssueTool } from "@/mcp/tools/escalate_redirect_checkout_issue/main.js";
import { registerEscalatePopupErrorIssueTool } from "@/mcp/tools/escalate_popup_error_issue/main.js";
import { registerEscalateVariantMediaIssueTool } from "@/mcp/tools/escalate_variant_media_issue/main.js";
import { registerEscalateEventButtonIssueTool } from "@/mcp/tools/escalate_event_button_issue/main.js";
import { registerEscalateFormIssueTool } from "@/mcp/tools/escalate_form_issue/main.js";
import { registerEscalateDuplicateWidgetIssueTool } from "@/mcp/tools/escalate_duplicate_widget_issue/main.js";
import { registerEscalateRemoveSpaceIssueTool } from "@/mcp/tools/escalate_remove_space_issue/main.js";
import { registerEscalateAppErrorPositionIssueTool } from "@/mcp/tools/escalate_app_error_position_issue/main.js";
import { registerEscalateSchemaPageflyIssueTool } from "@/mcp/tools/escalate_schema_pagefly_issue/main.js";
import { registerEscalateAnimationBrokenIssueTool } from "@/mcp/tools/escalate_animation_broken_issue/main.js";
import { registerEscalateJsPageflyIssueTool } from "@/mcp/tools/escalate_js_pagefly_issue/main.js";
import { registerEscalateVideoNotAutoIssueTool } from "@/mcp/tools/escalate_video_not_auto_issue/main.js";
import { registerEscalateElementNotShowIssueTool } from "@/mcp/tools/escalate_element_not_show_issue/main.js";
import { registerEscalateBackgroundMobileIssueTool } from "@/mcp/tools/escalate_background_mobile_issue/main.js";
import { registerEscalateProductNotAssignIssueTool } from "@/mcp/tools/escalate_product_not_assign_issue/main.js";
import { registerSubmitAdditionalRequestTool } from "@/mcp/tools/submit_additional_request/main.js";
import { registerHandleIssueFollowupTool } from "@/mcp/tools/handle_issue_followup/main.js";

/**************************************************************************
 * MAIN
 ***************************************************************************/

// Helper function to register our tools
function registerTools(server: McpServer): void {
  registerEscalateRedirectCheckoutIssueTool(server);
  registerEscalatePopupErrorIssueTool(server);
  registerEscalateVariantMediaIssueTool(server);
  registerEscalateEventButtonIssueTool(server);
  registerEscalateFormIssueTool(server);
  registerEscalateDuplicateWidgetIssueTool(server);
  registerEscalateRemoveSpaceIssueTool(server);
  registerEscalateAppErrorPositionIssueTool(server);
  registerEscalateSchemaPageflyIssueTool(server);
  registerEscalateAnimationBrokenIssueTool(server);
  registerEscalateJsPageflyIssueTool(server);
  registerEscalateVideoNotAutoIssueTool(server);
  registerEscalateElementNotShowIssueTool(server);
  registerEscalateBackgroundMobileIssueTool(server);
  registerEscalateProductNotAssignIssueTool(server);
  registerSubmitAdditionalRequestTool(server);
  registerHandleIssueFollowupTool(server);
}

/**************************************************************************
 * EXPORTS
 ***************************************************************************/

export { registerTools };
