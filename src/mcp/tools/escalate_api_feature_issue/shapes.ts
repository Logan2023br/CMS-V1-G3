/**************************************************************************
 * IMPORTS
 ***************************************************************************/

import { z } from "zod";

/**************************************************************************
 * INPUT SCHEMA
 ***************************************************************************/

const ESCALATE_API_FEATURE_INPUT_SHAPE = z.object({
  issue_description: z
    .string()
    .min(1)
    .describe(
      "Hugo's one-line paraphrase of the issue, ALWAYS IN ENGLISH. MUST name the feature + symptom. Example: 'API translation feature returns error when translating product page.', 'Smart Page option not visible in customer account.', 'AI credits deducted but content generation failed; refund requested.', 'AI credit balance not updating after purchase.'"
    ),

  feature_type: z
    .enum([
      "api_translation",
      "smart_page",
      "ai_credit",
      "ai_credit_refund",
    ])
    .describe(
      "Which feature is broken. Use 'api_translation' for translation API errors, 'smart_page' for Smart Page feature missing/broken (no editor involved), 'ai_credit' for AI credit balance/usage errors, 'ai_credit_refund' when customer requests a refund of consumed credits."
    ),

  editor_link: z
    .string()
    .url()
    .optional()
    .describe(
      "PageFly editor URL of the affected page. REQUIRED for feature_type='api_translation' / 'ai_credit' / 'ai_credit_refund'. OMIT for feature_type='smart_page' (no editor page involved)."
    ),

  screenshot_urls: z
    .array(z.string().url())
    .optional()
    .describe(
      "Screenshot URLs the user pasted showing the error. Optional in schema — but customer MUST provide visual evidence either as URL(s) OR via customer_attached_files=true."
    ),

  customer_attached_files: z
    .boolean()
    .optional()
    .describe(
      "Set TRUE if the user attached files directly in the Crisp chat (image upload, screen recording) instead of pasting links."
    ),

  publish_status: z
    .enum(["published", "only_save"])
    .optional()
    .describe(
      "REQUIRED for feature_type='api_translation' / 'ai_credit' / 'ai_credit_refund'. OMIT for feature_type='smart_page' (no page to publish). 'published' = TS may publish after fix; 'only_save' = save only."
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

  user_exited_editor: z
    .boolean()
    .optional()
    .describe(
      "REQUIRED to be true for feature_type='api_translation' / 'ai_credit' / 'ai_credit_refund'. OMIT for feature_type='smart_page' (no editor involved). Concurrent editing causes a save conflict."
    ),
});

type EscalateApiFeatureInput = z.infer<typeof ESCALATE_API_FEATURE_INPUT_SHAPE>;

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

const ESCALATE_API_FEATURE_OUTPUT_SHAPE = z.object({
  issue_summary: z.string(),

  is_ready_for_escalation: z
    .boolean()
    .describe(
      "True iff (a) screenshot evidence is present AND store access is granted, AND (b) for non-smart_page feature_types: editor_link is set, publish_status is set, and the customer has exited the editor."
    ),

  missing_info: z
    .array(z.string())
    .describe(
      "List of fields still missing. Possible values: 'editor_link', 'screenshot', 'publish_status', 'store_access', 'editor_exit'."
    ),

  crisp_note: CRISP_NOTE,

  next_step_for_user: z.string(),

  note_posted: z.boolean(),

  note_post_error: z.string().optional(),

  session_match: SESSION_MATCH.optional(),
});

type EscalateApiFeatureOutput = z.infer<typeof ESCALATE_API_FEATURE_OUTPUT_SHAPE>;

/**************************************************************************
 * EXPORTS
 ***************************************************************************/

export {
  ESCALATE_API_FEATURE_INPUT_SHAPE,
  ESCALATE_API_FEATURE_OUTPUT_SHAPE,
  type EscalateApiFeatureInput,
  type EscalateApiFeatureOutput,
};
