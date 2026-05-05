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

/**************************************************************************
 * EXPORTS (placeholders — implement in next tasks)
 ***************************************************************************/

function normalize(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function scoreConversation(
  _conv: ConversationLite,
  _inputs: ScoringInputs,
  _isTopWaitingSince: boolean,
  _isTopUpdatedAt: boolean
): ScoreResult {
  throw new Error("not implemented");
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
