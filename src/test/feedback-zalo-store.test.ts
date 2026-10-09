import { describe, expect, it } from "vitest";
import { safeHttpUrl, validateDraft } from "@/lib/feedback-zalo-store";

describe("feedback zalo store", () => {
  it("rejects non-http urls", () => {
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl("not a url")).toBeNull();
    expect(safeHttpUrl("https://a.com/x.jpg")).toBe("https://a.com/x.jpg");
  });
  it("requires mandatory fields and keeps avatar/cover/content separate", () => {
    const e = validateDraft({ author_name: "", avatar_url: "https://a.com/a.jpg", title: "", cover_url: "", content_url: "bad", content_type: "image", description: "" });
    expect(Object.keys(e).sort()).toEqual(["author_name", "content_url", "cover_url", "title"]);
  });
});
