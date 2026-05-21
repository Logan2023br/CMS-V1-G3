/**************************************************************************
 * IMPORTS
 ***************************************************************************/

import { z } from "zod";

/**************************************************************************
 * INPUT SCHEMA
 *
 * Minimal shape — this tool does NOT collect editor link, screenshots,
 * publish consent, or editor-exit confirmation. The PageFly API request
 * is a single-rejection case: Hugo replies once with the standard
 * answer, and only escalates if the customer pushes back.
 ***************************************************************************/

const ESCALATE_API_INTEGRATION_INPUT_SHAPE = z.object({
  issue_description: z
    .string()
    .min(1)
    .describe(
      "Hugo's one-line paraphrase of the customer's request, ALWAYS IN ENGLISH. Example: 'Customer asks if PageFly can publish/integrate an API for their app; standard reply did not satisfy, requesting technical review.'"
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

type EscalateApiIntegrationInput = z.infer<typeof ESCALATE_API_INTEGRATION_INPUT_SHAPE>;

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

const ESCALATE_API_INTEGRATION_OUTPUT_SHAPE = z.object({
  issue_summary: z.string(),

  is_ready_for_escalation: z
    .boolean()
    .describe(
      "True iff issue_description is non-empty. This tool has no other gates."
    ),

  missing_info: z
    .array(z.string())
    .describe("Always empty for this tool."),

  crisp_note: CRISP_NOTE,

  next_step_for_user: z.string(),

  note_posted: z.boolean(),

  note_post_error: z.string().optional(),

  session_match: SESSION_MATCH.optional(),
});

type EscalateApiIntegrationOutput = z.infer<typeof ESCALATE_API_INTEGRATION_OUTPUT_SHAPE>;

/**************************************************************************
 * EXPORTS
 ***************************************************************************/

export {
  ESCALATE_API_INTEGRATION_INPUT_SHAPE,
  ESCALATE_API_INTEGRATION_OUTPUT_SHAPE,
  type EscalateApiIntegrationInput,
  type EscalateApiIntegrationOutput,
};
