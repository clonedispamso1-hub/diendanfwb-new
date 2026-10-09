import { describe, it, expect } from "vitest";
import { matchesDaysFilter, paginate } from "./member-days";

const bucket = (d: number) => (["new", "mid", "long"] as const).filter((f) => matchesDaysFilter(d, f));

describe("bộ lọc Số ngày", () => {
  it("0 ngày không thuộc nhóm nào", () => expect(bucket(0)).toEqual([]));
  it("1 ngày → Mới", () => expect(bucket(1)).toEqual(["new"]));
  it("5 ngày → Mới", () => expect(bucket(5)).toEqual(["new"]));
  it("10 ngày → Trung bình", () => expect(bucket(10)).toEqual(["mid"]));
  it("14 ngày → Trung bình", () => expect(bucket(14)).toEqual(["mid"]));
  it("15 ngày → chỉ Lâu dài", () => expect(bucket(15)).toEqual(["long"]));
  it("30 ngày → Lâu dài", () => expect(bucket(30)).toEqual(["long"]));
  it("31 ngày → không nhóm", () => expect(bucket(31)).toEqual([]));
});

describe("phân trang sau lọc", () => {
  const all = Array.from({ length: 84 }, (_, i) => i);
  it("3 kết quả → 1 trang, 3 thành viên", () => {
    const r = paginate(all.filter((i) => i % 30 === 0), 0, 20);
    expect([r.totalPages, r.total]).toEqual([1, 3]);
  });
  it("25 kết quả, 20/trang → trang 2 có 5", () => {
    const r = paginate(all.slice(0, 25), 1, 20);
    expect([r.totalPages, r.total, r.items.length]).toEqual([2, 25, 5]);
  });
  it("page cũ vượt quá → kẹp về trang cuối", () => expect(paginate(all.slice(0, 3), 4, 20).page).toBe(0));
});
