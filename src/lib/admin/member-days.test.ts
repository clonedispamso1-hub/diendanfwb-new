import { describe, it, expect } from "vitest";
import { daysSinceJoined } from "./member-days";

const now = new Date(2026, 9, 9, 10, 0, 0);
const ago = (n: number, h = 23) => new Date(2026, 9, 9 - n, h, 0, 0).toISOString();

describe("daysSinceJoined", () => {
  it("hôm nay → 0", () => expect(daysSinceJoined(new Date(2026, 9, 9, 0, 5).toISOString(), now)).toBe(0));
  it("1 ngày trước → 1", () => expect(daysSinceJoined(ago(1), now)).toBe(1));
  it("7 ngày trước → 7", () => expect(daysSinceJoined(ago(7), now)).toBe(7));
  it("30 ngày trước → 30", () => expect(daysSinceJoined(ago(30, 1), now)).toBe(30));
  it("thiếu dữ liệu → null", () => expect(daysSinceJoined(null, now)).toBeNull());
});
