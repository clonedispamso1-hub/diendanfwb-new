import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

const route = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("@tanstack/react-router", () => ({
  Outlet: () => null,
  useRouterState: ({ select }: { select: (state: unknown) => unknown }) => select({ location: route }),
}));
vi.mock("@/components/imported-views/Index.tsx", () => ({
  default: function HomeStateProbe() {
    const [draft, setDraft] = useState("");
    return <input aria-label="Home state probe" value={draft} onChange={(e) => setDraft(e.target.value)} />;
  },
}));
vi.mock("@/components/candy/auth-provider", () => ({ AuthProvider: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("@/components/candy/deferred-mount", () => ({ DeferredMount: () => null }));
vi.mock("@/components/ui/sonner", () => ({ Toaster: () => null }));
vi.mock("@/lib/db/router", () => ({ supabase: {} }));
vi.mock("@/lib/automation-flags", () => ({ AUTOMATION_ENABLED: false }));

import App from "@/CandyApp";

describe("Feedback Zalo round trip", () => {
  it("preserves home state when entering Feedback Zalo and returning to /", () => {
    route.pathname = "/";
    const { rerender } = render(<App />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "existing home draft" } });
    const originalInput = screen.getByRole("textbox");
    route.pathname = "/feedback-zalo";
    rerender(<App />);
    expect(screen.getByRole("textbox")).toBe(originalInput);
    expect(screen.getByRole("textbox")).toHaveValue("existing home draft");
    route.pathname = "/";
    rerender(<App />);
    expect(screen.getByRole("textbox")).toBe(originalInput);
    expect(screen.getByRole("textbox")).toHaveValue("existing home draft");
  });
});