/**
 * 📡 Device Intel — đọc dữ liệu THẬT từ Supabase #3 `member_activity_log`.
 *
 * Không tạo RPC / bảng / migration mới: chỉ SELECT trực tiếp bảng đang có,
 * rồi gom nhóm ở phía client. Hồ sơ (avatar/tên/UID/SĐT) lấy từ Supabase #1
 * `profiles` như phần còn lại của app.
 */
import { db3, supabase } from "@/lib/db/router";

export type ActivityRow = {
  id: string;
  user_id: string | null;
  action: string | null;
  detail: string | null;
  ip: string | null;
  fingerprint: string | null;
  metadata: Record<string, any> | null;
  created_at: string | null;
};

export type IpGroup = {
  ip: string;
  accounts_count: number;
  events_count: number;
  registrations_count: number;
  last_fingerprint: string | null;
  last_user_agent: string | null;
  last_seen_at: string | null;
};

export type FingerprintGroup = IpGroup & { fingerprint: string };

export type IpAccount = {
  id: string;
  public_id: string | null;
  username: string | null;
  full_name: string | null;
  phone: string | null;
  avatar: string | null;
  ip: string | null;
  fingerprint: string | null;
  last_seen_at: string | null;
  events_count: number;
};

export type DeviceSignalView = {
  ip: string | null;
  last_active_at: string | null;
  fingerprint: string | null;
  user_agent: string | null;
  browser: string;
  os: string;
  device: string;
  country: string | null;
  isp: string | null;
  /** Thiết bị dùng lúc đăng ký (nếu log có bản ghi action = register). */
  register_fingerprint: string | null;
  register_ip: string | null;
  register_at: string | null;
  events_count: number;
};

export type PasswordChangeEntry = {
  at: string | null;
  source: "member_activity_log" | "activity_logs";
  ip: string | null;
  detail: string | null;
};

/** Dấu hiệu IP/thiết bị dùng chung của 1 tài khoản (tính từ log thật). */
export type UserDeviceMark = {
  ip: string | null;
  fingerprint: string | null;
  last_seen_at: string | null;
  /** Số tài khoản khác nhau từng dùng IP này. */
  ip_accounts: number;
  /** Số tài khoản khác nhau từng dùng fingerprint này. */
  device_accounts: number;
  /** true = IP hoặc thiết bị bị dùng bởi ≥ 2 tài khoản. */
  shared: boolean;
};


/** Số dòng log tối đa nạp về để gom nhóm phía client. */
const LOG_LIMIT = 5000;

const SELECT = "id,user_id,action,detail,ip,fingerprint,metadata,created_at";

/** Lấy user agent thật từ metadata (không bịa dữ liệu). */
export function uaFromMetadata(meta: Record<string, any> | null | undefined): string | null {
  if (!meta) return null;
  const v = meta["user_agent"] ?? meta["userAgent"] ?? meta["ua"];
  return typeof v === "string" && v.trim() ? v : null;
}

/** Parse Browser / OS / Device từ user agent thật. */
export function parseUA(ua: string | null | undefined) {
  const s = ua ?? "";
  if (!s) return { browser: "—", os: "—", device: "—" };
  const browser =
    /Edg\//.test(s) ? "Edge" :
    /OPR\/|Opera/.test(s) ? "Opera" :
    /FBAV|FBAN/.test(s) ? "Facebook" :
    /CriOS|Chrome\//.test(s) ? "Chrome" :
    /Firefox\//.test(s) ? "Firefox" :
    /Safari\//.test(s) ? "Safari" : "Khác";
  const os =
    /Windows NT 10/.test(s) ? "Windows 10/11" :
    /Windows/.test(s) ? "Windows" :
    /Android/.test(s) ? "Android" :
    /iPhone|iPad|iOS|CPU OS/.test(s) ? "iOS" :
    /Mac OS X/.test(s) ? "macOS" :
    /Linux/.test(s) ? "Linux" : "Khác";
  const device =
    /iPad|Tablet/.test(s) ? "Tablet" :
    /Mobi|Android|iPhone/.test(s) ? "Mobile" : "Desktop";
  return { browser, os, device };
}

/** Nạp log hoạt động thật (mới nhất trước). */
export async function fetchActivityLog(limit = LOG_LIMIT): Promise<ActivityRow[]> {
  const { data, error } = await (db3().from("member_activity_log") as any)
    .select(SELECT)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ActivityRow[];
}

type GroupAcc = {
  key: string;
  users: Set<string>;
  events: number;
  registrations: number;
  last_seen_at: string | null;
  last_fingerprint: string | null;
  last_ip: string | null;
  last_user_agent: string | null;
};

function groupRows(rows: ActivityRow[], by: "ip" | "fingerprint") {
  const map = new Map<string, GroupAcc>();
  for (const r of rows) {
    const key = (by === "ip" ? r.ip : r.fingerprint) || "";
    if (!key) continue;
    let g = map.get(key);
    if (!g) {
      g = {
        key, users: new Set(), events: 0, registrations: 0,
        last_seen_at: null, last_fingerprint: null, last_ip: null, last_user_agent: null,
      };
      map.set(key, g);
    }
    g.events += 1;
    if (r.user_id) g.users.add(r.user_id);
    if (r.action === "register") g.registrations += 1;
    // rows đã sort desc → dòng đầu tiên gặp là mới nhất.
    if (!g.last_seen_at) {
      g.last_seen_at = r.created_at;
      g.last_fingerprint = r.fingerprint;
      g.last_ip = r.ip;
      g.last_user_agent = uaFromMetadata(r.metadata);
    }
    if (!g.last_user_agent) g.last_user_agent = uaFromMetadata(r.metadata);
  }
  return map;
}

export type IpSort = "accounts" | "recent" | "ip";

/** Gom log theo IP: mỗi IP → số tài khoản trùng, lần cuối hoạt động… */
export function buildIpGroups(
  rows: ActivityRow[],
  opts: { q?: string; minAccounts?: number; sort?: IpSort } = {},
): IpGroup[] {
  const { q = "", minAccounts = 1, sort = "accounts" } = opts;
  const term = q.trim().toLowerCase();
  let list = Array.from(groupRows(rows, "ip").values()).map<IpGroup>((g) => ({
    ip: g.key,
    accounts_count: g.users.size,
    events_count: g.events,
    registrations_count: g.registrations,
    last_fingerprint: g.last_fingerprint,
    last_user_agent: g.last_user_agent,
    last_seen_at: g.last_seen_at,
  }));
  if (term) list = list.filter((g) => g.ip.toLowerCase().includes(term));
  if (minAccounts > 1) list = list.filter((g) => g.accounts_count >= minAccounts);
  list.sort((a, b) => {
    if (sort === "ip") return a.ip.localeCompare(b.ip, undefined, { numeric: true });
    if (sort === "recent") return (b.last_seen_at ?? "").localeCompare(a.last_seen_at ?? "");
    return b.accounts_count - a.accounts_count ||
      (b.last_seen_at ?? "").localeCompare(a.last_seen_at ?? "");
  });
  return list;
}

/** Gom log theo Fingerprint (dùng chung cấu trúc với IP). */
export function buildFingerprintGroups(
  rows: ActivityRow[],
  opts: { q?: string; minAccounts?: number; sort?: IpSort } = {},
): FingerprintGroup[] {
  const { q = "", minAccounts = 1, sort = "accounts" } = opts;
  const term = q.trim().toLowerCase();
  let list = Array.from(groupRows(rows, "fingerprint").values()).map<FingerprintGroup>((g) => ({
    ip: g.last_ip ?? "",
    fingerprint: g.key,
    accounts_count: g.users.size,
    events_count: g.events,
    registrations_count: g.registrations,
    last_fingerprint: g.key,
    last_user_agent: g.last_user_agent,
    last_seen_at: g.last_seen_at,
  }));
  if (term) list = list.filter((g) => g.fingerprint.toLowerCase().includes(term));
  if (minAccounts > 1) list = list.filter((g) => g.accounts_count >= minAccounts);
  list.sort((a, b) => {
    if (sort === "ip") return a.fingerprint.localeCompare(b.fingerprint);
    if (sort === "recent") return (b.last_seen_at ?? "").localeCompare(a.last_seen_at ?? "");
    return b.accounts_count - a.accounts_count;
  });
  return list;
}

/** Danh sách tài khoản đã hoạt động trên 1 IP (hoặc 1 fingerprint) — kèm hồ sơ thật. */
export async function fetchGroupAccounts(
  group: "ip" | "fingerprint",
  value: string,
): Promise<IpAccount[]> {
  const { data, error } = await (db3().from("member_activity_log") as any)
    .select(SELECT)
    .eq(group, value)
    .order("created_at", { ascending: false })
    .limit(LOG_LIMIT);
  if (error) throw error;

  const rows = (data ?? []) as ActivityRow[];
  const byUser = new Map<string, { last: ActivityRow; count: number }>();
  for (const r of rows) {
    if (!r.user_id) continue;
    const cur = byUser.get(r.user_id);
    if (cur) cur.count += 1;
    else byUser.set(r.user_id, { last: r, count: 1 });
  }
  const ids = Array.from(byUser.keys());
  if (!ids.length) return [];

  const { data: profiles } = await (supabase.from("profiles") as any)
    .select("id, public_id, username, full_name, phone, avatar")
    .in("id", ids);
  const pmap = new Map<string, any>((profiles ?? []).map((p: any) => [p.id, p]));

  return ids.map((id) => {
    const info = byUser.get(id)!;
    const p = pmap.get(id);
    return {
      id,
      public_id: p?.public_id ?? null,
      username: p?.username ?? null,
      full_name: p?.full_name ?? null,
      phone: p?.phone ?? null,
      avatar: p?.avatar ?? null,
      ip: info.last.ip,
      fingerprint: info.last.fingerprint,
      last_seen_at: info.last.created_at,
      events_count: info.count,
    };
  }).sort((a, b) => (b.last_seen_at ?? "").localeCompare(a.last_seen_at ?? ""));
}

/**
 * Tín hiệu thiết bị của 1 user — lấy bản ghi THẬT mới nhất trong
 * SB3.member_activity_log. Mỗi trường lấy bản ghi mới nhất có giá trị
 * (nhiều dòng cũ có `metadata = {}`), không bịa dữ liệu.
 */
export async function fetchLatestDeviceSignal(userId: string): Promise<DeviceSignalView | null> {
  const { data, error } = await (db3().from("member_activity_log") as any)
    .select(SELECT)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  const rows = (data ?? []) as ActivityRow[];
  if (!rows.length) return null;

  const latest = rows[0]!;
  const ipRow = rows.find((r) => r.ip);
  const fpRow = rows.find((r) => r.fingerprint);
  const uaRow = rows.find((r) => uaFromMetadata(r.metadata));
  const metaRow = rows.find((r) => {
    const m = r.metadata;
    return m && Object.keys(m).length > 0;
  });
  const ua = uaRow ? uaFromMetadata(uaRow.metadata) : null;
  const meta = (uaRow?.metadata ?? metaRow?.metadata ?? {}) as Record<string, any>;
  const parsed = parseUA(ua);
  const reg = rows.filter((r) => r.action === "register").pop() ?? null;

  return {
    ip: ipRow?.ip ?? null,
    last_active_at: latest.created_at,
    fingerprint: fpRow?.fingerprint ?? null,
    user_agent: ua,
    browser: (meta["browser"] as string) || parsed.browser,
    os: (meta["os"] as string) || parsed.os,
    device: (meta["device_type"] as string) || parsed.device,
    country: (meta["country"] as string) ?? null,
    isp: (meta["isp"] as string) ?? null,
    register_fingerprint: reg?.fingerprint ?? null,
    register_ip: reg?.ip ?? null,
    register_at: reg?.created_at ?? null,
    events_count: rows.length,
  };
}

/**
 * Gom log thật → mỗi user: IP/fingerprint gần nhất + số tài khoản dùng chung.
 * Dùng cho chấm màu ở cột IP trong danh sách thành viên.
 */
export function buildUserDeviceMarks(rows: ActivityRow[]): Map<string, UserDeviceMark> {
  const ipUsers = new Map<string, Set<string>>();
  const fpUsers = new Map<string, Set<string>>();
  const latest = new Map<string, UserDeviceMark>();

  // rows đã sort desc → lần đầu gặp user là bản ghi mới nhất.
  for (const r of rows) {
    if (!r.user_id) continue;
    if (r.ip) {
      let s = ipUsers.get(r.ip);
      if (!s) ipUsers.set(r.ip, (s = new Set()));
      s.add(r.user_id);
    }
    if (r.fingerprint) {
      let s = fpUsers.get(r.fingerprint);
      if (!s) fpUsers.set(r.fingerprint, (s = new Set()));
      s.add(r.user_id);
    }
    const cur = latest.get(r.user_id);
    if (!cur) {
      latest.set(r.user_id, {
        ip: r.ip, fingerprint: r.fingerprint, last_seen_at: r.created_at,
        ip_accounts: 0, device_accounts: 0, shared: false,
      });
    } else {
      if (!cur.ip && r.ip) cur.ip = r.ip;
      if (!cur.fingerprint && r.fingerprint) cur.fingerprint = r.fingerprint;
    }
  }

  for (const mark of latest.values()) {
    mark.ip_accounts = mark.ip ? (ipUsers.get(mark.ip)?.size ?? 0) : 0;
    mark.device_accounts = mark.fingerprint ? (fpUsers.get(mark.fingerprint)?.size ?? 0) : 0;
    mark.shared = mark.ip_accounts >= 2 || mark.device_accounts >= 2;
  }
  return latest;
}

/** Nạp log + gom sẵn dấu hiệu IP/thiết bị dùng chung theo user. */
export async function fetchUserDeviceMarks(): Promise<Map<string, UserDeviceMark>> {
  return buildUserDeviceMarks(await fetchActivityLog());
}


/** Lịch sử đổi mật khẩu — đọc dữ liệu có thật ở cả 2 bảng log hiện hữu. */
export async function fetchPasswordChanges(userId: string): Promise<PasswordChangeEntry[]> {
  const out: PasswordChangeEntry[] = [];

  const { data: mal } = await (db3().from("member_activity_log") as any)
    .select("action, detail, ip, created_at")
    .eq("user_id", userId)
    .eq("action", "password_change")
    .order("created_at", { ascending: false })
    .limit(50);
  for (const r of (mal ?? []) as any[]) {
    out.push({ at: r.created_at, source: "member_activity_log", ip: r.ip ?? null, detail: r.detail ?? null });
  }

  const { data: legacy } = await (db3().from("activity_logs") as any)
    .select("action_type, metadata, created_at")
    .eq("user_id", userId)
    .eq("action_type", "password_change")
    .order("created_at", { ascending: false })
    .limit(50);
  for (const r of (legacy ?? []) as any[]) {
    out.push({
      at: r.created_at,
      source: "activity_logs",
      ip: null,
      detail: (r.metadata?.description as string) ?? null,
    });
  }

  return out.sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
}
