import { describe, expect, it } from "vitest";
import { hasQrPayToken, parseQrPay, qrPayToken, stripQrPayTokens } from "./chat-cards";
import { getMessagePreview } from "./message-preview";
import { friendlyPreview, parseRichSegments } from "./rich-content";

const token = (data: unknown) => `[[qrpay:${btoa(unescape(encodeURIComponent(JSON.stringify(data))))}]]`;
describe("payment QR compatibility and privacy", () => {
  it("preserves old QR title, notes, banking fields and expiry", () => {
    const data = { qrUrl: "https://example.com/qr.png", minutes: 5, notes: ["Chuyển đúng nội dung"], title: "ADMIN HÀ NỘI", bankName: "Vietcombank", accountNumber: "0123456" };
    expect(parseQrPay(qrPayToken(data))).toMatchObject(data);
  });
  it("accepts base64url and whitespace in historical payloads", () => {
    const content = token({ qrUrl: "https://example.com/qr.png", title: "ADMIN HÀ NỘI", notes: [] });
    const raw = content.slice(8, -2).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(parseQrPay(`[[qrpay:\n${raw}\n]]`)?.title).toBe("ADMIN HÀ NỘI");
  });
  it("accepts legacy image and bank aliases", () => {
    expect(parseQrPay(token({ image_url: "/qr.png", note: "Lưu ý", bank: { name: "ACB", account_number: "123" } }))).toMatchObject({ qrUrl: "/qr.png", bankName: "ACB", accountNumber: "123", notes: ["Lưu ý"] });
  });
  it.each(["[[qrpay:!!!bad!!!]]", "[[qrpay:eyJ", token({ qrUrl: "javascript:alert(1)" }), token(null)])("never exposes invalid payload %s", (content) => {
    expect(hasQrPayToken(content)).toBe(true);
    expect(parseQrPay(content)).toBeNull();
    expect(getMessagePreview(content)).not.toContain("qrpay");
    expect(friendlyPreview(content)).not.toContain("qrpay");
    expect(parseRichSegments(content)).toEqual([]);
    expect(stripQrPayTokens(content)).toBe("");
  });
  it("keeps ordinary and surrounding text unchanged", () => {
    expect(stripQrPayTokens("Xin chào bạn")).toBe("Xin chào bạn");
    expect(stripQrPayTokens(`Trước ${token({ qrUrl: "/qr.png" })} sau`)).toBe("Trước  sau");
    expect(getMessagePreview("Xin chào bạn")).toBe("Xin chào bạn");
  });
});