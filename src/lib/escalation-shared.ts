import {
  readCrispCreds,
  postCrispPrivateNote,
  fetchHugoConversations,
} from "@/lib/crisp.js";
import {
  findBestSession,
  type ScoringInputs,
} from "@/lib/scoring.js";

/**************************************************************************
 * CONSTANTS
 ***************************************************************************/

// Customer-facing "we forwarded it, please wait" message in two languages.
// Tool returns the appropriate variant based on whether the customer's most
// recent message contains Vietnamese diacritics.
const WAIT_MESSAGE_VI =
  "Cảm ơn bạn đã cung cấp đầy đủ thông tin nhé 😊 Mình đã chuyển vấn đề này đến team technical để kiểm tra chi tiết. Bạn vui lòng chờ trong vài phút, team sẽ xem xét và phản hồi bạn sớm nhất có thể!";

const WAIT_MESSAGE_EN =
  "Thank you for sharing all the details 😊 I've forwarded this to our technical team for a closer look. Please give them a few minutes — they'll review and reply as soon as possible!";

const TICKET_URL_FALLBACK = "(unknown — tool was called without ticket_url)";

// Vietnamese has unique combining diacritics that no other Latin-based
// language uses. Presence of any of these characters strongly indicates
// the customer is writing Vietnamese. Absence defaults to English, which
// covers the vast majority of non-Vietnamese PageFly customers.
const VIETNAMESE_DIACRITIC_RE =
  /[ăâđêôơưàằầèềìòồờùừỳáắấéếíóốớúứýảẳẩẻểỉỏổởủửỷãẵẫẽễĩõỗỡũữỹạặậẹệịọộợụựỵ]/i;

function hasVietnameseDiacritics(text: string | undefined): boolean {
  if (!text) return false;
  return VIETNAMESE_DIACRITIC_RE.test(text);
}

function pickWaitMessage(customerText: string | undefined): string {
  return hasVietnameseDiacritics(customerText) ? WAIT_MESSAGE_VI : WAIT_MESSAGE_EN;
}

function pickMissingInfoMessage(
  customerText: string | undefined,
  labelsText: string
): string {
  if (hasVietnameseDiacritics(customerText)) {
    return `Để team technical kiểm tra giúp bạn nhanh nhất, bạn vui lòng gửi giúp mình ${labelsText} nhé 😊 Khi có đủ thông tin, mình sẽ chuyển ngay cho team xử lý.`;
  }
  return `To help our technical team check this as fast as possible, please share ${labelsText} with me 😊 Once I have all the info, I'll forward it to the team right away.`;
}

const PLACEHOLDER_PATTERNS: RegExp[] = [
  /YOUR_STORE/i,
  /YOUR_SHOP/i,
  /YOUR_DOMAIN/i,
  /STORE_NAME/i,
  /SHOP_NAME/i,
  /PAGE_ID/i,
  /<[^<>]+>/, // angle-bracket placeholders like <store_name>
  /\{[^{}]+\}/, // curly-brace placeholders like {store_name}
  /dummyimage\.com/i,
  /placehold(er|it|\.co)/i,
  /\bexample\.(com|org|net)\b/i,
  /\bfake[-_/]/i,
  /\bsample[-_/]/i,
  /\btest[-_/]?(image|url|store|page)\b/i,
  /lorempixel/i,
  /loremipsum/i,
];

/**************************************************************************
 * FUNCTIONS
 ***************************************************************************/

function looksLikePlaceholder(url: string | undefined): boolean {
  if (!url) return false;
  return PLACEHOLDER_PATTERNS.some((re) => re.test(url));
}

function buildTicketUrl(websiteId: string, sessionId: string): string {
  return `https://app.crisp.chat/website/${websiteId}/inbox/${sessionId}`;
}

/**************************************************************************
 * POST-WITH-SCORING GENERIC
 ***************************************************************************/

interface SessionMatchInfo {
  score: number;
  signalsMatched: string[];
  thresholdMet: boolean;
}

interface PostNoteResult {
  posted: boolean;
  error?: string;
  sessionUsed?: string;
  sessionSource?: "input" | "scored";
  match?: SessionMatchInfo;
  noteContent: string;
}

interface TryPostArgs<TFields> {
  hintedSessionId?: string;
  fields: TFields;
  providedTicketUrl?: string;
  scoringInputs: ScoringInputs;
  formatNote: (fields: TFields, ticketUrl: string) => string;
}

async function tryPostNoteWithScoring<TFields>(
  args: TryPostArgs<TFields>
): Promise<PostNoteResult> {
  const { hintedSessionId, fields, providedTicketUrl, scoringInputs, formatNote } = args;

  const creds = readCrispCreds();
  if (!creds) {
    return {
      posted: false,
      error:
        "Crisp API credentials not configured (set CRISP_WEBSITE_ID, CRISP_IDENTIFIER, CRISP_KEY in .env).",
      noteContent: formatNote(fields, providedTicketUrl ?? TICKET_URL_FALLBACK),
    };
  }

  // 1) Hugo truyền session_id → POST thẳng, không cần scoring.
  if (hintedSessionId) {
    const ticketUrl = providedTicketUrl ?? buildTicketUrl(creds.websiteId, hintedSessionId);
    const noteContent = formatNote(fields, ticketUrl);
    const r = await postCrispPrivateNote(hintedSessionId, noteContent, creds);
    if (r.ok) {
      return {
        posted: true,
        sessionUsed: hintedSessionId,
        sessionSource: "input",
        noteContent,
      };
    }
    return {
      posted: false,
      error: `Posting to provided session ${hintedSessionId} failed: ${r.error}`,
      sessionUsed: hintedSessionId,
      sessionSource: "input",
      noteContent,
    };
  }

  // 2) Auto-resolve qua hybrid scoring.
  const list = await fetchHugoConversations(creds);
  if (list.error) {
    return {
      posted: false,
      error: list.error,
      noteContent: formatNote(fields, providedTicketUrl ?? TICKET_URL_FALLBACK),
    };
  }
  if (list.conversations.length === 0) {
    return {
      posted: false,
      error: "Hugo's inbox không có conversation nào để match.",
      noteContent: formatNote(fields, providedTicketUrl ?? TICKET_URL_FALLBACK),
    };
  }

  const best = findBestSession(list.conversations, scoringInputs);
  const matchInfo: SessionMatchInfo = {
    score: best.score,
    signalsMatched: best.signalsMatched,
    thresholdMet: best.thresholdMet,
  };

  if (!best.thresholdMet || !best.sessionId) {
    return {
      posted: false,
      error: `Không tìm thấy conversation đủ tin cậy (top score ${best.score} < threshold 50). Signals: [${best.signalsMatched.join(", ")}]. Hugo nên xin user paste lại link hoặc dev xử tay.`,
      match: matchInfo,
      noteContent: formatNote(fields, providedTicketUrl ?? TICKET_URL_FALLBACK),
    };
  }

  const ticketUrl = providedTicketUrl ?? buildTicketUrl(creds.websiteId, best.sessionId);
  const noteContent = formatNote(fields, ticketUrl);
  const r = await postCrispPrivateNote(best.sessionId, noteContent, creds);
  if (r.ok) {
    return {
      posted: true,
      sessionUsed: best.sessionId,
      sessionSource: "scored",
      match: matchInfo,
      noteContent,
    };
  }
  return {
    posted: false,
    error: `Auto-resolved session ${best.sessionId} (score ${best.score}, signals [${best.signalsMatched.join(", ")}]) but POSTing failed: ${r.error}`,
    sessionUsed: best.sessionId,
    sessionSource: "scored",
    match: matchInfo,
    noteContent,
  };
}

/**************************************************************************
 * EXPORTS
 ***************************************************************************/

export {
  WAIT_MESSAGE_VI,
  WAIT_MESSAGE_EN,
  TICKET_URL_FALLBACK,
  PLACEHOLDER_PATTERNS,
  looksLikePlaceholder,
  buildTicketUrl,
  hasVietnameseDiacritics,
  pickWaitMessage,
  pickMissingInfoMessage,
  tryPostNoteWithScoring,
  type SessionMatchInfo,
  type PostNoteResult,
};
