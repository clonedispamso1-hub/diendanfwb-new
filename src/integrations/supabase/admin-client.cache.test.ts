import { beforeEach, describe, expect, it, vi } from "vitest";

// Đếm request "mạng" mô phỏng: getUser (qua verifiedAdminUid) + truy vấn bangchu.
const h = vi.hoisted(() => {
  const state = { token: "t1" as string | null, bangchuCalls: 0, verifyCalls: 0, fail: false };
  const maybeSingle = vi.fn(async () => {
    state.bangchuCalls++;
    await new Promise((r) => setTimeout(r, 5));
    if (state.fail) return { data: null, error: { message: "boom" } };
    return { data: { id: "b1", auth_user_id: "u1", role: "admin_1", status: "approved", is_active: true }, error: null };
  });
  const client = {
    auth: { getSession: vi.fn(async () => ({ data: { session: state.token ? { access_token: state.token } : null } })) },
    from: vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle }) }) })),
  };
  return { state, client };
});

vi.mock("@/lib/db/router", () => ({ supabaseAdminSession: h.client }));
vi.mock("@/lib/access-guard", () => ({
  verifiedAdminUid: vi.fn(async () => { h.state.verifyCalls++; return h.state.token ? "u1" : null; }),
}));

import { fetchCurrentBangchu, clearCurrentBangchuCache } from "./admin-client";

beforeEach(() => {
  clearCurrentBangchuCache();
  Object.assign(h.state, { token: "t1", bangchuCalls: 0, verifyCalls: 0, fail: false });
});

describe("fetchCurrentBangchu cache/dedupe", () => {
  it("gọi lặp (mô phỏng remount mỗi giây) chỉ tạo 1 request trong TTL", async () => {
    for (let i = 0; i < 20; i++) expect((await fetchCurrentBangchu())?.id).toBe("b1");
    expect(h.state.bangchuCalls).toBe(1);
    expect(h.state.verifyCalls).toBe(1);
  });

  it("gọi đồng thời được gộp thành 1 request", async () => {
    await Promise.all(Array.from({ length: 5 }, () => fetchCurrentBangchu()));
    expect(h.state.bangchuCalls).toBe(1);
  });

  it("token đổi → đọc lại ngay; không session → không gọi mạng", async () => {
    await fetchCurrentBangchu();
    h.state.token = "t2";
    await fetchCurrentBangchu();
    expect(h.state.bangchuCalls).toBe(2);
    h.state.token = null;
    expect(await fetchCurrentBangchu()).toBeNull();
    expect(h.state.bangchuCalls).toBe(2);
  });

  it("hết TTL 30s → đọc lại (không cache vô thời hạn)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      await fetchCurrentBangchu();
      vi.setSystemTime(Date.now() + 31_000);
      await fetchCurrentBangchu();
      expect(h.state.bangchuCalls).toBe(2);
    } finally { vi.useRealTimers(); }
  });

  it("lỗi truy vấn không bị cache", async () => {
    h.state.fail = true;
    expect(await fetchCurrentBangchu()).toBeNull();
    h.state.fail = false;
    expect((await fetchCurrentBangchu())?.id).toBe("b1");
    expect(h.state.bangchuCalls).toBe(2);
  });
});
