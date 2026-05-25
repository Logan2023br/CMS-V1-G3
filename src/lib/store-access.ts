/**************************************************************************
 * IMPORTS
 ***************************************************************************/

import { hasVietnameseDiacritics } from "@/lib/escalation-shared.js";
import { generateCustomerReply, stripSlackBridgePrefix } from "@/lib/anthropic.js";
import type { CrispMeta } from "@/lib/crisp.js";
import {
  readCrispCreds,
  postCrispPrivateNote,
  fetchConversationMeta,
  type CrispCreds,
} from "@/lib/crisp.js";

/**************************************************************************
 * CONSTANTS — customer-facing wait messages (when access pending)
 ***************************************************************************/

const ACCESS_PENDING_WAIT_VI =
  "Mình đang xin access store để team technical kiểm tra giúp bạn, vui lòng đợi một chút nhé 😊";

const ACCESS_PENDING_WAIT_EN =
  "I'm requesting access to your store so our technical team can investigate, please give us a few minutes 😊";

/**************************************************************************
 * CONSTANTS — TS-facing note when posting the access request
 *
 * Always English. The Crisp operator @Logan is mentioned via Crisp's
 * `mentions` API field (operator UUID) so the assignee receives an email
 * notification — the textual "@Logan" in content is for human readers.
 ***************************************************************************/

const LOGAN_OPERATOR_ID = "11c92319-89c1-42be-b4da-2bf5e40568c3";

const AT_LOGAN_REQUIRED_PERMISSIONS =
  "Home, Products, Customers, Discounts, Content, Online Store, " +
  "App Development, Store settings, Manage and install apps and channels";

function buildAtLoganNoteContent(homepageUrl: string): string {
  return (
    "@Logan please request collaborator access to this store.\n" +
    `Homepage: ${homepageUrl}\n` +
    `Required permissions: ${AT_LOGAN_REQUIRED_PERMISSIONS}`
  );
}

/**
 * @deprecated — kept for backward compat with existing tests/imports. Use
 * buildAtLoganNoteContent(homepageUrl) instead; this constant has no
 * homepage URL and is not used by the runtime gate.
 */
const AT_LOGAN_NOTE_CONTENT =
  "@Logan please request collaborator access to this store.\n" +
  `Required permissions: ${AT_LOGAN_REQUIRED_PERMISSIONS}`;

/**************************************************************************
 * CONSTANTS — customer-facing access instructions after TS grants access
 * (translated to customer language at webhook time)
 ***************************************************************************/

const ENGLISH_ACCESS_INSTRUCTIONS =
  "I need to access your store administration to take a look and just sent a collaborator access request. Minimum permissions are requested. Just enough for us to examine the issue.\n\n" +
  "If you are ok with that, please visit your Shopify Dashboard => Check the notification, and accept the request.\n" +
  "You will see our request like this: https://drive.google.com/file/d/1dZijbCDVp_F57MG3RArK2-DaItN84hEF/view\n\n" +
  "Once you have accepted the request, please leave a message here to let me know and I will assist you right away!";

/**************************************************************************
 * PATTERN MATCH — webhook recognizes the access-acknowledged note
 ***************************************************************************/

const ACCESS_ACK_PREFIX = "hugo: đã xin access xong";

function matchAccessAcknowledged(content: string | undefined): boolean {
  if (!content) return false;
  const cleaned = stripSlackBridgePrefix(content).trim().toLowerCase();
  return cleaned.startsWith(ACCESS_ACK_PREFIX);
}

/**************************************************************************
 * STORE ACCESS DETECTION
 ***************************************************************************/

function hasStoreAccess(meta: CrispMeta | undefined): boolean {
  if (!meta) return false;
  const v = meta.data?.data?.store_access;
  return typeof v === "string" && v.trim().length > 0;
}

/**************************************************************************
 * WAIT MESSAGE PICKER
 ***************************************************************************/

function fallbackAccessPendingWaitMessage(customerText: string | undefined): string {
  return hasVietnameseDiacritics(customerText) ? ACCESS_PENDING_WAIT_VI : ACCESS_PENDING_WAIT_EN;
}

async function pickAccessPendingWaitMessage(
  customerText: string | undefined
): Promise<string> {
  const result = await generateCustomerReply({
    intent: "access_pending",
    customerLastMessage: customerText,
  });
  if (result.ok && result.text && result.text.trim().length > 0) {
    return result.text.trim();
  }
  return fallbackAccessPendingWaitMessage(customerText);
}

/**************************************************************************
 * ASK-HOMEPAGE MESSAGE PICKER
 *
 * Used when access is pending AND we don't yet have the customer's store
 * homepage URL. Asks the customer to share their homepage so the @Logan
 * note can name the exact store.
 ***************************************************************************/

const ASK_HOMEPAGE_VI =
  "Trước khi mình xin access cho team kỹ thuật, bạn vui lòng gửi mình link homepage store của bạn nhé (ví dụ: https://yourstore.com)?";

const ASK_HOMEPAGE_EN =
  "Before we request access for the technical team, could you share your store homepage link (e.g. https://yourstore.com)?";

function fallbackAskHomepageMessage(customerText: string | undefined): string {
  return hasVietnameseDiacritics(customerText) ? ASK_HOMEPAGE_VI : ASK_HOMEPAGE_EN;
}

async function pickAskHomepageMessage(
  customerText: string | undefined
): Promise<string> {
  const result = await generateCustomerReply({
    intent: "ask_homepage",
    customerLastMessage: customerText,
  });
  if (result.ok && result.text && result.text.trim().length > 0) {
    return result.text.trim();
  }
  return fallbackAskHomepageMessage(customerText);
}

/**************************************************************************
 * HOMEPAGE URL VALIDATION
 ***************************************************************************/

function isValidHomepageUrl(value: string | undefined): boolean {
  if (!value || typeof value !== "string") return false;
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;
  try {
    const u = new URL(trimmed);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/**************************************************************************
 * ORCHESTRATOR — requireStoreAccess
 ***************************************************************************/

interface AccessOutputPartial {
  is_ready_for_escalation: false;
  missing_info: string[];
  crisp_note: { content: ""; formatted_message: "" };
  next_step_for_user: string;
  note_posted: boolean;
  note_post_error?: string;
}

type AccessCheckResult =
  | { ready: true }
  | { ready: false; output: AccessOutputPartial };

async function requireStoreAccess(
  sessionId: string,
  customerLastMessageText?: string,
  customerHomepageUrl?: string
): Promise<AccessCheckResult> {
  if (!sessionId) {
    return {
      ready: false,
      output: {
        is_ready_for_escalation: false,
        missing_info: ["store_access"],
        crisp_note: { content: "", formatted_message: "" },
        next_step_for_user: await pickAccessPendingWaitMessage(customerLastMessageText),
        note_posted: false,
        note_post_error: "Missing crisp_session_id — cannot check store access.",
      },
    };
  }

  const creds = readCrispCreds();
  if (!creds) {
    return {
      ready: false,
      output: {
        is_ready_for_escalation: false,
        missing_info: ["store_access"],
        crisp_note: { content: "", formatted_message: "" },
        next_step_for_user: await pickAccessPendingWaitMessage(customerLastMessageText),
        note_posted: false,
        note_post_error:
          "Crisp API credentials not configured (set CRISP_WEBSITE_ID, CRISP_IDENTIFIER, CRISP_KEY in .env).",
      },
    };
  }

  // 1) Try to fetch meta. Failure or no access → fall through to access-request path.
  const metaResult = await fetchConversationMeta(sessionId, creds);
  if (!metaResult.error && hasStoreAccess(metaResult.meta)) {
    return { ready: true };
  }

  // 2) Access is NOT granted. Before posting the @Logan note, ensure we have
  // the customer's homepage URL — Logan needs to know which store to send
  // the access request to. If not provided, ask the customer first.
  if (!isValidHomepageUrl(customerHomepageUrl)) {
    return {
      ready: false,
      output: {
        is_ready_for_escalation: false,
        missing_info: ["customer_homepage_url"],
        crisp_note: { content: "", formatted_message: "" },
        next_step_for_user: await pickAskHomepageMessage(customerLastMessageText),
        note_posted: false,
      },
    };
  }

  // 3) Have homepage URL → post @Logan note (English, with mentions) and
  // return access-pending wait message to the customer.
  return requestAccessViaLogan(
    sessionId,
    creds,
    customerLastMessageText,
    (customerHomepageUrl as string).trim(),
    metaResult.error
  );
}

async function requestAccessViaLogan(
  sessionId: string,
  creds: CrispCreds,
  customerLastMessageText: string | undefined,
  customerHomepageUrl: string,
  metaError?: string
): Promise<AccessCheckResult> {
  const noteContent = buildAtLoganNoteContent(customerHomepageUrl);
  const post = await postCrispPrivateNote(sessionId, noteContent, creds, [
    LOGAN_OPERATOR_ID,
  ]);
  const errors: string[] = [];
  if (metaError) errors.push(`meta: ${metaError}`);
  if (!post.ok && post.error) errors.push(`note: ${post.error}`);

  return {
    ready: false,
    output: {
      is_ready_for_escalation: false,
      missing_info: ["store_access"],
      crisp_note: { content: "", formatted_message: "" },
      next_step_for_user: await pickAccessPendingWaitMessage(customerLastMessageText),
      note_posted: post.ok,
      note_post_error: errors.length > 0 ? errors.join(" | ") : undefined,
    },
  };
}

/**************************************************************************
 * EXPORTS
 ***************************************************************************/

export {
  ACCESS_PENDING_WAIT_VI,
  ACCESS_PENDING_WAIT_EN,
  ASK_HOMEPAGE_VI,
  ASK_HOMEPAGE_EN,
  AT_LOGAN_NOTE_CONTENT,
  AT_LOGAN_REQUIRED_PERMISSIONS,
  LOGAN_OPERATOR_ID,
  buildAtLoganNoteContent,
  ENGLISH_ACCESS_INSTRUCTIONS,
  ACCESS_ACK_PREFIX,
  hasStoreAccess,
  isValidHomepageUrl,
  pickAccessPendingWaitMessage,
  pickAskHomepageMessage,
  matchAccessAcknowledged,
  requireStoreAccess,
  type AccessCheckResult,
  type AccessOutputPartial,
};
