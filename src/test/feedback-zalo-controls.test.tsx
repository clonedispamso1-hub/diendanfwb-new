import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AnchorHTMLAttributes } from "react";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) => <a href={to} {...props} />,
}));

import { FeedbackZaloBack, FeedbackZaloEntry } from "@/components/candy/feedback-zalo";

describe("Feedback Zalo controls", () => {
  it("keeps the entry label, mark and original destination", () => {
    render(<FeedbackZaloEntry />);
    const link = screen.getByRole("link", { name: "Feedback Zalo" });
    expect(link).toHaveAttribute("href", "/feedback-zalo");
    expect(link.querySelector(".feedback-zalo-mark")).toHaveTextContent("Zalo");
  });

  it("shows only a chevron with an accessible home destination", () => {
    render(<FeedbackZaloBack />);
    const link = screen.getByRole("link", { name: "Quay lại trang chủ" });
    expect(link).toHaveAttribute("href", "/");
    expect(link).toHaveAttribute("title", "Quay lại trang chủ");
    expect(link.textContent).toBe("");
    expect(link.querySelector("svg")).toHaveClass("lucide-chevron-left");
  });
});