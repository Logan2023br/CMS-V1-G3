/**************************************************************************
 * IMPORTS
 ***************************************************************************/

import { z } from "zod";

/**************************************************************************
 * INPUT SCHEMA
 ***************************************************************************/

const ESCALATE_AB_TESTING_INPUT_SHAPE = z.object({
  issue_description: z
    .string()
    .min(1)
    .describe(
      "Hugo's one-line paraphrase of the issue, ALWAYS IN ENGLISH. MUST classify the symptom: no data shown / data does not match real data / generic A/B Testing error. Example: 'A/B Testing dashboard shows no data despite running active test.', 'A/B Testing results do not match real conversion data from Shopify Reports.', 'A/B Testing feature throws error when opening dashboard.'"
    ),

  editor_link: z
    .string()
    .url()
    .optional()
    .describe(
      "OPTIONAL — the PageFly editor URL of the page running the test, if the customer provides it. May be omitted because this issue is about the A/B Testing dashboard/feature, not page rendering."
    ),

  screenshot_urls: z
    .array(z.string().url())
    .optional()
    .describe(
      "Screenshot URLs the user pasted showing the broken A/B Testing dashboard / error message. Optional in schema — but customer MUST provide visual evidence either as URL(s) OR via customer_attached_files=true."
    ),

  customer_attached_files: z
    .boolean()
    .optional()
    .describe(
      "Set TRUE if the user attached files directly in the Crisp chat (image upload, screen recording) instead of pasting links."
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

  customer_homepage_url: z
    .string()
    .url()
    .optional()
    .describe(
      "OPTIONAL — the customer's Shopify store homepage URL (e.g. https://yourstore.com). REQUIRED to be present when store access has not yet been granted, so the technical team's access-request note can reference the exact store. If you do not have it yet, Hugo MUST ask the customer first; the tool will surface 'customer_homepage_url' in missing_info if it is missing."
    ),
});

type EscalateAbTestingInput = z.infer<typeof ESCALATE_AB_TESTING_INPUT_SHAPE>;

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

const ESCALATE_AB_TESTING_OUTPUT_SHAPE = z.object({
  issue_summary: z.string(),

  is_ready_for_escalation: z
    .boolean()
    .describe(
      "True iff screenshot evidence is present (URL or attached file) AND store access is granted."
    ),

  missing_info: z
    .array(z.string())
    .describe(
      "List of fields still missing. Possible values: 'screenshot', 'store_access'."
    ),

  crisp_note: CRISP_NOTE,

  next_step_for_user: z.string(),

  note_posted: z.boolean(),

  note_post_error: z.string().optional(),

  session_match: SESSION_MATCH.optional(),
});

type EscalateAbTestingOutput = z.infer<typeof ESCALATE_AB_TESTING_OUTPUT_SHAPE>;

/**************************************************************************
 * EXPORTS
 ***************************************************************************/

export {
  ESCALATE_AB_TESTING_INPUT_SHAPE,
  ESCALATE_AB_TESTING_OUTPUT_SHAPE,
  type EscalateAbTestingInput,
  type EscalateAbTestingOutput,
};
