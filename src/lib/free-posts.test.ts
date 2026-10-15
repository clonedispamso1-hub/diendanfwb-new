import { describe, expect, it } from "vitest";
import { FREE_POST_TOTAL, freePostSteps } from "./free-posts";

describe("free posts", () => {
  it("every account gets 20 free posts", () => {
    expect(FREE_POST_TOTAL).toBe(20);
  });
  it("animation counts +1 through +20 in order", () => {
    const s = freePostSteps();
    expect(s).toHaveLength(20);
    expect(s[0]).toBe("+1");
    expect(s[19]).toBe("+20");
  });
});
