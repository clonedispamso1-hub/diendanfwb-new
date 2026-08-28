/**
 * Lịch sử Gem của 1 thành viên — chia 5 mục cho popup Admin (Quản lý thành viên).
 *
 * CHỈ ĐỌC bảng đang tồn tại trên Supabase #1:
 *   • withdrawal_requests   → Rút tiền
 *   • transfer_transactions → Chuyển tiền (gửi đi) / Nhận tiền (nhận về)
 *   • post_gifts            → Tặng quà (gửi) / Nhận quà (nhận)
 * Không tạo bảng mới, không sinh dữ liệu giả, KHÔNG xoá dữ liệu gốc.
 *
 * Mặc định chỉ tải giao dịch trong 24 giờ gần nhất (nhẹ + nhanh),
 * có phân trang (offset) và tuỳ chọn mở rộng khoảng thời gian.
 */
import { supabase } from "@/lib/db/router";

const sb1 = () => supabase as any;

export type GemCategory =
  | "withdraw"
  | "transfer_out"
  | "transfer_in"
  | "gift_in"
  | "gift_out";

export const GEM_CATEGORY_LABEL: Record<GemCategory, string> = {
  withdraw: "Rút tiền",
  transfer_out: "Chuyển tiền",
  transfer_in: "Nhận tiền",
  gift_in: "Nhận quà",
  gift_out: "Tặng quà",
};

export const GEM_CATEGORIES: GemCategory[] = [
  "withdraw",
  "transfer_out",
  "transfer_in",
  "gift_in",
  "gift_out",
];

/** Khoảng thời gian tải dữ liệu. Mặc định 24 giờ. */
export type GemRange = "24h" | "7d" | "30d" | "all";

export const GEM_RANGE_LABEL: Record<GemRange, string> = {
  "24h": "24 giờ",
  "7d": "7 ngày",
  "30d": "30 ngày",
  all: "Tất cả",
};

export function rangeSince(range: GemRange): string | null {
  const H = 3600_000;
  if (range === "24h") return new Date(Date.now() - 24 * H).toISOString();
  if (range === "7d") return new Date(Date.now() - 7 * 24 * H).toISOString();
  if (range === "30d") return new Date(Date.now() - 30 * 24 * H).toISOString();
  return null;
}

export type GemEntry = {
  id: string;
  at: string | null;
  amount: number;          // dương = vào ví, âm = ra khỏi ví
  counterpart: string | null;
  note: string | null;
  status: string | null;
  code: string;
};

type Source = {
  table: string;
  /** các tên cột có thể dùng để lọc theo user (thử lần lượt). */
  userCols: string[];
  /** cột chứa "đối phương" (nếu có). */
  peerCols: string[];
  sign: 1 | -1;
};

const SOURCES: Record<GemCategory, Source> = {
  withdraw: { table: "withdrawal_requests", userCols: ["user_id"], peerCols: [], sign: -1 },
  transfer_out: { table: "transfer_transactions", userCols: ["sender_id", "from_id"], peerCols: ["receiver_id", "to_id"], sign: -1 },
  transfer_in: { table: "transfer_transactions", userCols: ["receiver_id", "to_id"], peerCols: ["sender_id", "from_id"], sign: 1 },
  gift_in: { table: "post_gifts", userCols: ["receiver_id", "to_user_id"], peerCols: ["from_user_id", "sender_id"], sign: 1 },
  gift_out: { table: "post_gifts", userCols: ["from_user_id", "sender_id"], peerCols: ["receiver_id", "to_user_id"], sign: -1 },
};

/** Cột không tồn tại trên DB → PostgREST trả 42703 / message "does not exist". */
function isMissingColumn(error: any): boolean {
  const code = String(error?.code ?? "");
  const msg = String(error?.message ?? "").toLowerCase();
  return code === "42703" || code === "PGRST204" || msg.includes("does not exist") || msg.includes("column");
}

function isMissingTable(error: any): boolean {
  const code = String(error?.code ?? "");
  const msg = String(error?.message ?? "").toLowerCase();
  return code === "42P01" || code === "PGRST205" || msg.includes("could not find the table");
}

async function profilesByIds(ids: string[]): Promise<Map<string, any>> {
  const map = new Map<string, any>();
  if (!ids.length) return map;
  const { data } = await sb1()
    .from("profiles")
    .select("id, username, full_name, public_id")
    .in("id", ids);
  (data ?? []).forEach((p: any) => map.set(p.id, p));
  return map;
}

/** Đếm số giao dịch của 1 mục (head-only → không kéo dữ liệu). */
export async function countCategory(
  userId: string,
  cat: GemCategory,
  range: GemRange = "24h",
): Promise<number> {
  const src = SOURCES[cat];
  const since = rangeSince(range);
  for (const col of src.userCols) {
    let q = sb1().from(src.table).select("id", { count: "exact", head: true }).eq(col, userId);
    if (since) q = q.gte("created_at", since);
    const { count, error } = await q;
    if (!error) return Number(count ?? 0);
    if (isMissingTable(error)) return 0;
    if (!isMissingColumn(error)) return 0;
  }
  return 0;
}

export async function countAllCategories(
  userId: string,
  range: GemRange = "24h",
): Promise<Record<GemCategory, number>> {
  const entries = await Promise.all(
    GEM_CATEGORIES.map(async (c) => [c, await countCategory(userId, c, range)] as const),
  );
  return Object.fromEntries(entries) as Record<GemCategory, number>;
}

export async function listCategory(
  userId: string,
  cat: GemCategory,
  opts: { range?: GemRange; limit?: number; offset?: number } = {},
): Promise<GemEntry[]> {
  const { range = "24h", limit = 20, offset = 0 } = opts;
  const src = SOURCES[cat];
  const since = rangeSince(range);

  let rows: any[] | null = null;
  for (const col of src.userCols) {
    let q = sb1()
      .from(src.table)
      .select("*")
      .eq(col, userId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (since) q = q.gte("created_at", since);
    const { data, error } = await q;
    if (!error) { rows = (data ?? []) as any[]; break; }
    if (isMissingTable(error)) return [];
    if (!isMissingColumn(error)) throw error;
  }
  if (!rows) return [];

  const peerOf = (r: any): string | null => {
    for (const c of src.peerCols) if (r[c]) return String(r[c]);
    return null;
  };
  const peerIds = Array.from(new Set(rows.map(peerOf).filter((x): x is string => !!x)));
  const profiles = await profilesByIds(peerIds);

  return rows.map((r) => {
    const peer = peerOf(r);
    const p = peer ? profiles.get(peer) : null;
    const bank = [r.bank_name, r.bank_account, r.account_holder].filter(Boolean).join(" · ");
    return {
      id: String(r.id),
      at: r.created_at ?? null,
      amount: src.sign * Number(r.net_amount ?? r.amount ?? 0),
      counterpart: p
        ? `${p.full_name || p.username || String(peer).slice(0, 8)}${p.public_id ? ` · #${p.public_id}` : ""}`
        : (bank || (peer ? String(peer).slice(0, 8) : null)),
      note: r.note ?? r.gift_key ?? null,
      status: r.status ?? (r.claimed === true ? "claimed" : null),
      code: String(r.code ?? r.id).slice(0, 8),
    };
  });
}
