/**
 * 🛡️ CHẶN REQUEST 404 LẶP VÔ TẬN (bảng chưa tồn tại trong Supabase).
 *
 * Một số tính năng (stories, video social, chặn người dùng...) chưa được deploy
 * schema lên Supabase. Code cũ vẫn gọi REST → mỗi lần render bắn hàng loạt
 * request 404, tốn băng thông và làm nghẽn network.
 *
 * Cơ chế:
 *  1. Seed sẵn danh sách bảng đã xác nhận KHÔNG tồn tại ở cả 3 Supabase.
 *  2. Học thêm lúc runtime: gặp 404 / PGRST205 → ghi nhớ (per instance) và
 *     KHÔNG gọi lại nữa trong phiên đó; trả về kết quả rỗng để UI vẫn chạy.
 *  3. Khi bạn đã chạy migration tạo bảng: gọi `window.__dbResetMissingTables()`
 *     trong console (hoặc reload tab mới) để quét lại.
 */

/** Bảng chưa tồn tại ở BẤT KỲ Supabase nào (đã probe thực tế). */
const SEED_MISSING = [
  "admin_settings",
  "agent_fb_accounts",
  "bait_group_folders",
  "bait_groups",
  "connect_scan_usage",
  "connect_settings",
  "connection_requests",
  "dragon_ball_instances",
  "fake_follows",
  "featured_moment_views",
  "featured_moments",
  "fwb_profiles",
  "gift_items",
  "group_members",
  "groups",
  "guides",
  "nearby_match_notifications",
  "pet_collection",
  "pet_reward_requests",
  "pet_transactions",
  "post_coin_claims",
  "profile_gallery",
  "red_packet_claims",
  "reports",
  "stories",
  "story_views",
  "title_gifs",
  "user_blocks",
  "user_dragon_ball_inventory",
  "user_locations",
  "video_comments",
  "video_gifts",
  "video_likes",
  "video_views",
  "videos_social",
];

const STORAGE_KEY = "candy.db.missingTables.v1";

const missing = new Map<string, Set<string>>();

function setFor(instance: string): Set<string> {
  let s = missing.get(instance);
  if (!s) {
    s = new Set(SEED_MISSING);
    missing.set(instance, s);
  }
  return s;
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    const plain: Record<string, string[]> = {};
    for (const [k, v] of missing) plain[k] = [...v];
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(plain));
  } catch {
    /* ignore */
  }
}

function hydrate() {
  if (typeof window === "undefined") return;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const plain = JSON.parse(raw) as Record<string, string[]>;
    for (const [k, list] of Object.entries(plain)) {
      const s = setFor(k);
      for (const t of list) s.add(t);
    }
  } catch {
    /* ignore */
  }
}
hydrate();

export const isTableMissing = (instance: string, table: string) => setFor(instance).has(table);

export function markTableMissing(instance: string, table: string) {
  const s = setFor(instance);
  if (s.has(table)) return;
  s.add(table);
  persist();
  if (import.meta.env.DEV) {
    console.warn(`[db] Bảng "${table}" không tồn tại trên ${instance} — tạm dừng gọi API này.`);
  }
}

export function resetMissingTables() {
  missing.clear();
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
}

if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>)["__dbResetMissingTables"] = resetMissingTables;
}

/** Lấy tên bảng từ URL REST của PostgREST (…/rest/v1/<table>?…). */
export function tableFromRestUrl(url: string): string | null {
  const m = /\/rest\/v1\/([A-Za-z0-9_]+)/.exec(url);
  if (!m) return null;
  const t = m[1];
  return t === "rpc" ? null : t;
}

const emptyResponse = (accept: string) => {
  const single = accept.includes("pgrst.object");
  return new Response(single ? "null" : "[]", {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Range": "*/0",
    },
  });
};

/**
 * fetch bọc cho supabase-js: bỏ qua request tới bảng đã biết là thiếu và
 * ghi nhớ những bảng trả về 404/PGRST205.
 */
export function createGuardedFetch(instance: string): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const table = tableFromRestUrl(url);

    const headers = new Headers(
      init?.headers ?? (typeof input === "object" && "headers" in input ? input.headers : undefined),
    );
    const accept = headers.get("accept") ?? "";

    if (table && isTableMissing(instance, table)) {
      const method = (init?.method ?? (typeof input === "object" && "method" in input ? input.method : "GET")) || "GET";
      if (method.toUpperCase() === "GET") return emptyResponse(accept);
      return new Response("null", { status: 200, headers: { "Content-Type": "application/json" } });
    }

    const res = await fetch(input as RequestInfo, init);

    if (table && res.status === 404) {
      markTableMissing(instance, table);
      return emptyResponse(accept);
    }

    return res;
  };
}
