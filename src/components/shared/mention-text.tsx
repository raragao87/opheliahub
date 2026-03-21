import { parseMentions } from "@/lib/mentions";

interface MentionTextProps {
  text: string;
}

export function MentionText({ text }: MentionTextProps) {
  const segments = parseMentions(text);

  return (
    <>
      {segments.map((segment, i) => {
        if (segment.type === "mention") {
          return (
            <span
              key={i}
              className="inline-flex items-center text-xs font-medium text-primary bg-primary/10 rounded px-1 py-0.5"
            >
              @{segment.name}
            </span>
          );
        }
        return <span key={i}>{segment.content}</span>;
      })}
    </>
  );
}
