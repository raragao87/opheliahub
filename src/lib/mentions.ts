// Mention format: @[Name](userId)
const MENTION_REGEX = /@\[([^\]]+)\]\(([^)]+)\)/g;

export type MentionSegment =
  | { type: "text"; content: string }
  | { type: "mention"; name: string; userId: string };

export function parseMentions(text: string): MentionSegment[] {
  const segments: MentionSegment[] = [];
  let lastIndex = 0;
  const regex = new RegExp(MENTION_REGEX.source, "g");
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", content: text.slice(lastIndex, match.index) });
    }
    segments.push({ type: "mention", name: match[1], userId: match[2] });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: "text", content: text.slice(lastIndex) });
  }

  if (segments.length === 0) {
    segments.push({ type: "text", content: text });
  }

  return segments;
}

export function hasMentionForUser(text: string | null | undefined, userId: string): boolean {
  if (!text) return false;
  const regex = new RegExp(MENTION_REGEX.source, "g");
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match[2] === userId) return true;
  }
  return false;
}

export function extractMentionedUserIds(text: string): string[] {
  const ids: string[] = [];
  const regex = new RegExp(MENTION_REGEX.source, "g");
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    ids.push(match[2]);
  }
  return ids;
}
