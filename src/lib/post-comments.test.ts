import { describe, expect, it } from "vitest";
import { buildCommentThreads, validateComment, COMMENT_MAX_LENGTH, type CommentRow } from "./post-comments";

const row = (id: string, parent: string | null, t: string): CommentRow => ({
  id, parent_id: parent, post_id: "p", user_id: "u", content: id, created_at: t,
});

describe("post comments", () => {
  it("reply is shown under its original comment", () => {
    const t = buildCommentThreads([row("a", null, "1"), row("r1", "a", "2"), row("b", null, "3")]);
    expect(t.map((x) => x.id)).toEqual(["a", "b"]);
    expect(t[0].replies.map((x) => x.id)).toEqual(["r1"]);
  });
  it("reply to a reply attaches to the top comment", () => {
    const t = buildCommentThreads([row("a", null, "1"), row("r1", "a", "2"), row("r2", "r1", "3")]);
    expect(t[0].replies.map((x) => x.id)).toEqual(["r1", "r2"]);
  });
  it("rejects empty and over-long comments", () => {
    expect(validateComment("   ")).not.toBeNull();
    expect(validateComment("x".repeat(COMMENT_MAX_LENGTH + 1))).not.toBeNull();
    expect(validateComment("Xin chào")).toBeNull();
  });
});
