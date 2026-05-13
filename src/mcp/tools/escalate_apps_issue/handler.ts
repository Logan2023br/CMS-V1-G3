/**************************************************************************
 * IMPORTS
 ***************************************************************************/

import type {
  EscalateAppsInput,
  EscalateAppsOutput,
} from "@/mcp/tools/escalate_apps_issue/shapes.js";
import {
  WAIT_MESSAGE,
  looksLikePlaceholder,
  tryPostNoteWithScoring,
  type PostNoteResult,
} from "@/lib/escalation-shared.js";

/**************************************************************************
 * CONSTANTS
 ***************************************************************************/

type MissingField = "editor_links" | "media_urls" | "publish_status";

const MISSING_FIELD_LABEL: Record<MissingField, string> = {
  editor_links: "link editor",
  media_urls: "hình ảnh hoặc video",
  publish_status: "trạng thái publish (đã publish hay chỉ save)",
};

const PUBLISH_STATUS_LABEL: Record<"published" | "only_save", string> = {
  published: "Allowed to publish",
  only_save: "Only Save",
};

/**************************************************************************
 * URL FILTERING
 ***************************************************************************/

function filterValidUrls(urls: string[] | undefined): string[] {
  if (!Array.isArray(urls)) return [];
  return urls.filter((u) => typeof u === "string" && u.length > 0 && !looksLikePlaceholder(u));
}

/**************************************************************************
 * NOTE FORMAT
 ***************************************************************************/

interface AppsNoteFields {
  issueDescription: string;
  editorLinks: string[];
  mediaUrls: string[];
  publishStatus: "published" | "only_save";
}

function formatAppsNoteContent(fields: AppsNoteFields, ticketUrl: string): string {
  // Defense in depth: filter placeholders again at the formatter so it stays
  // correct even if a caller skips the missing-info gate.
  const editors = filterValidUrls(fields.editorLinks);
  const media = filterValidUrls(fields.mediaUrls);

  const issueLine = `Issue: ${fields.issueDescription}, editor: ${editors.join(", ")}, hình ảnh/video: ${media.join(", ")}`;
  const statusLine = PUBLISH_STATUS_LABEL[fields.publishStatus];

  return `${issueLine}\nTicket: ${ticketUrl}\n${statusLine}`;
}

/**************************************************************************
 * MAIN HANDLER
 ***************************************************************************/

async function escalateAppsIssueHandler(
  input: EscalateAppsInput
): Promise<EscalateAppsOutput> {
  const validEditors = filterValidUrls(input.editor_links);
  const validMedia = filterValidUrls(input.media_urls);

  const missing: MissingField[] = [];
  if (validEditors.length === 0) missing.push("editor_links");
  if (validMedia.length === 0) missing.push("media_urls");
  if (input.publish_status !== "published" && input.publish_status !== "only_save") {
    missing.push("publish_status");
  }

  if (missing.length > 0) {
    const labels = missing.map((key) => MISSING_FIELD_LABEL[key]).join(", ");
    return {
      issue_summary: "Cần thêm thông tin trước khi escalate cho technical team.",
      is_ready_for_escalation: false,
      missing_info: missing,
      crisp_note: { content: "", formatted_message: "" },
      next_step_for_user: `Để team technical kiểm tra giúp bạn nhanh nhất, bạn vui lòng gửi giúp mình ${labels} nhé 😊 Khi có đủ thông tin, mình sẽ chuyển ngay cho team xử lý.`,
      note_posted: false,
      note_post_error:
        "Not ready for escalation — Hugo MUST ask the user for the real editor link(s), image/video showing the issue, and publish status. Do NOT fabricate URLs or status values.",
    };
  }

  // Use a representative editor URL + first media URL for hybrid session scoring.
  // The scoring inputs match what scroll/cart use, just adapted to arrays.
  const scoringInputs = {
    customerLastMessageText: input.customer_last_message_text,
    screenshotUrl: validMedia[0],
    editorLink: validEditors[0],
  };

  const noteResult: PostNoteResult = await tryPostNoteWithScoring({
    hintedSessionId: input.crisp_session_id,
    fields: {
      issueDescription: input.issue_description,
      editorLinks: validEditors,
      mediaUrls: validMedia,
      publishStatus: input.publish_status,
    },
    providedTicketUrl: input.ticket_url,
    scoringInputs,
    formatNote: formatAppsNoteContent,
  });

  if (noteResult.posted) {
    console.log(
      `[escalate_apps_issue] match: session=${noteResult.sessionUsed} source=${noteResult.sessionSource} score=${noteResult.match?.score ?? "n/a"} signals=[${noteResult.match?.signalsMatched.join(", ") ?? ""}] posted=true`
    );
  } else {
    console.error(
      `[escalate_apps_issue] match: posted=false error=${noteResult.error}`
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
    next_step_for_user: WAIT_MESSAGE,
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

export { escalateAppsIssueHandler, formatAppsNoteContent };
