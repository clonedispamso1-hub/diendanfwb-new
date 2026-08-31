/**
 * 🔀 DATABASE ROUTER TRUNG TÂM.
 *
 * Mọi truy vấn trong app đều phải đi qua đây. Component / service KHÔNG được
 * import trực tiếp `@supabase/supabase-js` hay các file client rời rạc nữa.
 *
 * Cách dùng:
 *   import { db } from "@/lib/db/router";
 *   const { data } = await db("feed").from("posts").select("id, content");
 *
 * Khi cần chuyển module sang Supabase khác → sửa duy nhất `src/lib/db/config.ts`.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  ADMIN_SESSION_STORAGE_KEY,
  MODULE_DB,
  SUPABASE_INSTANCES,
  type InstanceConfig,
  type InstanceId,
  type ModuleName,
} from "./config";
import { createGuardedFetch } from "./missing-tables";

const clients = new Map<string, SupabaseClient<any>>();

function build(cfg: InstanceConfig, storageKey?: string): SupabaseClient<any> {
  const browser = typeof window !== "undefined";
  const persist = cfg.persistSession && browser;
  return createClient<any>(cfg.url || "https://invalid.supabase.co", cfg.anonKey || "public-anon-key", {
    auth: {
      storage: persist ? window.localStorage : undefined,
      storageKey: storageKey ?? cfg.storageKey,
      persistSession: persist,
      autoRefreshToken: persist,
    },
    // Chặn request lặp tới bảng chưa tồn tại (404) — xem ./missing-tables.ts
    global: { fetch: createGuardedFetch(cfg.id) },
  });
}


/** Lazy singleton theo instance (mỗi Supabase chỉ tạo 1 client). */
export function getInstanceClient(id: InstanceId, storageKey?: string): SupabaseClient<any> {
  const key = storageKey ? `${id}:${storageKey}` : id;
  let c = clients.get(key);
  if (!c) {
    c = build(SUPABASE_INSTANCES[id], storageKey);
    clients.set(key, c);
  }
  return c;
}

/** Entry point chính: lấy client theo module nghiệp vụ. */
export function db(module: ModuleName = "misc"): SupabaseClient<any> {
  return getInstanceClient(MODULE_DB[module]);
}

/** Instance nào đang phục vụ module này (dùng cho debug / báo cáo). */
export const instanceOf = (module: ModuleName): InstanceId => MODULE_DB[module];

/* ------------------------------------------------------------------ */
/* Alias tương thích ngược — vẫn đi qua router, không tạo client rời.   */
/* ------------------------------------------------------------------ */

/** Supabase #1 (core/auth). Tương đương db("auth"). */
export const supabase = getInstanceClient("primary");

/** Supabase #2 (media / VIP). */
export const db2 = (): SupabaseClient<any> => getInstanceClient("media");
export const isSecondaryConfigured = Boolean(
  SUPABASE_INSTANCES.media.url && SUPABASE_INSTANCES.media.anonKey,
);

/** Supabase #3 (logs / stats). */
export const db3 = (): SupabaseClient<any> => getInstanceClient("logs");
export const supabase3Client = db3;
export const isLogsDbConfigured = Boolean(
  SUPABASE_INSTANCES.logs.url && SUPABASE_INSTANCES.logs.anonKey,
);

/** Phiên đăng nhập riêng của Bang Chủ (storageKey tách biệt). */
export const supabaseAdminSession = getInstanceClient("primary", ADMIN_SESSION_STORAGE_KEY);

export type { ModuleName, InstanceId };
