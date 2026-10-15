import { describe, expect, it } from "vitest";
import { isRealUserForReminder, shouldShowPostReminder } from "./post-reminder";

const H = 60 * 60 * 1000;

describe("post reminder", () => {
  it("shows the first time (new signup)", () => {
    expect(shouldShowPostReminder(null, Date.now())).toBe(true);
  });
  it("does not show again within 4 hours", () => {
    expect(shouldShowPostReminder(0, 4 * H - 1)).toBe(false);
  });
  it("shows again after 4 hours", () => {
    expect(shouldShowPostReminder(0, 4 * H)).toBe(true);
  });
  it("excludes admin, second accounts and simulated accounts", () => {
    expect(isRealUserForReminder({ id: "a", is_admin: true })).toBe(false);
    expect(isRealUserForReminder({ id: "a", account_source: "internal" })).toBe(false);
    expect(isRealUserForReminder({ id: "a", is_virtual: true })).toBe(false);
    expect(isRealUserForReminder({ id: "a", is_seed_account: true })).toBe(false);
    expect(isRealUserForReminder({ id: "a" })).toBe(true);
  });
});
