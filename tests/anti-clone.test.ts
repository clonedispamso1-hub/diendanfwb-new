/**
 * Kiểm thử tầng client Anti Clone (mock Supabase — KHÔNG chạm DB thật).
 * - purgeMember mức 1/2/3 gọi đúng RPC admin_anti_clone_purge với tham số đúng.
 * - restoreMember gọi đúng RPC admin_anti_clone_restore hiện có.
 * - listLockedMembers lọc is_banned = true và map UID/mức/lý do/thời gian.
 */
import { describe, expect, it, mock, beforeEach } from "bun:test";

type Call = { name: string; args: any };
const calls: Call[] = [];
let selectResult: any = { data: [], error: null, count: 0 };

const queryStub = () => {
  const chain: any = {
    select: (cols: string, opts?: any) => {
      calls.push({ name: "select", args: { cols, opts } });
      return chain;
    },
    eq: (col: string, val: any) => {
      calls.push({ name: "eq", args: { col, val } });
      return chain;
    },
    or: (expr: string) => {
      calls.push({ name: "or", args: expr });
      return chain;
    },
    order: (col: string, opts?: any) => {
      calls.push({ name: "order", args: { col, opts } });
      return chain;
    },
    range: (a: number, b: number) => {
      calls.push({ name: "range", args: [a, b] });
      return Promise.resolve(selectResult);
    },
  };
  return chain;
};

mock.module("@/lib/db/router", () => ({
  supabase: {
    from: (table: string) => {
      calls.push({ name: "from", args: table });
      return queryStub();
    },
    rpc: (fn: string, params: any) => {
      calls.push({ name: "rpc", args: { fn, params } });
      if (fn === "admin_anti_clone_purge") {
        return Promise.resolve({
          data: {
            ok: true,
            level: params.p_level,
            deleted: false,
            phone_blacklisted: params.p_level >= 2,
            ip_blocked: params.p_level >= 3,
            device_blocked: params.p_level >= 3,
          },
          error: null,
        });
      }
      return Promise.resolve({ data: { ok: true }, error: null });
    },
  },
}));

const { purgeMember, restoreMember, listLockedMembers } = await import("@/lib/anti-clone");

const UID = "11111111-1111-1111-1111-111111111111";

beforeEach(() => {
  calls.length = 0;
  selectResult = { data: [], error: null, count: 0 };
});

describe("Anti Clone — 3 mức", () => {
  it("Mức 1: khóa tài khoản, không blacklist SĐT, không block IP/thiết bị, không xóa dữ liệu", async () => {
    const res = await purgeMember({ userId: UID, level: 1, reason: "spam" });
    const rpc = calls.find((c) => c.name === "rpc")!;
    expect(rpc.args.fn).toBe("admin_anti_clone_purge");
    expect(rpc.args.params).toMatchObject({ p_user: UID, p_level: 1, p_reason: "spam" });
    expect(res.deleted).toBe(false); // giữ comment/message
    expect(res.phone_blacklisted).toBe(false);
    expect(res.ip_blocked).toBe(false);
  });

  it("Mức 2: thêm blacklist SĐT", async () => {
    const res = await purgeMember({ userId: UID, level: 2 });
    expect(res.phone_blacklisted).toBe(true);
    expect(res.ip_blocked).toBe(false);
    expect(res.deleted).toBe(false);
  });

  it("Mức 3: block IP + thiết bị (Blocked Page)", async () => {
    const res = await purgeMember({
      userId: UID,
      level: 3,
      ip: "203.0.113.9",
      fingerprint: "fp-abc",
    });
    const rpc = calls.find((c) => c.name === "rpc")!;
    expect(rpc.args.params).toMatchObject({
      p_level: 3,
      p_ip: "203.0.113.9",
      p_fingerprint: "fp-abc",
    });
    expect(res.ip_blocked).toBe(true);
    expect(res.device_blocked).toBe(true);
    expect(res.deleted).toBe(false);
  });
});

describe("Tab Đã khóa", () => {
  it("listLockedMembers chỉ lấy is_banned = true và map UID/mức/lý do/thời gian", async () => {
    selectResult = {
      data: [
        {
          id: UID,
          public_id: "ZL0001",
          username: "clone1",
          full_name: "Clone Một",
          avatar_url: "a.jpg",
          phone: "0900000000",
          ban_level: 3,
          ban_reason: "clone hàng loạt",
          banned_at: "2026-08-24T10:00:00Z",
        },
      ],
      error: null,
      count: 1,
    };
    const { rows, total } = await listLockedMembers({ limit: 10 });
    expect(calls.some((c) => c.name === "eq" && c.args.col === "is_banned" && c.args.val === true)).toBe(true);
    expect(total).toBe(1);
    expect(rows[0]).toMatchObject({
      public_id: "ZL0001",
      ban_level: 3,
      ban_reason: "clone hàng loạt",
      banned_at: "2026-08-24T10:00:00Z",
      avatar: "a.jpg",
    });
  });

  it("restoreMember dùng RPC admin_anti_clone_restore hiện có", async () => {
    const res = await restoreMember(UID);
    const rpc = calls.find((c) => c.name === "rpc")!;
    expect(rpc.args.fn).toBe("admin_anti_clone_restore");
    expect(rpc.args.params).toEqual({ p_user: UID });
    expect(res.ok).toBe(true);
  });
});

describe("Không khóa oan người dùng chung IP / thiết bị (audit SQL đang dùng)", () => {
  const sql = require("fs").readFileSync(
    "supabase-sql/pending/2026-08-24_anti_clone_purge_and_gate.sql",
    "utf8",
  ) as string;

  it("IP dùng chung với tài khoản khác chưa bị khóa → không block", () => {
    expect(sql).toContain("ac_ip_is_shared");
    expect(sql).toContain("AND NOT public.ac_ip_is_shared(d.ip, p_user)");
    expect(sql).toContain("COALESCE(p.is_banned, false) = false");
  });

  it("IP private/CGNAT không bao giờ bị block", () => {
    expect(sql).toContain("100.64.0.0/10");
    expect(sql).toContain("192.168.0.0/16");
  });

  it("Fingerprint dùng chung với tài khoản chưa bị khóa → không block", () => {
    expect(sql).toMatch(/NOT EXISTS[\s\S]*d2\.user_id <> p_user[\s\S]*is_banned,false\) = false/);
  });

  it("Không xóa tài khoản → giữ comment/message; chỉ ẩn bài viết", () => {
    expect(sql).toContain("'deleted', false");
    expect(sql).toContain("UPDATE public.posts SET is_hidden = true");
    expect(sql).toContain("INSERT INTO public.forced_logouts");
    expect(sql).not.toMatch(/DELETE FROM public\.(comments|messages)/);
  });

  it("Mở khóa: hiện lại bài viết + gỡ chặn SĐT/IP/thiết bị", () => {
    expect(sql).toContain("admin_anti_clone_restore");
    expect(sql).toContain("UPDATE public.posts SET is_hidden = false");
    expect(sql).toContain("DELETE FROM public.blocked_ips");
  });

  it("Không bao giờ khóa admin", () => {
    expect(sql).toContain("cannot_ban_admin");
  });
});
