/**************************************************************************
 * IMPORTS
 ***************************************************************************/

import type {
  EscalateScrollInput,
  EscalateScrollOutput,
} from "@/mcp/tools/escalate_scroll_issue/shapes.js";

/**************************************************************************
 * CONSTANTS
 ***************************************************************************/

const WAIT_MESSAGE =
  "Cảm ơn bạn đã cung cấp đầy đủ thông tin nhé 😊 Mình đã chuyển vấn đề này đến team technical để kiểm tra chi tiết. Bạn vui lòng chờ trong vài phút, team sẽ xem xét và phản hồi bạn sớm nhất có thể!";

type MissingField = "screenshot" | "editor_link";

const MISSING_FIELD_LABEL: Record<MissingField, string> = {
  screenshot: "hình ảnh (screenshot)",
  editor_link: "link editor",
};

const TICKET_URL_FALLBACK = "(unknown — tool was called without ticket_url)";

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

function looksLikePlaceholder(url: string | undefined): boolean {
  if (!url) return false;
  return PLACEHOLDER_PATTERNS.some((re) => re.test(url));
}

/**************************************************************************
 * CRISP API CLIENT
 ***************************************************************************/

interface CrispCreds {
  websiteId: string;
  identifier: string;
  key: string;
}

function readCrispCreds(): CrispCreds | null {
  const websiteId = process.env.CRISP_WEBSITE_ID;
  const identifier = process.env.CRISP_IDENTIFIER;
  const key = process.env.CRISP_KEY;
  if (!websiteId || !identifier || !key) return null;
  return { websiteId, identifier, key };
}

function buildAuthHeader(creds: CrispCreds): string {
  return `Basic ${Buffer.from(`${creds.identifier}:${creds.key}`).toString("base64")}`;
}

interface PostNoteResult {
  posted: boolean;
  error?: string;
  sessionUsed?: string;
  sessionSource?: "input" | "auto-latest";
}

async function postCrispPrivateNote(
  sessionId: string,
  content: string,
  creds: CrispCreds
): Promise<{ ok: boolean; error?: string }> {
  const url = `https://api.crisp.chat/v1/website/${creds.websiteId}/conversation/${sessionId}/message`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": buildAuthHeader(creds),
        "X-Crisp-Tier": "plugin",
      },
      body: JSON.stringify({
        type: "note",
        from: "operator",
        origin: "chat",
        content,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      return {
        ok: false,
        error: `Crisp API ${response.status}: ${body.slice(0, 500)}`,
      };
    }

    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Network/exception: ${message}` };
  }
}

// Best-effort fallback when Hugo does not pass crisp_session_id. Crisp
// does not currently expose the active session ID to MCP plugins, so we
// have to infer it. Strategy:
//   1) List recent conversations in the workspace.
//   2) Prefer the one whose last_message.content contains the URL Hugo
//      is escalating (screenshot_url or editor_link) — this is the
//      conversation where the visitor just pasted that URL.
//   3) Otherwise fall back to the most-recently-active conversation
//      whose last_message.from === "user".
//   4) Otherwise fall back to the single most-recent conversation.
// Any fallback past (2) is race-prone if multiple visitors are chatting
// at once and is surfaced as a warning.
interface ConversationLite {
  session_id?: string;
  last_message?: {
    timestamp?: number;
    from?: string; // "user" | "operator" | ...
    content?: string | { text?: string; url?: string };
  };
}

function lastMessageText(c: ConversationLite): string {
  const content = c.last_message?.content;
  if (typeof content === "string") return content;
  if (content && typeof content === "object") {
    return [content.text, content.url].filter(Boolean).join(" ");
  }
  return "";
}

async function findLatestActiveSession(
  creds: CrispCreds,
  matchTokens: string[]
): Promise<{ sessionId: string | null; error?: string; matchedBy?: string }> {
  const url = `https://api.crisp.chat/v1/website/${creds.websiteId}/conversations/1`;

  try {
    const response = await fetch(url, {
      headers: {
        "Authorization": buildAuthHeader(creds),
        "X-Crisp-Tier": "plugin",
      },
    });
    if (!response.ok) {
      const body = await response.text();
      return {
        sessionId: null,
        error: `Crisp list-conversations ${response.status}: ${body.slice(0, 300)}`,
      };
    }
    const json = (await response.json()) as { data?: unknown };
    const items = Array.isArray(json.data) ? (json.data as ConversationLite[]) : [];
    if (items.length === 0) {
      return { sessionId: null, error: "No conversations returned by Crisp." };
    }

    const byRecency = [...items].sort(
      (a, b) => (b.last_message?.timestamp ?? 0) - (a.last_message?.timestamp ?? 0)
    );

    // (1) Prefer a conversation whose last_message text contains the
    //     screenshot URL or editor link the user just pasted.
    for (const conv of byRecency) {
      const text = lastMessageText(conv);
      if (!text) continue;
      const hit = matchTokens.find((t) => t && text.includes(t));
      if (hit && conv.session_id) {
        return { sessionId: conv.session_id, matchedBy: `content:${hit}` };
      }
    }

    // (2) Otherwise prefer the most recent conversation whose last
    //     message is from the visitor.
    const userLast = byRecency.find((c) => c.last_message?.from === "user");
    if (userLast?.session_id) {
      return {
        sessionId: userLast.session_id,
        matchedBy: "user-last-message",
        error:
          "Warning: could not match a conversation by URL content; using most recent visitor-message conversation. This may be the wrong ticket if multiple visitors are active.",
      };
    }

    // (3) Fallback: most-recent conversation overall.
    const top = byRecency[0];
    if (!top.session_id) {
      return { sessionId: null, error: "Top conversation has no session_id field." };
    }
    return {
      sessionId: top.session_id,
      matchedBy: "most-recent",
      error:
        "Warning: no conversation had last_message.from === 'user' or matched any URL. Picked most-recently-active conversation as a last resort.",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { sessionId: null, error: `Network/exception: ${message}` };
  }
}

async function tryPostNote(
  hintedSessionId: string | undefined,
  content: string,
  matchTokens: string[]
): Promise<PostNoteResult> {
  const creds = readCrispCreds();
  if (!creds) {
    return {
      posted: false,
      error:
        "Crisp API credentials not configured (set CRISP_WEBSITE_ID, CRISP_IDENTIFIER, CRISP_KEY in .env).",
    };
  }

  // 1) If Hugo passed a session ID, prefer it.
  if (hintedSessionId) {
    const r = await postCrispPrivateNote(hintedSessionId, content, creds);
    if (r.ok) {
      return {
        posted: true,
        sessionUsed: hintedSessionId,
        sessionSource: "input",
      };
    }
    return {
      posted: false,
      error: `Posting to provided session ${hintedSessionId} failed: ${r.error}`,
      sessionUsed: hintedSessionId,
      sessionSource: "input",
    };
  }

  // 2) Auto-resolve: prefer the conversation whose last_message contains
  //    the user's pasted URLs, with weaker fallbacks below.
  const lookup = await findLatestActiveSession(creds, matchTokens);
  if (!lookup.sessionId) {
    return {
      posted: false,
      error: `No crisp_session_id provided and could not auto-resolve one: ${lookup.error}`,
    };
  }

  const r = await postCrispPrivateNote(lookup.sessionId, content, creds);
  if (r.ok) {
    return {
      posted: true,
      sessionUsed: lookup.sessionId,
      sessionSource: "auto-latest",
      error: lookup.error, // surface any matching warning even on success
    };
  }
  return {
    posted: false,
    error: `Auto-resolved session ${lookup.sessionId} (matched by ${lookup.matchedBy}) but posting failed: ${r.error}`,
    sessionUsed: lookup.sessionId,
    sessionSource: "auto-latest",
  };
}

/**************************************************************************
 * MAIN HANDLER
 ***************************************************************************/

async function escalateScrollIssueHandler(
  input: EscalateScrollInput
): Promise<EscalateScrollOutput> {
  const missing: MissingField[] = [];

  if (!input.screenshot_url) missing.push("screenshot");
  if (!input.editor_link) missing.push("editor_link");

  // Reject obvious placeholders / fabricated URLs. Hugo sometimes invents
  // values like "YOUR_STORE", "PAGE_ID", "dummyimage.com" to satisfy the
  // schema instead of asking the user. Treat these as "missing".
  if (input.screenshot_url && looksLikePlaceholder(input.screenshot_url)) {
    if (!missing.includes("screenshot")) missing.push("screenshot");
  }
  if (input.editor_link && looksLikePlaceholder(input.editor_link)) {
    if (!missing.includes("editor_link")) missing.push("editor_link");
  }

  if (missing.length > 0) {
    const labels = missing
      .map((key) => MISSING_FIELD_LABEL[key])
      .join(", ");

    return {
      issue_summary: "Cần thêm thông tin trước khi escalate cho technical team.",
      is_ready_for_escalation: false,
      missing_info: missing,
      crisp_note: {
        content: "",
        formatted_message: "",
      },
      next_step_for_user: `Để team technical kiểm tra giúp bạn nhanh nhất, bạn vui lòng gửi giúp mình ${labels} nhé 😊 Khi có đủ thông tin, mình sẽ chuyển ngay cho team xử lý.`,
      note_posted: false,
      note_post_error:
        "Not ready for escalation — Hugo MUST ask the user for the real screenshot URL and the real editor link, then call this tool again with the user's actual values. Do NOT fabricate placeholder URLs (no 'YOUR_STORE', no 'PAGE_ID', no 'dummyimage.com', etc.).",
    };
  }

  const noteContent =
    `Issue: ${input.issue_description}, đây là hình ảnh: ${input.screenshot_url}\n` +
    `Editor: ${input.editor_link}\n` +
    `Ticket: ${input.ticket_url ?? TICKET_URL_FALLBACK}`;

  const matchTokens = [input.screenshot_url, input.editor_link].filter(
    (s): s is string => typeof s === "string" && s.length > 0
  );
  const noteResult: PostNoteResult = await tryPostNote(
    input.crisp_session_id,
    noteContent,
    matchTokens
  );
  if (noteResult.posted) {
    console.log(
      `[escalate_scroll_issue] Posted Crisp note (session ${noteResult.sessionUsed}, source=${noteResult.sessionSource})`
    );
  } else {
    console.error(
      `[escalate_scroll_issue] Failed to post Crisp note: ${noteResult.error}`
    );
  }

  return {
    issue_summary: input.issue_description,
    is_ready_for_escalation: true,
    missing_info: [],
    crisp_note: {
      content: noteContent,
      formatted_message: noteContent,
    },
    next_step_for_user: WAIT_MESSAGE,
    note_posted: noteResult.posted,
    note_post_error: noteResult.error,
  };
}

/**************************************************************************
 * EXPORTS
 ***************************************************************************/

export { escalateScrollIssueHandler };
