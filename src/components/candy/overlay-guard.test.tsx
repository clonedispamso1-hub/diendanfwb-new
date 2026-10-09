import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { isReactOwned } from "@/lib/overlay-guard";

describe("overlay guard ownership", () => {
  it("treats React-rendered overlays as owned (never removed directly)", () => {
    const { container } = render(<div data-overlay="" data-testid="o" />);
    expect(isReactOwned(container.querySelector("[data-overlay]")!)).toBe(true);
  });
  it("treats manually created nodes as not owned", () => {
    expect(isReactOwned(document.createElement("div"))).toBe(false);
  });
});
