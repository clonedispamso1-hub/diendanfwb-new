import { describe, it, expect, vi, beforeEach } from "vitest";

let db: Record<string, any> = {};
const writes: any[] = [];
vi.mock("@/lib/site-settings-cache", () => ({
  getSiteSetting: async (k: string) => db[k],
  peekSiteSetting: (k: string) => db[k],
  invalidateSiteSettings: () => {},
}));
vi.mock("@/lib/admin-db", () => ({
  adminSetSiteSetting: async (k: string, v: any) => { writes.push(v); db[k] = JSON.parse(JSON.stringify(v)); },
}));

import { simLikeForPost, scanSimLikeStore, applySimLikeCleanup, saveSimLikeForPost, SIM_LIKES_KEY } from "./sim-like-token";

const H = 3_600_000;
beforeEach(() => { db = {}; writes.length = 0; });

describe("audit tym mô phỏng", () => {
  it("user thường / clone không bật → 0", () => {
    const st: any = { clonePost: { a: "clone", t: 1000, m: 60, s: 1 } };
    expect(simLikeForPost("userPost", "user", null, st)).toBe(0);
    expect(simLikeForPost("clonePost2", "clone", null, st)).toBe(0);
    // user giả mạo postId của clone → sai tác giả → 0
    expect(simLikeForPost("clonePost", "user", null, st)).toBe(0);
  });

  it("clone bật → đúng mục tiêu, không vượt", async () => {
    await saveSimLikeForPost("p1", "clone", 3000, 180);
    const st = db[SIM_LIKES_KEY];
    const s = st.p1.s;
    expect(simLikeForPost("p1", "clone", null, st, s + 3 * H)).toBe(3000);
    expect(simLikeForPost("p1", "clone", null, st, s + 99 * H)).toBe(3000);
  });

  it("dọn: chỉ sửa cấu hình, chốt số cuối, giữ bài đang chạy & bài mới đăng giữa chừng", async () => {
    const now = Date.now();
    db[SIM_LIKES_KEY] = {
      done: { a: "c", t: 2000, m: 60, s: now - 2 * H },
      run: { a: "c", t: 1000, m: 1440, s: now - H },
      gone: { a: "c", t: 1000, m: 60, s: now - H / 2 },
      bad: { a: "c", t: 99999, m: 60, s: now },
    };
    const scan = await scanSimLikeStore(async (ids) => new Map(ids.filter((i) => i !== "gone").map((i) => [i, { deleted: false }])));
    expect(scan.completed).toEqual(["done"]);
    expect(scan.deleted).toEqual(["gone"]);
    expect(scan.invalid).toEqual(["bad"]);
    // Admin khác đăng bài trong lúc chờ xác nhận
    db[SIM_LIKES_KEY] = { ...db[SIM_LIKES_KEY], fresh: { a: "c", t: 1000, m: 60, s: now } };
    const n = await applySimLikeCleanup(scan);
    expect(n).toBe(3);
    const st = db[SIM_LIKES_KEY];
    expect(st.done).toEqual({ a: "c", f: 2000 });
    expect(st.run.t).toBe(1000);
    expect(st.fresh.t).toBe(1000);
    expect(st.gone).toBeUndefined();
    expect(simLikeForPost("done", "c", null, st)).toBe(2000);
  });

  it("không kiểm tra được bài → không xoá theo 'bài đã xoá'", async () => {
    db[SIM_LIKES_KEY] = { x: { a: "c", t: 1000, m: 60, s: Date.now() } };
    const scan = await scanSimLikeStore(async () => { throw new Error("net"); });
    expect(scan.checkedPosts).toBe(false);
    expect(scan.deleted).toEqual([]);
  });
});
