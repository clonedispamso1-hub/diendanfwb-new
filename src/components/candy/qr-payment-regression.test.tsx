import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QrPayMessage } from "./chat-card-bubbles";
import { qrPayToken } from "@/lib/chat-cards";
vi.mock("@/lib/chat-cards", async (original) => ({ ...await original<typeof import("@/lib/chat-cards")>(), serverClockOffset: () => Promise.resolve(0) }));
describe("payment QR message", () => {
  it("renders admin fields and opens an accessible zoom popup", () => {
    const content = qrPayToken({ qrUrl: "https://example.com/qr.png", minutes: 0, notes: ["Chuyển đúng nội dung"], title: "ADMIN HÀ NỘI", bankName: "ACB", accountNumber: "123456" });
    const { container } = render(<QrPayMessage content={content} />);
    expect(screen.getByText("ADMIN HÀ NỘI")).toBeInTheDocument();
    expect(screen.getByText("ACB")).toBeInTheDocument();
    expect(screen.getByText("123456")).toBeInTheDocument();
    expect(screen.getByText("Chuyển đúng nội dung")).toBeInTheDocument();
    expect(container.textContent).not.toContain("qrpay");
    fireEvent.click(screen.getByRole("button", { name: "Phóng to mã QR" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByAltText("Mã QR phóng to")).toHaveAttribute("src", "https://example.com/qr.png");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("shows a safe fallback instead of malformed payloads", () => {
    const { container } = render(<QrPayMessage content="[[qrpay:!!!]]" />);
    expect(screen.getByRole("status")).toHaveTextContent("Vui lòng nhờ admin gửi lại");
    expect(container.textContent).not.toContain("qrpay");
  });
});