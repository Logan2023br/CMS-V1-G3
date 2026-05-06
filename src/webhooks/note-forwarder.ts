/**************************************************************************
 * IMPORTS
 ***************************************************************************/

import {
  readCrispCreds,
  postCrispPrivateNote,
  postCrispText,
  fetchConversationMessages,
} from "@/lib/crisp.js";
import {
  buildPrompt,
  callClaude,
  parseClaudeResponse,
  stripHugoPrefix,
  type CustomerMessage,
} from "@/lib/anthropic.js";

/**************************************************************************
 * EXTRACT CUSTOMER MESSAGES
 ***************************************************************************/

const MAX_CUSTOMER_MESSAGES = 5;

interface CrispLikeMessage {
  type?: string;
  from?: string;
  content?: unknown;
}

function extractCustomerTexts(messages: CrispLikeMessage[]): CustomerMessage[] {
  const out: CustomerMessage[] = [];
  // Crisp returns oldest first; we want most-recent last (after slicing).
  for (const m of messages) {
    if (m.from !== "user") continue;
    if (m.type !== "text") continue;
    if (typeof m.content !== "string") continue;
    const text = m.content.trim();
    if (!text) continue;
    out.push({ text });
  }
  return out.slice(-MAX_CUSTOMER_MESSAGES);
}

/**************************************************************************
 * ORCHESTRATOR
 ***************************************************************************/

interface ForwardArgs {
  sessionId: string;
  noteContent: string;
}

async function forwardNoteToCustomer(args: ForwardArgs): Promise<void> {
  const { sessionId, noteContent } = args;
  const creds = readCrispCreds();
  if (!creds) {
    console.error(
      `[note-forwarder] session=${sessionId}: missing Crisp creds; cannot post anything.`
    );
    return;
  }

  // 1) Fetch last messages so Claude can detect language.
  const fetched = await fetchConversationMessages(sessionId, creds);
  if (fetched.error) {
    await postCrispPrivateNote(
      sessionId,
      `[Hugo failed: cannot fetch customer messages] ${fetched.error}`,
      creds
    );
    console.error(
      `[note-forwarder] session=${sessionId}: fetchConversationMessages failed: ${fetched.error}`
    );
    return;
  }
  const customerMessages = extractCustomerTexts(fetched.messages);

  // 2) Build prompt and call Claude.
  const prompt = buildPrompt({
    noteContentWithoutPrefix: stripHugoPrefix(noteContent),
    customerMessages,
  });
  const claudeResult = await callClaude(prompt);
  if (!claudeResult.ok || !claudeResult.text) {
    await postCrispPrivateNote(
      sessionId,
      `[Hugo failed to auto-reply]: ${claudeResult.error ?? "unknown error"}`,
      creds
    );
    console.error(
      `[note-forwarder] session=${sessionId}: Claude failed: ${claudeResult.error}`
    );
    return;
  }

  const parsed = parseClaudeResponse(claudeResult.text);
  if (parsed.kind === "skip") {
    await postCrispPrivateNote(
      sessionId,
      `[Hugo skipped: note not actionable]: ${noteContent}`,
      creds
    );
    console.log(`[note-forwarder] session=${sessionId}: NO_REPLY, skipped.`);
    return;
  }

  // 3) Post customer-facing text.
  const sendResult = await postCrispText(sessionId, parsed.text, creds);
  if (!sendResult.ok) {
    await postCrispPrivateNote(
      sessionId,
      `[Hugo failed to send to customer]: ${sendResult.error}`,
      creds
    );
    console.error(
      `[note-forwarder] session=${sessionId}: postCrispText failed: ${sendResult.error}`
    );
    return;
  }

  // 4) Post audit note.
  await postCrispPrivateNote(
    sessionId,
    `[Hugo auto-replied]: ${parsed.text}`,
    creds
  );
  console.log(
    `[note-forwarder] session=${sessionId}: replied (${parsed.text.length} chars)`
  );
}

/**************************************************************************
 * EXPORTS
 ***************************************************************************/

export { forwardNoteToCustomer, extractCustomerTexts };
