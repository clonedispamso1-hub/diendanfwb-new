import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ start: vi.fn(() => () => {}) }));
vi.mock("@/lib/devtools-guard", () => ({ startDevtoolsProtection: state.start }));
import { DevToolsGuard } from "./devtools-guard";

afterEach(() => { cleanup(); });

describe("always-on DevTools Guard lifecycle", () => {
  it("starts at module load, before any render or session", () => {
    expect(state.start).toHaveBeenCalledTimes(1);
  });
  it("re-renders / unmount (route, login, logout) never stop it", () => {
    const { rerender, unmount } = render(<DevToolsGuard />);
    rerender(<DevToolsGuard />);
    unmount();
    expect(state.start.mock.results.every((r) => typeof r.value === "function")).toBe(true);
  });
});
