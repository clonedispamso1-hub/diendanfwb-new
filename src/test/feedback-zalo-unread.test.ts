import { describe, expect, it } from "vitest";
import { badgeCount, feedbackLabel, getBadgeStart } from "@/lib/feedback-zalo-unread";

const M = 60_000, D = 24 * 60 * M;

describe("Feedback Zalo badge counter", () => {
  it("starts at 1", () => expect(badgeCount(0, 0)).toBe(1));
  it("4m59s still 1", () => expect(badgeCount(0, 5 * M - 1000)).toBe(1));
  it("5 min → 2, 10 → 3, 15 → 4", () => {
    expect(badgeCount(0, 5 * M)).toBe(2);
    expect(badgeCount(0, 10 * M)).toBe(3);
    expect(badgeCount(0, 15 * M)).toBe(4);
  });
  it("after sleeping 2 hours → 25", () => expect(badgeCount(0, 120 * M)).toBe(25));
  it("reload / other tab reuses stored start (no reset, no double count)", () => {
    localStorage.clear();
    const first = getBadgeStart(1_000_000);
    expect(getBadgeStart(1_000_000 + 7 * M)).toBe(first);
    expect(badgeCount(getBadgeStart(), 1_000_000 + 7 * M)).toBe(2);
  });
});

describe("Feedback Zalo label", () => {
  const created = "2026-10-01T00:00:00.000Z";
  const t = Date.parse(created);
  it("just posted → NEW", () => expect(feedbackLabel(created, t)).toBe("NEW"));
  it("4d23h → NEW", () => expect(feedbackLabel(created, t + 5 * D - M)).toBe("NEW"));
  it("exactly 5 days → VIP ZALO", () => expect(feedbackLabel(created, t + 5 * D)).toBe("VIP ZALO"));
});
