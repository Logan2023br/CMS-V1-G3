/**************************************************************************
 * TYPES
 ***************************************************************************/

interface ConversationLite {
  session_id?: string;
  updated_at?: number;
  waiting_since?: number | null;
  last_message?: string;
}

interface ScoringInputs {
  customerLastMessageText?: string;
  screenshotUrl?: string;
  editorLink?: string;
}

interface ScoreResult {
  score: number;
  signalsMatched: string[];
}

interface BestSessionResult {
  sessionId: string | null;
  score: number;
  signalsMatched: string[];
  thresholdMet: boolean;
}

const SCORE_THRESHOLD = 50;
const SUBSTRING_MIN_LENGTH = 40;

function hasLongSubstring(haystack: string, needle: string, minLen: number): boolean {
  if (!needle || !haystack) return false;
  if (needle.length < minLen) {
    // Khi verbatim ngắn hơn ngưỡng, yêu cầu haystack chứa nguyên needle.
    return haystack.includes(needle);
  }
  // Trượt cửa sổ độ dài minLen trên needle, check xem haystack có chứa cửa sổ nào không.
  for (let i = 0; i + minLen <= needle.length; i++) {
    const window = needle.slice(i, i + minLen);
    if (haystack.includes(window)) return true;
  }
  return false;
}

/**************************************************************************
 * EXPORTS (placeholders — implement in next tasks)
 ***************************************************************************/

function normalize(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function scoreConversation(
  conv: ConversationLite,
  inputs: ScoringInputs,
  isTopWaitingSince: boolean,
  isTopUpdatedAt: boolean
): ScoreResult {
  const signalsMatched: string[] = [];
  let score = 0;

  const lastMessage = conv.last_message ?? "";
  const lastMessageNorm = normalize(lastMessage);

  const verbatim = inputs.customerLastMessageText?.trim() ?? "";
  if (verbatim) {
    const verbatimNorm = normalize(verbatim);
    if (lastMessageNorm === verbatimNorm) {
      score += 100;
      signalsMatched.push("exact_text");
    }
    if (hasLongSubstring(lastMessageNorm, verbatimNorm, SUBSTRING_MIN_LENGTH)) {
      score += 60;
      signalsMatched.push("substring_text");
    }
  }

  if (inputs.screenshotUrl && lastMessage.includes(inputs.screenshotUrl)) {
    score += 50;
    signalsMatched.push("url_screenshot");
  }
  if (inputs.editorLink && lastMessage.includes(inputs.editorLink)) {
    score += 50;
    signalsMatched.push("url_editor");
  }
  if (isTopWaitingSince) {
    score += 20;
    signalsMatched.push("waiting_since_top");
  }
  if (isTopUpdatedAt) {
    score += 5;
    signalsMatched.push("updated_at_top");
  }

  return { score, signalsMatched };
}

function findBestSession(
  _conversations: ConversationLite[],
  _inputs: ScoringInputs
): BestSessionResult {
  throw new Error("not implemented");
}

export {
  SCORE_THRESHOLD,
  SUBSTRING_MIN_LENGTH,
  normalize,
  scoreConversation,
  findBestSession,
  type ConversationLite,
  type ScoringInputs,
  type ScoreResult,
  type BestSessionResult,
};
