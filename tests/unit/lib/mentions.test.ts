import { describe, it, expect } from "vitest";
import { parseMentions, hasMentionForUser, extractMentionedUserIds } from "@/lib/mentions";

describe("parseMentions", () => {
  it("parses a mention surrounded by text", () => {
    expect(parseMentions("Check @[Roberto](abc123) please")).toEqual([
      { type: "text", content: "Check " },
      { type: "mention", name: "Roberto", userId: "abc123" },
      { type: "text", content: " please" },
    ]);
  });

  it("returns a single text segment when there are no mentions", () => {
    expect(parseMentions("No mentions")).toEqual([
      { type: "text", content: "No mentions" },
    ]);
  });

  it("parses multiple mentions", () => {
    const result = parseMentions("@[A](id1) and @[B](id2)");
    expect(result).toEqual([
      { type: "mention", name: "A", userId: "id1" },
      { type: "text", content: " and " },
      { type: "mention", name: "B", userId: "id2" },
    ]);
  });

  it("handles a mention at the start with no leading text", () => {
    const result = parseMentions("@[Roberto](abc123) done");
    expect(result[0]).toEqual({ type: "mention", name: "Roberto", userId: "abc123" });
  });

  it("handles a mention at the end with no trailing text", () => {
    const result = parseMentions("Hey @[Roberto](abc123)");
    expect(result[result.length - 1]).toEqual({ type: "mention", name: "Roberto", userId: "abc123" });
  });
});

describe("hasMentionForUser", () => {
  it("returns true when the user is mentioned", () => {
    expect(hasMentionForUser("@[Roberto](abc123)", "abc123")).toBe(true);
  });

  it("returns false when a different user is mentioned", () => {
    expect(hasMentionForUser("@[Roberto](abc123)", "xyz789")).toBe(false);
  });

  it("returns false for null input", () => {
    expect(hasMentionForUser(null, "abc")).toBe(false);
  });

  it("returns false for undefined input", () => {
    expect(hasMentionForUser(undefined, "abc")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(hasMentionForUser("", "abc")).toBe(false);
  });
});

describe("extractMentionedUserIds", () => {
  it("extracts multiple user IDs", () => {
    expect(extractMentionedUserIds("@[A](id1) and @[B](id2)")).toEqual(["id1", "id2"]);
  });

  it("returns empty array when no mentions", () => {
    expect(extractMentionedUserIds("No mentions here")).toEqual([]);
  });

  it("extracts a single user ID", () => {
    expect(extractMentionedUserIds("@[Roberto](abc123)")).toEqual(["abc123"]);
  });
});
