/**
 * DATABASE ROUTER — điểm truy cập DUY NHẤT tới dữ liệu.
 *
 *   Database.users()          → bảng profiles (core)
 *   Database.posts()          → bảng posts    (theo config)
 *   Database.messages()       → bảng messages (theo config)
 *   Database.notifications()  → bảng notifications (social)
 *   Database.table("likes")   → tự chọn client theo config
 *   Database.upload(file, {kind}) → MediaService (Supabase 2 / Cloudinary)
 *
 * Muốn chuyển một module sang Supabase khác: sửa `./config.ts`, KHÔNG sửa
 * component.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { coreDb } from "./core";
import { socialDb } from "./social";
import { storage } from "./storage";
import { targetForTable, type DbTarget } from "./config";

export * from "./config";
export { coreDb } from "./core";
export { socialDb, isSocialDbConfigured } from "./social";
export { storageDb, isStorageConfigured, storage } from "./storage";

/** Client tương ứng với một target. */
export function clientFor(target: DbTarget): SupabaseClient<any> {
  return target === "social" ? socialDb() : coreDb();
}

/** Client phụ trách một bảng cụ thể. */
export function clientForTable(table: string): SupabaseClient<any> {
  return clientFor(targetForTable(table));
}

/** Query builder đã gắn đúng client cho bảng. */
function tableRef(table: string) {
  return clientForTable(table).from(table);
}

/** RPC luôn chạy trên database chứa hàm đó (mặc định core). */
function rpc(fn: string, args?: Record<string, unknown>, target: DbTarget = "core") {
  return clientFor(target).rpc(fn, args as any);
}

export const Database = {
  /** Truy cập bảng bất kỳ theo tên (router tự chọn database). */
  table: tableRef,
  client: clientForTable,
  clientFor,
  rpc,

  // --- Core -------------------------------------------------------------
  users: () => tableRef("profiles"),
  roles: () => tableRef("user_roles"),
  wallets: () => tableRef("wallets"),
  transactions: () => tableRef("transactions"),
  reports: () => tableRef("reports"),
  adminLogs: () => tableRef("admin_logs"),
  auth: () => coreDb().auth,

  // --- Social / nội dung -------------------------------------------------
  posts: () => tableRef("posts"),
  comments: () => tableRef("comments"),
  likes: () => tableRef("likes"),
  follows: () => tableRef("follows"),
  messages: () => tableRef("messages"),
  messageReactions: () => tableRef("message_reactions"),
  notifications: () => tableRef("notifications"),
  activityLogs: () => tableRef("activity_logs"),
  postViews: () => tableRef("post_views"),
  profileViews: () => tableRef("profile_views"),

  // --- Storage -----------------------------------------------------------
  upload: storage.upload,
  uploadUrl: storage.uploadUrl,
  deleteFile: storage.remove,
  fileUrl: storage.url,
};

export default Database;
