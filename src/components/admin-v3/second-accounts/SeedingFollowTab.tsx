/**
 * Tab "Theo dõi – Seeding" trong khu Tài khoản thứ hai.
 *
 * Chọn USER THẬT (RPC admin_internal_real_users — đã loại clone/seed/admin)
 * + chọn CLONE, rồi cho clone theo dõi user. Dùng lại follow + notification
 * hiện có; chỉ log thêm ở Supabase #4.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Heart, RefreshCw, Search, UserPlus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { avatarSrc } from "@/lib/image-cdn";
import { seedFollow, fetchSeedFollowLogs, type SeedFollowLog } from "@/lib/admin/seeding-follow";
import type { AccountLite } from "./InternalTools";

const sb = supabase as any;

type RealUser = {
  id: string;
  username: string;
  full_name: string | null;
  avatar: string | null;
  created_at: string | null;
};

type Range = "today" | "7d" | "all";

const RANGES: Array<{ key: Range; label: string }> = [
  { key: "today", label: "Tài khoản mới hôm nay" },
  { key: "7d", label: "Tài khoản trong 1 tuần" },
  { key: "all", label: "Tất cả" },
];

function sinceOf(range: Range): string | null {
  const now = new Date();
  if (range === "all") return null;
  if (range === "today") {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  }
  return new Date(now.getTime() - 7 * 86400000).toISOString();
}

const PAGE = 20;

export function SeedingFollowTab({ accounts }: { accounts: AccountLite[] }) {
  const [users, setUsers] = useState<RealUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [range, setRange] = useState<Range>("today");
  const [page, setPage] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [cloneQ, setCloneQ] = useState("");
  const [cloneId, setCloneId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [logs, setLogs] = useState<SeedFollowLog[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await sb.rpc("admin_internal_real_users", {
        p_search: q.trim() || null,
        p_since: sinceOf(range),
        p_limit: 300,
      });
      if (error) throw error;
      setUsers((data ?? []) as RealUser[]);
      setPage(0);
    } catch (e: any) {
      toast.error(e?.message || "Không tải được danh sách user thật");
    } finally {
      setLoading(false);
    }
  }, [q, range]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const loadLogs = useCallback(async () => setLogs(await fetchSeedFollowLogs(20)), []);
  useEffect(() => { void loadLogs(); }, [loadLogs]);

  const clones = useMemo(() => {
    const term = cloneQ.trim().toLowerCase();
    if (!term) return accounts;
    return accounts.filter(
      (a) =>
        a.username.toLowerCase().includes(term) ||
        (a.full_name || "").toLowerCase().includes(term),
    );
  }, [accounts, cloneQ]);

  const pageUsers = users.slice(page * PAGE, page * PAGE + PAGE);
  const pages = Math.max(1, Math.ceil(users.length / PAGE));

  const user = users.find((u) => u.id === userId) || null;
  const clone = accounts.find((a) => a.id === cloneId) || null;

  async function run() {
    if (!clone) return toast.error("Chọn 1 tài khoản thứ hai");
    if (!user) return toast.error("Chọn 1 người dùng thật");
    setBusy(true);
    try {
      const r = await seedFollow({
        cloneId: clone.id,
        cloneUsername: clone.username,
        targetId: user.id,
        targetUsername: user.username,
      });
      if (!r.ok) throw new Error(r.error || "Thất bại");
      void loadLogs();
    } catch (e: any) {
      toast.error(e?.message || "Không thực hiện được");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* Bộ lọc user thật */}
      <div className="rounded-xl border bg-card p-3">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold">
          <UserPlus size={14} /> Chọn người dùng (user thật)
        </div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={`rounded-full border px-3 py-1 text-[11px] font-medium transition ${
                range === r.key ? "bg-primary text-primary-foreground" : "hover:bg-muted"
              }`}
            >
              {r.label}
            </button>
          ))}
          <div className="relative ml-auto">
            <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 opacity-50" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Tìm user…"
              className="h-7 w-44 rounded-full border bg-background pl-7 pr-2 text-xs outline-none"
            />
          </div>
          <button onClick={() => void load()} className="rounded-full border p-1.5 hover:bg-muted" aria-label="Tải lại">
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          </button>
        </div>

        <div className="max-h-64 overflow-auto rounded-lg border">
          {pageUsers.length === 0 ? (
            <div className="p-4 text-center text-xs text-muted-foreground">
              {loading ? "Đang tải…" : "Không có user phù hợp."}
            </div>
          ) : (
            pageUsers.map((u) => (
              <button
                key={u.id}
                onClick={() => setUserId(u.id)}
                className={`flex w-full items-center gap-2 border-b px-3 py-2 text-left last:border-0 ${
                  userId === u.id ? "bg-primary/10" : "hover:bg-muted/60"
                }`}
              >
                <img
                  src={avatarSrc(u.avatar || "", 48)}
                  alt=""
                  loading="lazy"
                  className="h-7 w-7 shrink-0 rounded-full object-cover bg-muted"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold">{u.full_name || u.username}</span>
                  <span className="block truncate text-[10px] text-muted-foreground">
                    @{u.username}
                    {u.created_at ? ` · ${new Date(u.created_at).toLocaleDateString("vi-VN")}` : ""}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
        {pages > 1 && (
          <div className="mt-2 flex items-center justify-center gap-2 text-[11px]">
            <button disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="rounded border px-2 py-0.5 disabled:opacity-40">Trước</button>
            <span>{page + 1}/{pages}</span>
            <button disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)} className="rounded border px-2 py-0.5 disabled:opacity-40">Sau</button>
          </div>
        )}
      </div>

      {/* Chọn clone */}
      <div className="rounded-xl border bg-card p-3">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold">
          <Heart size={14} /> Chọn tài khoản thứ hai sẽ theo dõi
        </div>
        <div className="relative mb-2">
          <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 opacity-50" />
          <input
            value={cloneQ}
            onChange={(e) => setCloneQ(e.target.value)}
            placeholder="Tìm tài khoản thứ hai…"
            className="h-7 w-full rounded-full border bg-background pl-7 pr-2 text-xs outline-none"
          />
        </div>
        <div className="max-h-48 overflow-auto rounded-lg border">
          {clones.length === 0 ? (
            <div className="p-4 text-center text-xs text-muted-foreground">Không có tài khoản phù hợp.</div>
          ) : (
            clones.slice(0, 100).map((a) => (
              <button
                key={a.id}
                onClick={() => setCloneId(a.id)}
                className={`flex w-full items-center gap-2 border-b px-3 py-2 text-left last:border-0 ${
                  cloneId === a.id ? "bg-primary/10" : "hover:bg-muted/60"
                }`}
              >
                <img
                  src={avatarSrc(a.avatar || "", 48)}
                  alt=""
                  loading="lazy"
                  className="h-7 w-7 shrink-0 rounded-full object-cover bg-muted"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold">{a.full_name || a.username}</span>
                  <span className="block truncate text-[10px] text-muted-foreground">@{a.username}</span>
                </span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Hành động */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
        <div className="min-w-0 flex-1 text-[11px] text-muted-foreground">
          {clone && user
            ? <>« {clone.full_name || clone.username} » sẽ theo dõi « {user.full_name || user.username} »</>
            : "Chọn 1 user thật và 1 tài khoản thứ hai."}
        </div>
        <button
          onClick={() => void run()}
          disabled={busy || !clone || !user}
          className="rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-40"
        >
          {busy ? "Đang thực hiện…" : "Theo dõi ngay"}
        </button>
      </div>

      {/* Lịch sử */}
      {logs.length > 0 && (
        <div className="rounded-xl border bg-card p-3">
          <div className="mb-2 text-xs font-semibold">Lịch sử seeding gần đây</div>
          <ul className="space-y-1 text-[11px] text-muted-foreground">
            {logs.map((l) => (
              <li key={l.id} className="truncate">
                @{l.clone_username || l.clone_id.slice(0, 8)} → @{l.target_username || l.target_id.slice(0, 8)}
                {" · "}
                {new Date(l.created_at).toLocaleString("vi-VN")}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
