import { describe, it, expect } from "vitest";
import { simLikesFromRow, isMissingTableError } from "./sim-like-table";

const row = (o: any = {}) => ({ post_id: "p", author_id: "clone", target: 1000, duration_minutes: 60, started_at: new Date(1_000_000).toISOString(), final_count: null, ...o });
describe("bảng simulated_post_likes", () => {
  it("chỉ đúng tác giả mới được cộng", () => {
    expect(simLikesFromRow(row(), "user", null)).toBe(0);
    expect(simLikesFromRow(null, "clone", null)).toBe(0);
  });
  it("đúng đường cong & mục tiêu, số cuối khi đã chốt", () => {
    expect(simLikesFromRow(row(), "clone", null, 1_000_000 + 20 * 60_000)).toBe(100);
    expect(simLikesFromRow(row(), "clone", null, 1_000_000 + 99 * 3_600_000)).toBe(1000);
    expect(simLikesFromRow(row({ final_count: 1000 }), "clone", null)).toBe(1000);
  });
  it("dữ liệu lỗi → 0", () => {
    expect(simLikesFromRow(row({ target: 99999 }), "clone", null)).toBe(0);
    expect(simLikesFromRow(row({ duration_minutes: 7 }), "clone", null)).toBe(0);
  });
  it("nhận diện bảng chưa tạo → fallback", () => {
    expect(isMissingTableError({ code: "PGRST205", message: "Could not find the table" })).toBe(true);
    expect(isMissingTableError({ code: "42501", message: "permission denied" })).toBe(false);
  });
});
