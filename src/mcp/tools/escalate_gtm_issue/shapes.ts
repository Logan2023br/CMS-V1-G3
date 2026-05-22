/**************************************************************************
 * IMPORTS
 ***************************************************************************/

import { z } from "zod";

/**************************************************************************
 * INPUT SCHEMA
 ***************************************************************************/

const ESCALATE_GTM_INPUT_SHAPE = z.object({
  issue_description: z
    .string()
    .min(1)
    .describe(
      "Hugo's one-line paraphrase of the issue, ALWAYS IN ENGLISH. MUST include (a) what the customer is trying to track (e.g. button clicks, page views, custom event), (b) what they have already set up (GTM container ID, code location), and (c) what's not working. Example: 'Customer added GTM code in PageFly Custom HTML element but GTM debug shows no events firing on PageFly page.', 'Customer wants to track click events on PageFly Buy Now button via GTM trigger; needs button data-attributes / selector.'"
    ),

  editor_link: z
    .string()
    .url()
    .optional()
    .describe(
      "OPTIONAL — the PageFly editor URL of the page the customer is trying to track. Include if the customer provides it."
    ),

  screenshot_urls: z
    .array(z.string().url())
    .optional()
    .describe(
      "OPTIONAL — screenshot URLs the customer pasted (GTM container, debug view, code snippet, etc.). Useful but not required for escalation."
    ),

  customer_attached_files: z
    .boolean()
    .optional()
    .describe(
      "Set TRUE if the customer attached files directly in the Crisp chat (image upload, screen recording) instead of pasting links."
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

type EscalateGtmInput = z.infer<typeof ESCALATE_GTM_INPUT_SHAPE>;

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

const ESCALATE_GTM_OUTPUT_SHAPE = z.object({
  issue_summary: z.string(),

  is_ready_for_escalation: z
    .boolean()
    .describe(
      "True iff store access is granted AND the customer has exited the editor. issue_description is the only required content (validated by min-length in schema)."
    ),

  missing_info: z
    .array(z.string())
    .describe(
      "List of fields still missing. Possible values: 'store_access', 'editor_exit'."
    ),

  crisp_note: CRISP_NOTE,

  next_step_for_user: z.string(),

  note_posted: z.boolean(),

  note_post_error: z.string().optional(),

  session_match: SESSION_MATCH.optional(),
});

type EscalateGtmOutput = z.infer<typeof ESCALATE_GTM_OUTPUT_SHAPE>;

/**************************************************************************
 * EXPORTS
 ***************************************************************************/

export {
  ESCALATE_GTM_INPUT_SHAPE,
  ESCALATE_GTM_OUTPUT_SHAPE,
  type EscalateGtmInput,
  type EscalateGtmOutput,
};
