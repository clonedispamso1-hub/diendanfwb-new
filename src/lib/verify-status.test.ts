import { describe, it, expect } from "vitest";
import { hasVipBadge } from "@/components/candy/universal-badge";
describe("Đã xác minh", () => {
  it("vip_media → xác minh", () => expect(hasVipBadge({ vip_media: ["a.gif"] } as any)).toBe(true));
  it("clone VIP tick → xác minh", () => expect(hasVipBadge({ is_virtual: true } as any)).toBe(true));
  it("admin crown → xác minh", () => expect(hasVipBadge({ is_admin: true } as any)).toBe(true));
  it("thường → chưa xác minh", () => expect(hasVipBadge({ province: "Bình Dương" } as any)).toBe(false));
});
