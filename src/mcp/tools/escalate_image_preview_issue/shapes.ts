/**************************************************************************
 * IMPORTS
 ***************************************************************************/

import { z } from "zod";

/**************************************************************************
 * INPUT SCHEMA
 ***************************************************************************/

const ESCALATE_IMAGE_PREVIEW_INPUT_SHAPE = z.object({
  issue_description: z
    .string()
    .min(1)
    .describe(
      "Hugo's one-line paraphrase of the issue, ALWAYS IN ENGLISH. MUST include (a) what preview image the customer SET in PageFly, (b) what the live page actually SHOWS when shared (Shopify default? wrong image? blank?), and (c) where they observed it (Facebook, Twitter, Discord, link unfurl, etc.). Example: 'Customer set page preview image in PageFly SEO settings but Facebook share still shows Shopify default favicon.', 'PageFly preview image not used when sharing to Messenger; live page shows wrong og:image.'"
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
      "Screenshot URLs the user pasted showing both the PageFly-set preview image AND what actually shows on share (e.g. Facebook debugger / link preview). Optional in schema — but customer MUST provide visual evidence either as URL(s) OR via customer_attached_files=true."
    ),

  customer_attached_files: z
    .boolean()
    .optional()
    .describe(
      "Set TRUE if the user attached files directly in the Crisp chat (image upload, screen recording) instead of pasting links."
    ),

  publish_status: z
    .enum(["published", "only_save"])
    .describe(
      "Customer's explicit answer: 'published' = TS may publish the page after fix, 'only_save' = TS must only save without publishing. Ask first if you have not."
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

type EscalateImagePreviewInput = z.infer<typeof ESCALATE_IMAGE_PREVIEW_INPUT_SHAPE>;

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

const ESCALATE_IMAGE_PREVIEW_OUTPUT_SHAPE = z.object({
  issue_summary: z.string(),

  is_ready_for_escalation: z
    .boolean()
    .describe(
      "True iff editor_link is provided AND screenshot evidence is present (URL or attached file) AND publish_status is set AND store access is granted AND the customer has exited the editor."
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

type EscalateImagePreviewOutput = z.infer<typeof ESCALATE_IMAGE_PREVIEW_OUTPUT_SHAPE>;

/**************************************************************************
 * EXPORTS
 ***************************************************************************/

export {
  ESCALATE_IMAGE_PREVIEW_INPUT_SHAPE,
  ESCALATE_IMAGE_PREVIEW_OUTPUT_SHAPE,
  type EscalateImagePreviewInput,
  type EscalateImagePreviewOutput,
};
