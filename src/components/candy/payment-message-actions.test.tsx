import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { hasChatCardToken, copyTextToken, qrPayToken } from "@/lib/chat-cards";

describe("Payment message actions", () => {
  it("recognizes Bank and QR messages on either side, including broken QR tokens", () => {
    const bank = copyTextToken("123456789", [{ label: "STK", text: "123456789", copyEnabled: true, kind: "field" }]);
    const qr = qrPayToken({ qrUrl: "/qr.png", minutes: 0, notes: [] });
    for (const content of [bank, qr, `Thanh toán ${qr}`, "[[qrpay:broken"]) {
      expect(hasChatCardToken(content)).toBe(true);
    }
    for (const content of ["Xin chào", "Thông tin ngân hàng", "", null]) {
      expect(hasChatCardToken(content)).toBe(false);
    }
  });

  it("uses the same disabled condition for ellipsis and gestures, and guards the action sheet", () => {
    const source = readFileSync("src/components/candy/chat-page.tsx", "utf8");
    expect(source).toMatch(/const messageMenuDisabled = [^;]*hasChatCardToken\(message.content\)/);
    expect(source).toContain("menuDisabled={messageMenuDisabled}");
    expect(source).toContain("{messageMenuDisabled ? null : (");
    expect(source).toContain("msgMenu && !hasChatCardToken(msgMenu.message.content) && !parseVipPayment(msgMenu.message.content)");
    expect(source).toContain("if (menuDisabled) return;");
    expect(source).toContain("if (!menuDisabled) onMenu();");
  });
});