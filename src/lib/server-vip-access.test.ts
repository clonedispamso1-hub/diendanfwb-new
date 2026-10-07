import { describe, expect, it } from "vitest";
import { hasServerVipAccess } from "./server-vip-access";

describe("hasServerVipAccess", () => {
  it("default user (vip_level 1) is not VIP", () => {
    expect(hasServerVipAccess({ vipLevel: 1 })).toBe(false);
  });
  it("user without data is not VIP", () => {
    expect(hasServerVipAccess({})).toBe(false);
  });
  it("vip_level 2 is VIP", () => {
    expect(hasServerVipAccess({ vipLevel: 2 })).toBe(true);
  });
  it("admin has access", () => {
    expect(hasServerVipAccess({ isAdmin: true, vipLevel: 1 })).toBe(true);
  });
});
