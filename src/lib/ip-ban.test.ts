import { describe, it, expect } from "vitest";
import { evaluateIpBan, normalizeIp, trustedClientIp } from "@/lib/ip-ban";

const NOW = Date.parse("2026-10-15T00:00:00Z");

describe("BAN IP mức 3", () => {
  it("IP bị ban mức 3 vĩnh viễn → blocked", () => {
    expect(evaluateIpBan([{ ip: "1.2.3.4", level: 3, expires_at: null }], NOW).status).toBe("blocked");
  });
  it("lệnh cấm còn hạn → blocked", () => {
    expect(evaluateIpBan([{ ip: "1.2.3.4", level: 3, expires_at: "2026-12-01T00:00:00Z" }], NOW).status).toBe("blocked");
  });
  it("lệnh cấm đã hết hạn → clear", () => {
    expect(evaluateIpBan([{ ip: "1.2.3.4", level: 3, expires_at: "2026-10-01T00:00:00Z" }], NOW).status).toBe("clear");
  });
  it("mức < 3 → không chặn IP", () => {
    expect(evaluateIpBan([{ ip: "1.2.3.4", level: 2, expires_at: null }], NOW).status).toBe("clear");
  });
  it("IP không có bản ghi → clear", () => {
    expect(evaluateIpBan([], NOW).status).toBe("clear");
  });
  it("chỉ tin cf-connecting-ip, bỏ qua x-forwarded-for giả", () => {
    const h: Record<string, string> = { "x-forwarded-for": "123.16.3.146" };
    expect(trustedClientIp((n) => h[n])).toBeNull();
    h["cf-connecting-ip"] = "::ffff:9.9.9.9";
    expect(trustedClientIp((n) => h[n])).toBe("9.9.9.9");
  });
  it("chặn chuỗi IP rác", () => {
    expect(normalizeIp("1.2.3.4' or 1=1")).toBeNull();
  });
});
