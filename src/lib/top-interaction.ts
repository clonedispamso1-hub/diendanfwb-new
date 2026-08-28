/**
 * top-interaction — "Top tương tác tuần" dùng chung cho Trang chủ & Admin → Thống kê.
 *
 * Nguyên tắc:
 *  • Điểm THẬT lấy từ bảng xếp hạng tuần có sẵn (SB3 `leaderboard_weekly`) — KHÔNG đụng vào.
 *  • Điểm MÔ PHỎNG do Admin đặt, chỉ lưu 4 số / tài khoản trong site setting
 *    `leaderboard_sim`: { start, target, from, to }. Không tạo bảng, không ghi dữ liệu rác.
 *  • Giá trị mô phỏng hiện tại được NỘI SUY TUYẾN TÍNH ở frontend theo thời gian
 *    (tăng dần từ start → target trong khoảng from → to). Không cần cron, không gọi lặp.
 *  • Điểm hiển thị = max(điểm thật, điểm mô phỏng) ⇒ tài khoản thật vượt mô phỏng
 *    thì tự động xếp hạng cao hơn.
 */
import { supabase } from "@/lib/supabase";
import { getSiteSetting } from "@/lib/admin-db";
import { dailyLeaderboardCached, weeklyLeaderboardCached } from "@/lib/leaderboard-cache";

export const SIM_SETTING_KEY = "leaderboard_sim";

export type SimEntry = {
  /** Điểm mô phỏng lúc bắt đầu */
  start: number;
  /** Điểm mục tiêu */
  target: number;
  /** Mốc thời gian bắt đầu (ms epoch) */
  from: number;
  /** Mốc thời gian đạt mục tiêu (ms epoch) */
  to: number;
};

export type SimMap = Record<string, SimEntry>;

export type TopRow = {
  user_id: string;
  name: string;
  avatar: string | null;
  /** Điểm thật từ hệ thống */
  real: number;
  /** Điểm mô phỏng tại thời điểm hiện tại (0 nếu không có) */
  sim: number;
  /** Điểm hiển thị = max(real, sim) */
  score: number;
};

/** Nội suy tuyến tính điểm mô phỏng tại thời điểm `now`. */
export function simValueAt(e: SimEntry | undefined | null, now = Date.now()): number {
  if (!e) return 0;
  const start = Number(e.start) || 0;
  const target = Number(e.target) || 0;
  const from = Number(e.from) || 0;
  const to = Number(e.to) || 0;
  if (!(to > from)) return Math.max(0, Math.round(target));
  if (now <= from) return Math.max(0, Math.round(start));
  if (now >= to) return Math.max(0, Math.round(target));
  const ratio = (now - from) / (to - from);
  return Math.max(0, Math.round(start + (target - start) * ratio));
}

export function normalizeSimMap(raw: unknown): SimMap {
  const out: SimMap = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [id, v] of Object.entries(raw as Record<string, any>)) {
    if (!v || typeof v !== "object") continue;
    out[id] = {
      start: Number(v.start) || 0,
      target: Number(v.target) || 0,
      from: Number(v.from) || 0,
      to: Number(v.to) || 0,
    };
  }
  return out;
}

export async function loadSimMap(force = false): Promise<SimMap> {
  try {
    return normalizeSimMap(await getSiteSetting<any>(SIM_SETTING_KEY, force));
  } catch {
    return {};
  }
}

const PROFILE_COLS = "id, display_name, full_name, username, avatar, avatar_url";

function nameOf(p: any): string {
  return p?.display_name || p?.full_name || p?.username || "Người dùng";
}

/**
 * Lấy Top tương tác đã hợp nhất điểm thật + điểm mô phỏng.
 * Chỉ 2 request tối đa (bảng xếp hạng có cache 5', setting có cache 10',
 * profiles chỉ cho các tài khoản mô phỏng chưa có trong bảng).
 */
export async function fetchTopInteraction(limit = 10, force = false): Promise<TopRow[]> {
  const [daily, sim] = await Promise.all([dailyLeaderboardCached(force), loadSimMap(force)]);
  // Ngày chưa có tương tác nào ⇒ lùi về bảng tuần để không hiện thẻ rỗng.
  const lb = daily.length > 0 ? daily : await weeklyLeaderboardCached(force);

  const now = Date.now();
  const map = new Map<string, TopRow>();

  for (const r of lb || []) {
    const id = String((r as any).user_id);
    if (!id) continue;
    const real = Number((r as any).score ?? 0);
    map.set(id, {
      user_id: id,
      name: (r as any).name || "Người dùng",
      avatar: (r as any).avatar ?? null,
      real,
      sim: 0,
      score: real,
    });
  }

  const missing: string[] = [];
  for (const [id, entry] of Object.entries(sim) as [string, SimEntry][]) {
    const value = simValueAt(entry, now);
    const row = map.get(id);
    if (row) {
      row.sim = value;
      row.score = Math.max(row.real, value);
    } else {
      map.set(id, { user_id: id, name: "Người dùng", avatar: null, real: 0, sim: value, score: value });
      missing.push(id);
    }
  }

  if (missing.length) {
    try {
      const { data } = await (supabase as any).from("profiles").select(PROFILE_COLS).in("id", missing);
      (data || []).forEach((p: any) => {
        const row = map.get(String(p.id));
        if (!row) return;
        row.name = nameOf(p);
        row.avatar = p.avatar || p.avatar_url || null;
      });
    } catch {
      /* thiếu hồ sơ ⇒ vẫn hiển thị hàng, chỉ khuyết tên/avatar */
    }
  }

  return [...map.values()]
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.user_id.localeCompare(b.user_id))
    .slice(0, limit);
}
