import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CopyTextBubble, QrPayMessage } from "./chat-card-bubbles";
import { qrPayToken } from "@/lib/chat-cards";

afterEach(cleanup);
describe("Copy form clipboard", () => {
  it("copies only 103887698556, not the STK label", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<CopyTextBubble data={{ title: "Thanh toán", text: "STK: 103887698556", lines: [
      { label: "STK", text: "103887698556", kind: "field", copyEnabled: true },
      { label: "Lưu ý", text: "Chuyển đúng nội dung", kind: "note", copyEnabled: false },
    ] }} />);
    fireEvent.click(screen.getByRole("button", { name: "Sao chép: 103887698556" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("103887698556"));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Sao chép: Chuyển đúng nội dung" })).not.toBeInTheDocument();
  });
});

describe("QR image zoom", () => {
  it("opens the QR popup without exposing default message actions or tokens", async () => {
    const content = qrPayToken({ title: "ADMIN HÀ NỘI", qrUrl: "/qr.png", minutes: 0, notes: ["Chuyển đúng nội dung"] });
    const { container } = render(<QrPayMessage content={content} />);
    expect(container.textContent).not.toContain("[[qrpay:");
    expect(screen.queryByRole("button", { name: "Tuỳ chọn tin nhắn" })).not.toBeInTheDocument();
    expect(screen.queryByText("Xóa")).not.toBeInTheDocument();
    expect(screen.queryByText("Sao chép")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Phóng to mã QR" }));
    expect(await screen.findByRole("dialog", { name: "ADMIN HÀ NỘI" })).toBeInTheDocument();
    expect(screen.getByAltText("Mã QR phóng to")).toHaveAttribute("src", "/qr.png");
  });
});
