import { avatarSrc } from "@/lib/image-cdn";
// SecondAccountsManager — quản lý "Tài khoản thứ hai" (internal accounts).
// Chỉ Bang Chủ / Super Admin mới truy cập (đã gate ở AdminV3Shell).
// Toàn bộ thao tác đi qua RPC SECURITY DEFINER trong:
//   docs/sql/2026-07-28_internal_accounts.sql
//   docs/sql/2026-07-29_internal_accounts_v2.sql
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ProfileStickerPicker } from "@/components/candy/profile-sticker-picker";
import { toast } from "sonner";
import {
  Users, Plus, Search, RefreshCw, Trash2, Lock, Unlock, Pencil,
  Download, Upload, X, Save, MessageSquare, FileText, MessagesSquare,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useRealtime } from "@/lib/realtime-registry";
import { MessagesTab, PostTab, type AccountLite } from "./InternalTools";
import { BulkCommentTab } from "./BulkCommentTab";
import { getNotifClearedAt } from "@/lib/admin/internal-cleanup";
import { CloneNotificationsTab } from "./CloneNotificationsTab";
import { Bell, Gift } from "lucide-react";

import { BulkAccountCreator } from "./BulkAccountCreator";
import { BulkSelectionToolbar } from "./BulkSelectionToolbar";
import { UserDisplayName } from "@/components/vip/user-display-name";
import { fetchAdminUserIds, withoutAdmins } from "@/lib/admin/exclude-admins";
import { BulkGiftTab } from "./BulkGiftTab";
import { SchedulerQueueTab } from "@/components/admin-v3/scheduler/SchedulerQueueTab";
import { SchedulerHistoryTab } from "@/components/admin-v3/scheduler/SchedulerHistoryTab";
import { CalendarClock, History } from "lucide-react";

type Row = {
  id: string;
  username: string;
  full_name: string | null;
  avatar: string | null;
  bio: string | null;
  province: string | null;
  gender: string | null;
  is_banned: boolean | null;
  created_at: string | null;
  followers?: number | null;
  following?: number | null;
  posts?: number | null;
  messages?: number | null;
  unread?: number | null;
  gem_balance?: number | null;
};

const sb = supabase as any;
const PAGE = 20;

/**
 * Tạo 1 tài khoản thứ hai = USER THẬT (auth.users + profiles).
 * RPC duy nhất: admin_signup_account(p_row jsonb).
 * Migration: docs/sql/2026-08-02_SECOND_ACCOUNTS_FINAL.sql
 */
async function rpcCreateInternalAccount(row: Record<string, any>) {
  const { data, error } = await sb.rpc("admin_signup_account", { p_row: row });
  if (error) throw error;
  if (data && data.ok === false) throw new Error(data.error || "Tạo thất bại");
}



// -------------------- Password vault (local, máy admin) --------------------
const VAULT_KEY = "fwb_internal_account_pw_v1";
function readVault(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(VAULT_KEY) || "{}") || {}; } catch { return {}; }
}
function rememberPassword(username: string, password: string) {
  try {
    const v = readVault();
    v[username.toLowerCase()] = password;
    localStorage.setItem(VAULT_KEY, JSON.stringify(v));
  } catch { /* quota */ }
}

// -------------------- Random helpers --------------------
const PROVINCES = [
  "Hà Nội", "Hồ Chí Minh", "Đà Nẵng", "Hải Phòng", "Cần Thơ",
  "Bình Dương", "Đồng Nai", "Khánh Hòa", "Nghệ An", "Thanh Hóa",
  "Quảng Ninh", "Bắc Ninh", "Lâm Đồng", "Huế", "Vũng Tàu",
];
// -------------------- CSV helpers (no deps) --------------------
const CSV_HEADERS = [
  "UID","Username","Password","DisplayName","Gender","Region","CreatedAt",
  "Followers","Following","Posts","Messages",
] as const;
function toCsv(rows: Array<Record<string,string>>): string {
  const esc = (v: string) => `"${(v ?? "").replace(/"/g,'""')}"`;
  const head = CSV_HEADERS.join(",");
  const body = rows.map(r => CSV_HEADERS.map(h => esc(r[h] ?? "")).join(",")).join("\n");
  return head + "\n" + body;
}
function parseCsv(text: string): Array<Record<string,string>> {
  const lines = text.replace(/\r/g,"").split("\n").filter(l => l.trim().length);
  if (!lines.length) return [];
  const parseLine = (line: string): string[] => {
    const out: string[] = []; let cur = ""; let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) {
        if (c === '"' && line[i+1] === '"') { cur += '"'; i++; }
        else if (c === '"') q = false;
        else cur += c;
      } else {
        if (c === ',') { out.push(cur); cur = ""; }
        else if (c === '"') q = true;
        else cur += c;
      }
    }
    out.push(cur); return out;
  };
  const header = parseLine(lines[0]).map(h => h.trim());
  return lines.slice(1).map(l => {
    const cells = parseLine(l);
    const obj: Record<string,string> = {};
    header.forEach((h,i) => { obj[h] = (cells[i] ?? "").trim(); });
    return obj;
  });
}
/** Đọc field theo nhiều tên (hỗ trợ cả CSV cũ lẫn CSV mới). */
function field(r: Record<string,string>, ...keys: string[]): string {
  for (const k of keys) {
    const hit = Object.keys(r).find((h) => h.toLowerCase() === k.toLowerCase());
    if (hit && r[hit]) return r[hit];
  }
  return "";
}
function downloadFile(name: string, content: string, mime = "text/csv;charset=utf-8") {
  const blob = new Blob(["\ufeff" + content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

type Tab = "list" | "messages" | "post" | "comments" | "notifs" | "gifts" | "queue" | "history";

// -------------------- Component --------------------
export function SecondAccountsManager() {
  const [tab, setTab] = useState<Tab>("list");
  const [rows, setRows] = useState<Row[]>([]);
  const [allAccounts, setAllAccounts] = useState<AccountLite[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [notifUnread, setNotifUnread] = useState(0);
  const [page, setPage] = useState(0);
  const [q, setQ] = useState("");
  const [genderFilter, setGenderFilter] = useState<"" | "male" | "female">("");
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showDeleteAll, setShowDeleteAll] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  // Sort Kẹo: null (default) -> "desc" -> "asc" -> null
  const [gemSort, setGemSort] = useState<null | "desc" | "asc">(null);
  const lastClickedIdxRef = useRef<number | null>(null);
  const dragStateRef = useRef<{ anchor: number; base: Set<string>; mode: "add" | "remove" } | null>(null);

  const fetchAll = useCallback(async (): Promise<Row[]> => {
    const { data, error } = await sb.rpc("admin_list_internal_accounts", {
      p_search: q.trim() || null, p_limit: 10000, p_offset: 0, p_gender: genderFilter || null,
    });
    if (error) throw error;
    // Ẩn tài khoản Admin khỏi danh sách clone.
    const adminIds = await fetchAdminUserIds();
    return withoutAdmins((data ?? []) as Row[], adminIds);
  }, [q, genderFilter]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (gemSort) {
        const all = await fetchAll();
        const sorted = [...all].sort((a, b) => {
          const av = Number(a.gem_balance ?? 0), bv = Number(b.gem_balance ?? 0);
          return gemSort === "desc" ? bv - av : av - bv;
        });
        setTotal(sorted.length);
        setRows(sorted.slice(page * PAGE, (page + 1) * PAGE));
      } else {
        const all = await fetchAll();
        setTotal(all.length);
        setRows(all.slice(page * PAGE, (page + 1) * PAGE));
      }

      const all2 = await fetchAll();
      setAllAccounts(all2.map((a) => ({
        id: a.id, username: a.username, full_name: a.full_name, avatar: a.avatar, unread: Number(a.unread ?? 0),
      })));
      const { data: u } = await sb.rpc("admin_internal_unread_total");
      setUnreadTotal(Number(u ?? 0));
    } catch (e: any) {
      toast.error(e?.message || "Không tải được danh sách");
    } finally { setLoading(false); }
  }, [q, page, genderFilter, gemSort, fetchAll]);


  useEffect(() => { load(); }, [load]);

  // Badge đỏ realtime: tin nhắn chưa đọc + thông báo (bình luận / trả lời) chưa đọc.
  const refreshBadges = useCallback(async () => {
    try {
      const { data: u } = await sb.rpc("admin_internal_unread_total");
      setUnreadTotal(Number(u ?? 0));
    } catch { /* noop */ }
    try {
      const ids = allAccounts.map((a) => a.id);
      if (!ids.length) { setNotifUnread(0); return; }
      const clearedAt = getNotifClearedAt(null);
      let query = sb
        .from("notifications")
        .select("id")
        .in("user_id", ids)
        .in("type", ["comment", "comment_reply"])
        .eq("is_read", false)
        .limit(5000);
      if (clearedAt) query = query.gt("created_at", new Date(clearedAt).toISOString());
      const { data, error } = await query;
      if (error) throw error;
      setNotifUnread((data ?? []).length);
    } catch { /* RLS có thể chặn — không làm ồn UI */ }
  }, [allAccounts]);

  useEffect(() => { void refreshBadges(); }, [refreshBadges]);

  // Khi admin bấm "Xóa tất cả thông báo" → badge về 0 ngay, không cần F5.
  useEffect(() => {
    const onCleared = () => { setNotifUnread(0); void refreshBadges(); };
    window.addEventListener("admin-notif-cleared", onCleared as EventListener);
    return () => window.removeEventListener("admin-notif-cleared", onCleared as EventListener);
  }, [refreshBadges]);

  useRealtime(
    "admin-second-accounts-badges",
    useMemo(() => [
      { table: "messages" as const, event: "*" as const },
      { table: "notifications" as const, event: "*" as const },
    ], []),
    useCallback(() => { void refreshBadges(); }, [refreshBadges]),
  );

  useEffect(() => {
    const up = () => { dragStateRef.current = null; };
    window.addEventListener("mouseup", up);
    window.addEventListener("touchend", up);
    return () => { window.removeEventListener("mouseup", up); window.removeEventListener("touchend", up); };
  }, []);

  const pageCount = Math.max(1, Math.ceil(total / PAGE));
  const selectedAccounts = useMemo(
    () => allAccounts.filter((a) => selected.includes(a.id)),
    [allAccounts, selected],
  );
  const tabAccounts = selectedAccounts.length ? selectedAccounts : allAccounts;
  const allOnPageSelected = rows.length > 0 && rows.every((r) => selected.includes(r.id));

  /** Áp dải chọn anchor..idx lên tập nền (base) — dùng cho cả vuốt lên và vuốt xuống. */
  const applyRange = useCallback((anchor: number, idx: number, base: Set<string>, mode: "add" | "remove") => {
    const from = Math.min(anchor, idx);
    const to = Math.max(anchor, idx);
    const next = new Set(base);
    for (let i = from; i <= to; i++) {
      const row = rows[i];
      if (!row) continue;
      if (mode === "remove") next.delete(row.id);
      else next.add(row.id);
    }
    setSelected(Array.from(next));
  }, [rows]);

  function onRowMouseDown(id: string, index: number, e: React.MouseEvent) {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    // Nút thao tác + link tự xử lý; checkbox thì cho phép quét chọn luôn.
    if (target.closest("button, a, select, textarea")) return;
    e.preventDefault();

    const ctrl = e.ctrlKey || e.metaKey;
    const current = new Set(selected);

    if (e.shiftKey && lastClickedIdxRef.current != null) {
      // Shift: chọn từ A tới B (giữ nguyên các lựa chọn cũ).
      const base = ctrl ? current : new Set<string>();
      applyRange(lastClickedIdxRef.current, index, base, "add");
      dragStateRef.current = { anchor: lastClickedIdxRef.current, base, mode: "add" };
      return;
    }

    if (ctrl) {
      // Ctrl: cộng thêm / bỏ bớt, kéo tiếp vẫn giữ lựa chọn cũ.
      const mode: "add" | "remove" = current.has(id) ? "remove" : "add";
      applyRange(index, index, current, mode);
      dragStateRef.current = { anchor: index, base: current, mode };
      lastClickedIdxRef.current = index;
      return;
    }

    // Bấm thường: bắt đầu quét chọn mới từ dòng này.
    const base = new Set<string>();
    applyRange(index, index, base, "add");
    dragStateRef.current = { anchor: index, base, mode: "add" };
    lastClickedIdxRef.current = index;
  }

  function onRowMouseEnter(_id: string, index: number) {
    const st = dragStateRef.current;
    if (!st) return;
    applyRange(st.anchor, index, st.base, st.mode);
  }


  function toggleAllOnPage() {
    setSelected((s) => allOnPageSelected
      ? s.filter((id) => !rows.some((r) => r.id === id))
      : Array.from(new Set([...s, ...rows.map((r) => r.id)])));
  }

  function cycleGemSort() {
    setGemSort((s) => s === null ? "desc" : s === "desc" ? "asc" : null);
    setPage(0);
  }

  /** Cập nhật 1 dòng tại chỗ — không đổi thứ tự, giữ scroll & selection. */
  function patchRow(id: string, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => r.id === id ? { ...r, ...patch } : r));
  }

  async function toggleLock(row: Row) {
    setBusy(true);
    try {
      const locked = !row.is_banned;
      const { error } = await sb.rpc("admin_lock_internal_account", { p_id: row.id, p_locked: locked });
      if (error) throw error;
      toast.success(locked ? "Đã khóa" : "Đã mở khóa");
      load();
    } catch (e: any) { toast.error(e?.message || "Lỗi"); }
    finally { setBusy(false); }
  }
  async function remove(row: Row) {
    if (!confirm(`Xóa tài khoản @${row.username}?`)) return;
    setBusy(true);
    try {
      const { error } = await sb.rpc("admin_delete_internal_account", { p_id: row.id });
      if (error) throw error;
      toast.success("Đã xóa");
      setSelected((s) => s.filter((x) => x !== row.id));
      load();
    } catch (e: any) { toast.error(e?.message || "Lỗi"); }
    finally { setBusy(false); }
  }

  /** Khóa / mở khóa CHỈ các dòng đã tick. */
  async function bulkLock(locked: boolean) {
    if (!selected.length) { toast.error("Chưa chọn tài khoản nào"); return; }
    setBusy(true);
    try {
      const { data, error } = await sb.rpc("admin_bulk_lock_internal_accounts", {
        p_ids: selected, p_locked: locked,
      });
      if (error) throw error;
      toast.success(`${locked ? "Đã khóa" : "Đã mở khóa"} ${data ?? 0} tài khoản`);
      load();
    } catch (e: any) { toast.error(e?.message || "Lỗi"); }
    finally { setBusy(false); }
  }

  /** Xóa CHỈ các dòng đã tick — KHÔNG dùng Delete All. */
  async function bulkDelete() {
    if (!selected.length) { toast.error("Chưa chọn tài khoản nào"); return; }
    if (!confirm(`Xóa ${selected.length} tài khoản đã chọn? Không thể hoàn tác.`)) return;
    setBusy(true);
    try {
      const ids = [...selected];
      const { data, error } = await sb.rpc("admin_delete_internal_accounts", { p_ids: ids });
      if (error) throw error;
      toast.success(`Đã xóa ${data ?? 0} tài khoản`);
      setSelected([]);
      load();
    } catch (e: any) { toast.error(e?.message || "Lỗi"); }
    finally { setBusy(false); }
  }


  async function handleExport() {
    try {
      const all = await fetchAll();
      const list = selected.length ? all.filter((r) => selected.includes(r.id)) : all;
      if (!list.length) { toast.error("Không có tài khoản để xuất"); return; }
      const vault = readVault();
      const csv = toCsv(list.map((r) => ({
        UID: r.id,
        Username: r.username || "",
        Password: vault[(r.username || "").toLowerCase()] || "",
        DisplayName: r.full_name || "",
        Gender: r.gender || "",
        Region: r.province || "",
        CreatedAt: r.created_at || "",
        Followers: String(r.followers ?? 0),
        Following: String(r.following ?? 0),
        Posts: String(r.posts ?? 0),
        Messages: String(r.messages ?? 0),
      })));
      downloadFile(`second-accounts-${new Date().toISOString().slice(0,10)}.csv`, csv);
      toast.success(`Đã xuất ${list.length} tài khoản`);
    } catch (e: any) { toast.error(e?.message || "Xuất thất bại"); }
  }

  async function handleImportFile(file: File) {
    setBusy(true);
    try {
      const text = await file.text();
      const raw = parseCsv(text);
      const items = raw
        .map((r) => ({
          username: field(r, "Username", "username"),
          password: field(r, "Password", "password"),
          full_name: field(r, "DisplayName", "full_name"),
          avatar_url: field(r, "Avatar", "avatar_url"),
          bio: field(r, "Bio", "bio"),
          province: field(r, "Region", "province"),
          gender: field(r, "Gender", "gender"),
        }))
        .filter((r) => r.username && r.password);
      if (!items.length) { toast.error("File không có dòng hợp lệ (cần Username + Password)"); return; }
      let ok = 0; const errors: string[] = [];
      for (const r of items) {
        try {
          await rpcCreateInternalAccount({
            username: r.username,
            password: r.password,
            full_name: r.full_name || null,
            avatar_url: r.avatar_url || null,
            bio: r.bio || null,
            province: r.province || null,
            gender: r.gender || null,
          });

          rememberPassword(r.username, r.password);
          ok++;
        } catch (e: any) { errors.push(`@${r.username}: ${e?.message || "lỗi"}`); }
      }
      if (ok) toast.success(`Đã nhập ${ok}/${items.length} tài khoản`);
      if (errors.length) toast.error(errors.slice(0, 5).join(" | "));
      setPage(0); load();
    } catch (e: any) { toast.error(e?.message || "Nhập thất bại"); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  return (
    <div className="admv3-page">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <div className="text-lg font-semibold flex items-center gap-2"><Users size={18}/> Tài khoản thứ hai</div>
          <div className="text-xs text-muted-foreground">
            Chỉ Bang Chủ/Super Admin • {total} tài khoản{selected.length ? ` • đã chọn ${selected.length}` : ""}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-3 flex-wrap">
        <TabBtn active={tab==="list"} onClick={()=>setTab("list")} icon={<Users size={14}/>} label="Danh sách"/>
        <TabBtn active={tab==="messages"} onClick={()=>setTab("messages")} icon={<MessageSquare size={14}/>} label="Tin nhắn" badge={unreadTotal}/>
        <TabBtn active={tab==="post"} onClick={()=>setTab("post")} icon={<FileText size={14}/>} label="Đăng bài"/>
        <TabBtn active={tab==="comments"} onClick={()=>setTab("comments")} icon={<MessagesSquare size={14}/>} label="Bình luận hàng loạt"/>
        <TabBtn active={tab==="notifs"} onClick={()=>setTab("notifs")} icon={<Bell size={14}/>} label="Thông báo" badge={notifUnread}/>
        <TabBtn active={tab==="gifts"} onClick={()=>setTab("gifts")} icon={<Gift size={14}/>} label="Tặng quà hàng loạt"/>
        <TabBtn active={tab==="queue"} onClick={()=>setTab("queue")} icon={<CalendarClock size={14}/>} label="Hàng đợi"/>
        <TabBtn active={tab==="history"} onClick={()=>setTab("history")} icon={<History size={14}/>} label="Lịch sử"/>
      </div>

      {tab === "messages" && <MessagesTab accounts={tabAccounts} />}
      {tab === "post" && <PostTab accounts={tabAccounts} />}
      {tab === "comments" && <BulkCommentTab accounts={tabAccounts} />}
      {tab === "notifs" && <CloneNotificationsTab accounts={allAccounts} />}
      {tab === "gifts" && <BulkGiftTab preselected={selected} />}
      {tab === "queue" && <SchedulerQueueTab accounts={allAccounts} />}
      {tab === "history" && <SchedulerHistoryTab />}



      {tab === "list" && (
        <>
          <div className="flex items-center gap-2 flex-wrap mb-3 justify-end">
            <div className="relative mr-auto">
              <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 opacity-60"/>
              <input
                value={q}
                onChange={(e)=>{ setQ(e.target.value); setPage(0); }}
                placeholder="Tìm username / tên / khu vực…"
                className="pl-7 pr-3 py-1.5 rounded-md border bg-background text-sm w-64"
              />
            </div>
            {/* Bộ lọc giới tính */}
            <div className="inline-flex rounded-md border overflow-hidden">
              {([["", "Tất cả"], ["male", "Nam"], ["female", "Nữ"]] as const).map(([v, label]) => (
                <button
                  key={v || "all"}
                  onClick={() => { setGenderFilter(v as "" | "male" | "female"); setPage(0); }}
                  className={`px-3 py-1.5 text-sm ${genderFilter === v ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button className="admv3-btn admv3-btn-ghost" onClick={load} disabled={loading}>
              <RefreshCw size={14} className={loading ? "animate-spin" : ""}/> Tải lại
            </button>
            <button className="admv3-btn admv3-btn-ghost" onClick={()=>fileRef.current?.click()}>
              <Upload size={14}/> Nhập CSV
            </button>
            <input ref={fileRef} type="file" accept=".csv,text/csv" hidden
              onChange={(e)=>{ const f = e.target.files?.[0]; if (f) handleImportFile(f); }}/>
            <button className="admv3-btn admv3-btn-ghost text-red-500" onClick={()=>setShowDeleteAll(true)}>
              <Trash2 size={14}/> Xóa tất cả
            </button>
            <button className="admv3-btn" onClick={()=>setShowCreate(true)}>
              <Plus size={14}/> Tạo mới
            </button>
          </div>

          {/* Thanh thao tác hàng loạt — chỉ tác động tới các dòng đã chọn */}
          <BulkSelectionToolbar
            targets={rows.filter((r) => selected.includes(r.id)).map((r) => ({ id: r.id, username: r.username, full_name: r.full_name }))}
            busy={busy}
            provinces={PROVINCES as unknown as string[]}
            onOpenTab={(t) => setTab(t)}
            onClear={() => setSelected([])}
            onLock={() => bulkLock(true)}
            onUnlock={() => bulkLock(false)}
            onDelete={bulkDelete}
            onApplied={load}
          />
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <span className="text-xs text-muted-foreground">Đã chọn <b>{selected.length}</b> tài khoản</span>
            <button className="admv3-btn admv3-btn-ghost" disabled={!selected.length} onClick={handleExport}>
              <Download size={14}/> Xuất đã chọn
            </button>
          </div>

          <div className="admv3-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground border-b">
                <tr>
                  <th className="px-3 py-2 w-8">
                    <input type="checkbox" checked={allOnPageSelected} onChange={toggleAllOnPage}/>
                  </th>
                  <th className="text-left px-3 py-2">Tài khoản</th>
                  <th className="text-left px-3 py-2">Khu vực</th>
                  <th className="text-left px-3 py-2">Giới tính</th>
                  <th className="text-left px-3 py-2">FL / FLW / Bài</th>
                  <th className="text-left px-3 py-2">Tin nhắn</th>
                  <th className="text-left px-3 py-2">
                    <button
                      type="button"
                      onClick={cycleGemSort}
                      className="inline-flex items-center gap-1 uppercase text-xs font-semibold hover:text-foreground transition-colors"
                      title="Sắp xếp theo Kẹo"
                    >
                      Kẹo
                      <span aria-hidden="true" className="text-[10px] leading-none opacity-80">
                        {gemSort === "desc" ? "▼" : gemSort === "asc" ? "▲" : "⇅"}
                      </span>
                    </button>
                  </th>
                  <th className="text-left px-3 py-2">Trạng thái</th>
                  <th className="text-left px-3 py-2">Tạo lúc</th>
                  <th className="text-right px-3 py-2">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => (
                  <tr
                    key={r.id}
                    className={`border-b hover:bg-muted/30 select-none ${selected.includes(r.id) ? "bg-primary/5" : ""}`}
                    onMouseDown={(e) => onRowMouseDown(r.id, idx, e)}
                    onMouseEnter={() => onRowMouseEnter(r.id, idx)}
                  >
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selected.includes(r.id)}
                        onChange={() => {
                          setSelected((s) => s.includes(r.id) ? s.filter((x) => x !== r.id) : [...s, r.id]);
                          lastClickedIdxRef.current = idx;
                        }}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        {r.avatar
                          ? <img loading="lazy" decoding="async" src={avatarSrc(r.avatar, 64)} alt="" className="w-8 h-8 rounded-full object-cover"/>
                          : <div className="w-8 h-8 rounded-full bg-muted grid place-items-center text-xs">{r.username?.[0]?.toUpperCase()}</div>}
                        <div>
                          <UserDisplayName
                            userId={r.id}
                            name={r.full_name || r.username}
                            nameClassName="font-medium"
                            as="div"
                          />
                          <div className="text-xs text-muted-foreground">@{r.username}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2">{r.province || "—"}</td>
                    <td className="px-3 py-2">{r.gender === "male" ? "Nam" : r.gender === "female" ? "Nữ" : "—"}</td>
                    <td className="px-3 py-2 text-xs">{r.followers ?? 0} / {r.following ?? 0} / {r.posts ?? 0}</td>
                    <td className="px-3 py-2 text-xs">
                      {r.messages ?? 0}
                      {Number(r.unread ?? 0) > 0 && (
                        <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-red-500 text-white">{r.unread}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs font-semibold tabular-nums">
                      {Number(r.gem_balance ?? 0).toLocaleString("vi-VN")}
                    </td>
                    <td className="px-3 py-2">
                      {r.is_banned
                        ? <span className="text-xs px-2 py-0.5 rounded bg-red-500/15 text-red-500">Đã khóa</span>
                        : <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-600">Hoạt động</span>}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {r.created_at ? new Date(r.created_at).toLocaleString() : "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="inline-flex gap-1">
                        <button className="admv3-btn admv3-btn-ghost admv3-btn-icon" title="Sửa" onClick={()=>setEditing(r)}><Pencil size={14}/></button>
                        <button className="admv3-btn admv3-btn-ghost admv3-btn-icon" title={r.is_banned?"Mở khóa":"Khóa"} disabled={busy} onClick={()=>toggleLock(r)}>
                          {r.is_banned ? <Unlock size={14}/> : <Lock size={14}/>}
                        </button>
                        <button className="admv3-btn admv3-btn-ghost admv3-btn-icon" title="Xóa" disabled={busy} onClick={()=>remove(r)}><Trash2 size={14}/></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!rows.length && !loading && (
                  <tr><td colSpan={10} className="px-3 py-8 text-center text-muted-foreground text-sm">Chưa có tài khoản nào</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between mt-3 text-sm">
            <div className="text-xs text-muted-foreground">Trang {page + 1}/{pageCount}</div>
            <div className="flex gap-1">
              <button className="admv3-btn admv3-btn-ghost" disabled={page===0} onClick={()=>setPage(p=>Math.max(0,p-1))}>Trước</button>
              <button className="admv3-btn admv3-btn-ghost" disabled={page+1>=pageCount} onClick={()=>setPage(p=>p+1)}>Sau</button>
            </div>
          </div>
        </>
      )}

      {showCreate && <BulkAccountCreator onClose={()=>setShowCreate(false)} onDone={()=>{ setPage(0); load(); }}/>}
      {editing && (
        <EditModal
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={(patch) => {
            // Cập nhật tại chỗ — không reload, không đổi vị trí, không mất scroll/selection.
            patchRow(editing.id, patch);
            setEditing(null);
          }}
        />
      )}
      {showDeleteAll && <DeleteAllModal onClose={()=>setShowDeleteAll(false)} onDone={()=>{ setShowDeleteAll(false); setSelected([]); setPage(0); load(); }}/>}
    </div>
  );
}

function TabBtn({ active, onClick, icon, label, badge }: {
  active: boolean; onClick: ()=>void; icon: React.ReactNode; label: string; badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`admv3-btn ${active ? "" : "admv3-btn-ghost"} relative`}
    >
      {icon} {label}
      {!!badge && badge > 0 && (
        <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-red-500 text-white">{badge}</span>
      )}
    </button>
  );
}

// -------------------- Edit Modal --------------------
function EditModal({ row, onClose, onSaved }: { row: Row; onClose: ()=>void; onSaved: (patch: Partial<Row>)=>void }) {
  const [username, setUsername] = useState(row.username);
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState(row.full_name || "");
  const [avatar, setAvatar] = useState(row.avatar || "");
  const [bio, setBio] = useState(row.bio || "");
  const [province, setProvince] = useState(row.province || "");
  const [gender, setGender] = useState<string>(row.gender || "");
  const [followers, setFollowers] = useState<string>(String(row.followers ?? 0));
  const [following, setFollowing] = useState<string>(String(row.following ?? 0));
  const [posts, setPosts] = useState<string>(String(row.posts ?? 0));
  const [gemBalance, setGemBalance] = useState<string>(String(row.gem_balance ?? 0));
  const [createdAt, setCreatedAt] = useState<string>(
    row.created_at ? new Date(row.created_at).toISOString().slice(0,16) : "",
  );
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const { error } = await sb.rpc("admin_update_internal_account", {
        p_id: row.id,
        p_username: username !== row.username ? username : null,
        p_password: password || null,
        p_avatar_url: avatar !== (row.avatar || "") ? (avatar || null) : null,
        p_bio: bio !== (row.bio || "") ? bio : null,
        p_province: province !== (row.province || "") ? province : null,
        p_full_name: fullName !== (row.full_name || "") ? fullName : null,
        p_gender: gender !== (row.gender || "") ? gender : null,
      });
      if (error) throw error;

      const { error: sErr } = await sb.rpc("admin_set_internal_account_stats", {
        p_id: row.id,
        p_followers: followers === "" ? null : Number(followers),
        p_following: following === "" ? null : Number(following),
        p_posts: posts === "" ? null : Number(posts),
        p_created_at: createdAt ? new Date(createdAt).toISOString() : null,
        p_gender: gender || null,
        p_province: province || null,
      });
      if (sErr) throw sErr;

      // Số tiền / Kẹo — lưu trực tiếp vào profiles.gem_balance
      const nextGem = gemBalance === "" ? 0 : Math.max(0, Math.floor(Number(gemBalance) || 0));
      if (nextGem !== Number(row.gem_balance ?? 0)) {
        const { error: gErr } = await sb.rpc("admin_set_internal_account_gem", {
          p_id: row.id, p_gem: nextGem,
        });
        if (gErr) throw gErr;
      }

      if (password) rememberPassword(username, password);
      toast.success("Đã cập nhật");
      onSaved({
        username,
        full_name: fullName || null,
        avatar: avatar || null,
        bio: bio || null,
        province: province || null,
        gender: gender || null,
        followers: followers === "" ? row.followers : Number(followers),
        following: following === "" ? row.following : Number(following),
        posts: posts === "" ? row.posts : Number(posts),
        gem_balance: nextGem,
        created_at: createdAt ? new Date(createdAt).toISOString() : row.created_at,
      });
    } catch (e: any) { toast.error(e?.message || "Lỗi"); }
    finally { setBusy(false); }
  }

  return (
    <ModalShell title={`Sửa @${row.username}`} onClose={onClose}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Username"><input className="admv3-input" value={username} onChange={e=>setUsername(e.target.value)}/></Field>
        <Field label="Password mới (bỏ trống nếu không đổi)"><input className="admv3-input" value={password} onChange={e=>setPassword(e.target.value)} placeholder="≥ 6 ký tự"/></Field>
        <Field label="Tên hiển thị"><input className="admv3-input" value={fullName} onChange={e=>setFullName(e.target.value)}/></Field>
        <Field label="Avatar URL"><input className="admv3-input" value={avatar} onChange={e=>setAvatar(e.target.value)}/></Field>
        <Field label="Khu vực">
          <select className="admv3-input" value={province} onChange={e=>setProvince(e.target.value)}>
            <option value="">—</option>
            {PROVINCES.map(p=><option key={p} value={p}>{p}</option>)}
          </select>
        </Field>
        <Field label="Giới tính">
          <select className="admv3-input" value={gender} onChange={e=>setGender(e.target.value)}>
            <option value="">—</option>
            <option value="male">Nam</option>
            <option value="female">Nữ</option>
          </select>
        </Field>
        <Field label="Người yêu thích (Followers)">
          <input type="number" min={0} className="admv3-input" value={followers} onChange={e=>setFollowers(e.target.value)}/>
        </Field>
        <Field label="Đã yêu thích (Following)">
          <input type="number" min={0} className="admv3-input" value={following} onChange={e=>setFollowing(e.target.value)}/>
        </Field>
        <Field label="Số bài viết">
          <input type="number" min={0} className="admv3-input" value={posts} onChange={e=>setPosts(e.target.value)}/>
        </Field>
        <Field label="Thời gian tạo">
          <input type="datetime-local" className="admv3-input" value={createdAt} onChange={e=>setCreatedAt(e.target.value)}/>
        </Field>
        <Field label="Số tiền / Kẹo (gem_balance)">
          <input type="number" min={0} step={1} className="admv3-input"
            value={gemBalance} onChange={e=>setGemBalance(e.target.value)} placeholder="0"/>
        </Field>
        <Field label="Bio" className="md:col-span-2">
          <textarea className="admv3-input" rows={2} value={bio} onChange={e=>setBio(e.target.value)}/>
        </Field>
      </div>
      <div className="mt-3">
        <ProfileStickerPicker userId={row.id} />
      </div>
      <div className="text-[11px] text-muted-foreground mt-2">
        Followers/Following/Số bài chỉ ghi đè khi database có cột đếm tương ứng; nếu không, hệ thống vẫn hiển thị số thực tế.
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <button className="admv3-btn admv3-btn-ghost" onClick={onClose} disabled={busy}>Hủy</button>
        <button className="admv3-btn" onClick={save} disabled={busy}><Save size={14}/> Lưu</button>
      </div>
    </ModalShell>
  );
}

// -------------------- Delete All Modal --------------------
function DeleteAllModal({ onClose, onDone }: { onClose: ()=>void; onDone: ()=>void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const valid = text.trim().toUpperCase() === "DELETE ALL";

  async function run() {
    if (!valid) return;
    setBusy(true);
    try {
      const { data, error } = await sb.rpc("admin_delete_all_internal_accounts", { p_confirm: "DELETE ALL" });
      if (error) throw error;
      toast.success(`Đã xóa ${data ?? 0} tài khoản`);
      onDone();
    } catch (e: any) { toast.error(e?.message || "Xóa thất bại"); }
    finally { setBusy(false); }
  }

  return (
    <ModalShell title="Xóa toàn bộ tài khoản thứ hai" onClose={onClose}>
      <p className="text-sm text-red-500 mb-3">
        Hành động này xóa vĩnh viễn TẤT CẢ tài khoản thứ hai. Không thể hoàn tác.
      </p>
      <Field label={`Gõ chính xác "DELETE ALL" để xác nhận`}>
        <input className="admv3-input" value={text} onChange={e=>setText(e.target.value)} placeholder="DELETE ALL"/>
      </Field>
      <div className="flex justify-end gap-2 mt-4">
        <button className="admv3-btn admv3-btn-ghost" onClick={onClose} disabled={busy}>Hủy</button>
        <button className="admv3-btn text-red-500" onClick={run} disabled={!valid || busy}>
          <Trash2 size={14}/> {busy ? "Đang xóa…" : "Xóa tất cả"}
        </button>
      </div>
    </ModalShell>
  );
}

// -------------------- Small primitives --------------------
function ModalShell({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: ()=>void }) {
  return (
    <div className="fixed inset-0 z-[70] bg-black/50 grid place-items-center p-4" onClick={onClose}>
      <div className="bg-background rounded-xl border shadow-xl w-full max-w-2xl max-h-[90vh] overflow-auto" onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b">
          <div className="font-semibold">{title}</div>
          <button onClick={onClose} className="admv3-btn admv3-btn-ghost admv3-btn-icon"><X size={16}/></button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className||""}`}>
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      {children}
    </label>
  );
}
