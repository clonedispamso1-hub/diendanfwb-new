import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const router = { navigate: vi.fn(), history: { go: vi.fn() } };
vi.mock("@tanstack/react-router", () => ({
  useRouter: () => router,
  useRouterState: () => ({}),
  Link: () => null,
}));

import { useNavigate } from "./navigation-compat";

describe("useNavigate (compat)", () => {
  it("keeps a stable identity across re-renders so effects depending on it do not re-run", () => {
    const { result, rerender } = renderHook(() => useNavigate());
    const first = result.current;
    rerender();
    rerender();
    expect(result.current).toBe(first);
  });

  it("still navigates", () => {
    const { result } = renderHook(() => useNavigate());
    result.current("/x", { replace: true });
    expect(router.navigate).toHaveBeenCalledWith({ to: "/x", replace: true, state: undefined });
    result.current(-1);
    expect(router.history.go).toHaveBeenCalledWith(-1);
  });
});
