/**************************************************************************
 * TYPES
 ***************************************************************************/

interface CustomerMessage {
  text: string;
}

interface BuildPromptInputs {
  noteContentWithoutPrefix: string;
  customerMessages: CustomerMessage[];
}

interface BuildPromptOutput {
  system: string;
  userMessage: string;
}

const SYSTEM_PROMPT =
  `You are an assistant that translates and rephrases internal support notes into customer-facing messages.\n\n` +
  `The technical support team writes a note in Vietnamese starting with "Hugo:". Your job:\n` +
  `1. Detect the customer's language from their recent messages (provided).\n` +
  `2. Rewrite the note's intent as a friendly, natural customer-facing message in THAT language.\n` +
  `3. Preserve all URLs, image links, and video links exactly as written (do NOT translate or shorten URLs).\n` +
  `4. Use a warm, polite tone matching PageFly support style.\n` +
  `5. Output ONLY the customer-facing message text — no preamble, no "here's the translation:", no markdown.\n\n` +
  `If the note is unclear or contains no actionable content, output the single token: NO_REPLY`;

/**************************************************************************
 * PROMPT BUILDER
 ***************************************************************************/

function buildPrompt(inputs: BuildPromptInputs): BuildPromptOutput {
  const lines: string[] = [];
  if (inputs.customerMessages.length === 0) {
    lines.push(
      "Customer's recent messages: (none — default to English if note language is ambiguous)"
    );
  } else {
    lines.push("Customer's recent messages (most recent last):");
    inputs.customerMessages.forEach((m, i) => {
      lines.push(`${i + 1}. ${JSON.stringify(m.text)}`);
    });
  }
  lines.push("");
  lines.push("TS note (translate intent + preserve URLs):");
  lines.push(JSON.stringify(inputs.noteContentWithoutPrefix));

  return {
    system: SYSTEM_PROMPT,
    userMessage: lines.join("\n"),
  };
}

/**************************************************************************
 * RESPONSE PARSER
 ***************************************************************************/

function parseClaudeResponse(rawText: string): { kind: "reply"; text: string } | { kind: "skip" } {
  const trimmed = rawText.trim();
  if (trimmed === "NO_REPLY" || trimmed === "") {
    return { kind: "skip" };
  }
  return { kind: "reply", text: trimmed };
}

/**************************************************************************
 * NOTE PREFIX UTIL
 ***************************************************************************/

const NOTE_TRIGGER_PREFIX = "hugo:";

function stripHugoPrefix(content: string): string {
  // Removes a leading "Hugo:" (case-insensitive) plus surrounding whitespace.
  const trimmed = content.trim();
  if (trimmed.toLowerCase().startsWith(NOTE_TRIGGER_PREFIX)) {
    return trimmed.slice(NOTE_TRIGGER_PREFIX.length).trim();
  }
  return trimmed;
}

function hasHugoPrefix(content: string | undefined): boolean {
  if (!content) return false;
  return content.trim().toLowerCase().startsWith(NOTE_TRIGGER_PREFIX);
}

/**************************************************************************
 * EXPORTS
 ***************************************************************************/

export {
  buildPrompt,
  parseClaudeResponse,
  stripHugoPrefix,
  hasHugoPrefix,
  NOTE_TRIGGER_PREFIX,
  SYSTEM_PROMPT,
  type CustomerMessage,
  type BuildPromptInputs,
  type BuildPromptOutput,
};
