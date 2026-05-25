/**************************************************************************
 * IMPORTS
 ***************************************************************************/

import type {
  EscalateFreeServiceInput,
  EscalateFreeServiceOutput,
} from "@/mcp/tools/escalate_free_service_issue/shapes.js";
import {
  filterValidUrls,
  formatReferenceMedia,
  looksLikePlaceholder,
  pickMissingInfoMessage,
  pickWaitMessage,
  translateIssueToEnglish,
  tryPostNoteWithScoring,
  type PostNoteResult,
} from "@/lib/escalation-shared.js";
import { requireStoreAccess } from "@/lib/store-access.js";
import { requireEditorExit } from "@/lib/editor-exit.js";

/**************************************************************************
 * CONSTANTS
 ***************************************************************************/

type MissingField = "editor_link" | "publish_status";

const MISSING_LABELS_EN: Record<MissingField, string> = {
  editor_link: "the editor link for the affected page",
  publish_status:
    "whether the technical team may publish the page after adding the feature or only save it",
};

const PUBLISH_STATUS_LABEL: Record<"published" | "only_save", string> = {
  published: "Allowed to publish",
  only_save: "Only Save",
};

/**************************************************************************
 * NOTE FORMAT
 ***************************************************************************/

interface FreeServiceNoteFields {
  issueDescription: string;
  editorLink: string;
  referenceUrls: string[];
  customerAttachedFiles: boolean;
  publishStatus: "published" | "only_save";
}

function formatFreeServiceNoteContent(
  fields: FreeServiceNoteFields,
  ticketUrl: string
): string {
  const referenceFragment = formatReferenceMedia(
    {
      urls: fields.referenceUrls,
      hasAttachedFiles: fields.customerAttachedFiles,
    },
    "reference"
  );
  const issueLine = referenceFragment
    ? `Issue: ${fields.issueDescription}, ${referenceFragment}`
    : `Issue: ${fields.issueDescription}`;
  const statusLine = PUBLISH_STATUS_LABEL[fields.publishStatus];

  return `${issueLine}\nEditor: ${fields.editorLink}\nTicket: ${ticketUrl}\n${statusLine}`;
}

/**************************************************************************
 * MAIN HANDLER
 ***************************************************************************/

type AccessChecker = typeof requireStoreAccess;

async function escalateFreeServiceIssueHandler(
  input: EscalateFreeServiceInput,
  accessChecker: AccessChecker = requireStoreAccess
): Promise<EscalateFreeServiceOutput> {
  const access = await accessChecker(
    input.crisp_session_id ?? "",
    input.customer_last_message_text
  );
  if (!access.ready) {
    return {
      issue_summary: "Need Shopify store access before escalating to the technical team.",
      session_match: undefined,
      ...access.output,
    } as EscalateFreeServiceOutput;
  }

  const editorExit = await requireEditorExit(
    input.user_exited_editor,
    input.customer_last_message_text
  );
  if (!editorExit.ready) {
    return {
      issue_summary:
        "Need confirmation that the customer has exited the editor before escalating.",
      session_match: undefined,
      ...editorExit.output,
    } as EscalateFreeServiceOutput;
  }

  const missing: MissingField[] = [];

  if (!input.editor_link || looksLikePlaceholder(input.editor_link)) {
    missing.push("editor_link");
  }
  if (
    input.publish_status !== "published" &&
    input.publish_status !== "only_save"
  ) {
    missing.push("publish_status");
  }

  if (missing.length > 0) {
    const labelsEn = missing.map((key) => MISSING_LABELS_EN[key]).join(", ");
    return {
      issue_summary: "Need more information before escalating to the technical team.",
      is_ready_for_escalation: false,
      missing_info: missing,
      crisp_note: { content: "", formatted_message: "" },
      next_step_for_user: await pickMissingInfoMessage(
        input.customer_last_message_text,
        labelsEn
      ),
      note_posted: false,
      note_post_error:
        "Not ready for escalation — Hugo MUST collect the real editor link and the publish_status answer. Do NOT fabricate URLs or status values.",
    };
  }

  const editorLink = input.editor_link as string;
  const validReferenceUrls = filterValidUrls(input.reference_urls);
  const hasFiles = input.customer_attached_files === true;

  const issueDescriptionEn = await translateIssueToEnglish(input.issue_description);

  const noteResult: PostNoteResult = await tryPostNoteWithScoring({
    hintedSessionId: input.crisp_session_id,
    fields: {
      issueDescription: issueDescriptionEn,
      editorLink,
      referenceUrls: validReferenceUrls,
      customerAttachedFiles: hasFiles,
      publishStatus: input.publish_status,
    },
    providedTicketUrl: input.ticket_url,
    scoringInputs: {
      customerLastMessageText: input.customer_last_message_text,
      screenshotUrl: validReferenceUrls[0],
      editorLink,
    },
    formatNote: formatFreeServiceNoteContent,
  });

  if (noteResult.posted) {
    console.log(
      `[escalate_free_service_issue] match: session=${noteResult.sessionUsed} source=${noteResult.sessionSource} score=${noteResult.match?.score ?? "n/a"} signals=[${noteResult.match?.signalsMatched.join(", ") ?? ""}] posted=true`
    );
  } else {
    console.error(
      `[escalate_free_service_issue] match: posted=false error=${noteResult.error}`
    );
  }

  return {
    issue_summary: input.issue_description,
    is_ready_for_escalation: true,
    missing_info: [],
    crisp_note: {
      content: noteResult.noteContent,
      formatted_message: noteResult.noteContent,
    },
    next_step_for_user: await pickWaitMessage(input.customer_last_message_text),
    note_posted: noteResult.posted,
    note_post_error: noteResult.error,
    session_match: noteResult.match
      ? {
          score: noteResult.match.score,
          signals_matched: noteResult.match.signalsMatched,
          threshold_met: noteResult.match.thresholdMet,
        }
      : undefined,
  };
}

/**************************************************************************
 * EXPORTS
 ***************************************************************************/

export { escalateFreeServiceIssueHandler, formatFreeServiceNoteContent };
