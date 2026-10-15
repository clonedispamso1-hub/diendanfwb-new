import { describe, expect, it } from "vitest";
import { copyTextLines, copyTextToken, parseCopyText, parseQrPay, qrExpiresAt, qrPayToken } from "./chat-cards";

describe("chat cards", () => {
  it("preserves titled form rows and copies content separately from labels in one token", () => {
    const lines = [
      { label: "STK", text: "103887698556", copyEnabled: true, kind: "field" as const },
      { label: "Lưu ý", text: "Chuyển đúng nội dung", copyEnabled: false, kind: "note" as const },
    ];
    const token = copyTextToken("STK: 103887698556\nLưu ý: Chuyển đúng nội dung", lines, "Thông tin thanh toán");
    const parsed = parseCopyText(token);
    if (!parsed) throw new Error("Missing form card");
    expect(parsed.title).toBe("Thông tin thanh toán");
    expect(copyTextLines(parsed)).toEqual(lines);
    expect(copyTextLines(parsed)[0].text).toBe("103887698556");
    expect(token.match(/\[\[copytext:/g)).toHaveLength(1);
  });
  it("preserves multiline content as one builder row", () => {
    const lines = [{ label: "Lưu ý", text: "Dòng một\nDòng hai", kind: "note" as const, copyEnabled: false }];
    expect(copyTextLines({ text: "Lưu ý: Dòng một\nDòng hai", lines })).toEqual(lines);
  });
  it("copy text round-trips exactly", () => {
    const text = "CK 0123 456 — Nguyễn Văn A";
    expect(parseCopyText(copyTextToken(text))?.text).toBe(text);
  });
  it("keeps account number and transfer content copyable while notes are not copyable in one message", () => {
    const lines = [
      { text: "STK: 123456789", copyEnabled: true },
      { text: "Nội dung chuyển khoản: abc123", copyEnabled: true },
      { text: "Lưu ý: chuyển đúng nội dung", copyEnabled: false },
    ];
    const token = copyTextToken(lines.map((line) => line.text).join("\n"), lines);
    const parsed = parseCopyText(token);
    expect(parsed).not.toBeNull();
    if (!parsed) throw new Error("Missing copy card");
    expect(copyTextLines(parsed)).toEqual(lines);
    expect(token.match(/\[\[copytext:/g)).toHaveLength(1);
  });
  it("preserves legacy multiline copy messages", () => {
    expect(copyTextLines({ text: "STK: 123456789\nNội dung chuyển khoản: abc123" })).toEqual([
      { text: "STK: 123456789", copyEnabled: true },
      { text: "Nội dung chuyển khoản: abc123", copyEnabled: true },
    ]);
  });
  it("allows every line to disable copying without losing content", () => {
    const text = "Lưu ý: chuyển đúng nội dung";
    const parsed = parseCopyText(copyTextToken(text, [{ text, copyEnabled: false }]));
    if (!parsed) throw new Error("Missing copy card");
    expect(copyTextLines(parsed)).toEqual([{ text, copyEnabled: false }]);
  });
  it("QR 5 minutes expires 5 minutes after DB created_at", () => {
    const p = parseQrPay(qrPayToken({ qrUrl: "https://pub-x.r2.dev/a.png", minutes: 5, notes: [] }))!;
    expect(qrExpiresAt(p, "2026-01-01T00:00:00Z")).toBe(Date.parse("2026-01-01T00:05:00Z"));
  });
  it("QR without minutes has no countdown and empty notes are dropped", () => {
    const p = parseQrPay(qrPayToken({ qrUrl: "https://pub-x.r2.dev/a.png", minutes: 0, notes: ["  ", "A"] }))!;
    expect(qrExpiresAt(p, "2026-01-01T00:00:00Z")).toBeNull();
    expect(p.notes).toEqual(["A"]);
  });
  it("QR with minutes but missing created_at is treated as expired", () => {
    const p = parseQrPay(qrPayToken({ qrUrl: "https://pub-x.r2.dev/a.png", minutes: 5, notes: [] }))!;
    expect(qrExpiresAt(p, null)).toBe(0);
  });
});

describe("QR title", () => {
  it("round-trips the QR title and omits it when blank", () => {
    const withTitle = parseQrPay(qrPayToken({ qrUrl: "https://pub-x.r2.dev/a.png", minutes: 5, notes: [], title: "ADMIN HÀ NỘI BANK" }))!;
    expect(withTitle.title).toBe("ADMIN HÀ NỘI BANK");
    const blank = parseQrPay(qrPayToken({ qrUrl: "https://pub-x.r2.dev/a.png", minutes: 5, notes: [], title: "   " }))!;
    expect(blank.title).toBeUndefined();
  });
});
