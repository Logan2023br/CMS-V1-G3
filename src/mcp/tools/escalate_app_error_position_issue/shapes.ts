/**************************************************************************
 * IMPORTS
 ***************************************************************************/

import { z } from "zod";

/**************************************************************************
 * INPUT SCHEMA
 ***************************************************************************/

const ESCALATE_APP_ERROR_POSITION_INPUT_SHAPE = z.object({
  issue_description: z
    .string()
    .min(1)
    .describe(
      "Hugo's detailed English paraphrase. Identify WHICH app/widget is in the wrong position + WHERE it currently shows + WHERE the customer wants it to show. Examples: 'Judge.me review widget shows at top of product page instead of below the description.', 'Bundle app appears in the footer area but customer wants it inside the product section.'"
    ),

  editor_link: z
    .string()
    .url()
    .describe(
      "The PageFly editor URL of the affected page. Take what the user pasted. No placeholders."
    ),

  screenshot_urls: z
    .array(z.string().url())
    .optional()
    .describe(
      "Optional. URLs the user pasted showing where the app appears now / where it should appear (annotated screenshot). Omit if the user attached files directly in chat."
    ),

  customer_attached_files: z
    .boolean()
    .optional()
    .describe(
      "Set TRUE if the user attached files directly in the Crisp chat (image upload, video upload) instead of pasting links."
    ),

  user_consented_to_publish: z
    .boolean()
    .describe(
      "MUST be true. The user has explicitly agreed that the technical team may publish the page after fixing. TS team WILL publish (no save-only option). Ask first if you have not."
    ),

  ticket_url: z
    .string()
    .url()
    .optional()
    .describe(
      "Optional — only include if your runtime exposes the live Crisp conversation URL. Auto-built from crisp_session_id otherwise."
    ),

  crisp_session_id: z
    .string()
    .optional()
    .describe(
      "The Crisp conversation session ID. If you have it from runtime context, include it."
    ),

  customer_last_message_text: z
    .string()
    .optional()
    .describe(
      "Verbatim text of the user's LAST message. KHÔNG paraphrase, KHÔNG trim, KHÔNG fix typo, KHÔNG translate."
    ),

  user_exited_editor: z
    .boolean()
    .describe(
      "MUST be TRUE before escalation. The customer has confirmed they have exited the PageFly editor. Concurrent editing causes a save conflict. Ask the customer first and pass false until they confirm."
    ),
});

type EscalateAppErrorPositionInput = z.infer<typeof ESCALATE_APP_ERROR_POSITION_INPUT_SHAPE>;

/**************************************************************************
 * OUTPUT SCHEMA
 ***************************************************************************/

const CRISP_NOTE = z.object({
  content: z.string(),
  formatted_message: z.string(),
});

const SESSION_MATCH = z.object({
  score: z.number(),
  signals_matched: z.array(z.string()),
  threshold_met: z.boolean(),
});

const ESCALATE_APP_ERROR_POSITION_OUTPUT_SHAPE = z.object({
  issue_summary: z.string(),

  is_ready_for_escalation: z
    .boolean()
    .describe(
      "True iff editor_link is provided AND user_consented_to_publish === true AND store access is granted AND the customer has exited the editor. Screenshot is optional."
    ),

  missing_info: z
    .array(z.string())
    .describe(
      "List of fields still missing. Possible values: 'editor_link', 'user_consented_to_publish', 'store_access', 'editor_exit'."
    ),

  crisp_note: CRISP_NOTE,

  next_step_for_user: z.string(),

  note_posted: z.boolean(),

  note_post_error: z.string().optional(),

  session_match: SESSION_MATCH.optional(),
});

type EscalateAppErrorPositionOutput = z.infer<typeof ESCALATE_APP_ERROR_POSITION_OUTPUT_SHAPE>;

/**************************************************************************
 * EXPORTS
 ***************************************************************************/

export {
  ESCALATE_APP_ERROR_POSITION_INPUT_SHAPE,
  ESCALATE_APP_ERROR_POSITION_OUTPUT_SHAPE,
  type EscalateAppErrorPositionInput,
  type EscalateAppErrorPositionOutput,
};
