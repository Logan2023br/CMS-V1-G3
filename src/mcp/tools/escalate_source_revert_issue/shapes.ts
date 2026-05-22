/**************************************************************************
 * IMPORTS
 ***************************************************************************/

import { z } from "zod";

/**************************************************************************
 * INPUT SCHEMA
 ***************************************************************************/

const ESCALATE_SOURCE_REVERT_INPUT_SHAPE = z.object({
  issue_description: z
    .string()
    .min(1)
    .describe(
      "Hugo's one-line paraphrase of the issue, ALWAYS IN ENGLISH. MUST include (a) WHAT code the customer wants to add to the PageFly source in theme, and (b) the fact that the customer rejected the standard explanation (republish overwrite + use Custom CSS / JS / HTML-Liquid element instead). Example: 'Customer adding a custom GA tracking snippet to PageFly source in theme; rejected the Custom CSS/JS workaround and insists on persisting in theme source.', 'Customer wants to add a third-party widget loader script directly to PageFly source file; not satisfied with editor-side workaround.'"
    ),

  screenshot_urls: z
    .array(z.string().url())
    .optional()
    .describe(
      "OPTIONAL — screenshot URLs the customer pasted (the code they want to add, the file location, etc.)."
    ),

  customer_attached_files: z
    .boolean()
    .optional()
    .describe(
      "Set TRUE if the customer attached files directly in the Crisp chat (image upload, code snippet screenshot) instead of pasting links."
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
});

type EscalateSourceRevertInput = z.infer<typeof ESCALATE_SOURCE_REVERT_INPUT_SHAPE>;

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

const ESCALATE_SOURCE_REVERT_OUTPUT_SHAPE = z.object({
  issue_summary: z.string(),

  is_ready_for_escalation: z
    .boolean()
    .describe(
      "Always true once issue_description is non-empty. No access, editor-exit, or publish gates."
    ),

  missing_info: z
    .array(z.string())
    .describe(
      "Empty for this tool — only issue_description is required (enforced by schema min-length)."
    ),

  crisp_note: CRISP_NOTE,

  next_step_for_user: z.string(),

  note_posted: z.boolean(),

  note_post_error: z.string().optional(),

  session_match: SESSION_MATCH.optional(),
});

type EscalateSourceRevertOutput = z.infer<typeof ESCALATE_SOURCE_REVERT_OUTPUT_SHAPE>;

/**************************************************************************
 * EXPORTS
 ***************************************************************************/

export {
  ESCALATE_SOURCE_REVERT_INPUT_SHAPE,
  ESCALATE_SOURCE_REVERT_OUTPUT_SHAPE,
  type EscalateSourceRevertInput,
  type EscalateSourceRevertOutput,
};
