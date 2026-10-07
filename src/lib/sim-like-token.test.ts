import { describe, it, expect } from "vitest";
import { getSimLikeCfg, simLikeNow, simLikeForPost } from "./sim-like-token";

describe("tym mô phỏng", () => {
  const start = 1_000_000;
  const store = { p1: { a: "u1", t: 2000, m: 60, s: start }, p2: { a: "u1", t: 99999, m: 60, s: start } };
  it("tăng theo đường cong 2 giai đoạn và không vượt mục tiêu", () => {
    for (const t of [1000, 2000, 3000, 4000, 5000]) {
      for (const m of [60, 180, 1440]) {
        const cfg = { target: t, minutes: m, start };
        expect(simLikeNow(cfg, start)).toBe(0);
        expect(simLikeNow(cfg, start + 20 * 60_000)).toBeGreaterThanOrEqual(t * 0.1);
        expect(simLikeNow(cfg, start + m * 60_000)).toBe(t);
        expect(simLikeNow(cfg, start + 9999 * 60_000)).toBe(t);
      }
    }
    const c = { target: 1000, minutes: 60, start };
    const at = (min: number) => simLikeNow(c, start + min * 60_000);
    expect(at(5)).toBeGreaterThanOrEqual(30);
    expect(at(5)).toBeLessThanOrEqual(50);
    expect(at(20)).toBe(100);
    expect(at(40)).toBeGreaterThanOrEqual(600);
    expect(at(40)).toBeLessThanOrEqual(700);
    // cuối chậm hơn giữa
    expect(at(60) - at(50)).toBeLessThan(at(30) - at(20));
    expect(getSimLikeCfg("p1", "u1", store)).not.toBeNull();
  });
  it("sai tác giả hoặc mục tiêu ngoài 1000–5000 → không áp dụng", () => {
    expect(getSimLikeCfg("p1", "other", store)).toBeNull();
    expect(getSimLikeCfg("p2", "u1", store)).toBeNull();
    expect(getSimLikeCfg("nope", "u1", store)).toBeNull();
  });
  it("bài đã chốt giữ số cuối, sai tác giả → 0", () => {
    const st: any = { p: { a: "u1", f: 3000 }, q: { a: "u1", t: 1000, m: 60, s: start } };
    expect(simLikeForPost("p", "u1", null, st)).toBe(3000);
    expect(simLikeForPost("p", "x", null, st)).toBe(0);
    expect(simLikeForPost("q", "u1", null, st, start + 61 * 60_000)).toBe(1000);
    expect(simLikeForPost("none", "u1", null, st)).toBe(0);
  });
});
