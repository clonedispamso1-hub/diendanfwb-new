import { avatarSrc } from "@/lib/image-cdn";
// src/components/bots/bot-assignments-panel.tsx
// Admin UI: assign real user accounts as bots.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Search, Trash2, UserPlus, X } from "lucide-react";
import {
  assignBot,
  checkSuperAdmin,
  listAssignments,
  removeAssignment,
  searchProfiles,
  updateAssignment,
  type BotAssignmentRow,
  type ProfileSlim,
} from "@/lib/bot-assignments";
import { BOT_TYPE_LABEL, RISK_COLOR, type BotType } from "@/lib/bot-system";
import { supabase } from "@/lib/supabase";
import { useRealtime } from "@/lib/realtime-registry";

const BOT_ROLES: BotType[] = [
  "engagement_bot",
  "spam_guard",
  "moderation_bot",
  "comment_guard",
  "register_guard",
  "risk_detection_bot",
];

export function BotAssignmentsPanel() {
  const [rows, setRows] = useState<BotAssignmentRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [isSuper, setIsSuper] = useState<boolean | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  async function load() {
    try {
      setRows(await listAssignments());
      setErr(null);
    } catch (e: any) {
      setErr(e.message ?? "Lỗi tải assignments");
    }
  }

  useEffect(() => {
    checkSuperAdmin().then(setIsSuper);
    load();
  }, []);

  useRealtime(
    "bot_assignments_rt",
    useMemo(() => [{ table: "bot_assignments" as const, event: "*" as const }], []),
    useCallback(() => { void load(); }, []),
  );

  if (err) return <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm">{err}</div>;
  if (!rows)
    return (
      <div className="flex items-center gap-2 p-6 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Đang tải…
      </div>
    );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">User Bot Assignments</h2>
          <p className="text-xs text-muted-foreground">
            Gán vai trò bot cho tài khoản người dùng thật. Chỉ super admin có quyền chỉnh sửa.
          </p>
        </div>
        <button
          disabled={!isSuper}
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 rounded-xl border border-white/10 bg-gradient-to-br from-purple-500/30 to-blue-500/30 px-3 py-2 text-sm font-medium backdrop-blur transition hover:from-purple-500/40 hover:to-blue-500/40 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <UserPlus className="h-4 w-4" /> Gán bot mới
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-sm text-muted-foreground">
          Chưa có user nào được gán bot. Hãy chạy migration{" "}
          <code>2026052000_bot_assignments.sql</code> rồi bấm <em>Gán bot mới</em>.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {rows.map((r) => (
            <AssignmentCard key={r.id} row={r} canEdit={!!isSuper} onChange={load} />
          ))}
        </div>
      )}

      <AnimatePresence>
        {showAdd && isSuper && (
          <AddAssignmentModal onClose={() => setShowAdd(false)} onCreated={load} />
        )}
      </AnimatePresence>
    </div>
  );
}

function AssignmentCard({
  row,
  canEdit,
  onChange,
}: {
  row: BotAssignmentRow;
  canEdit: boolean;
  onChange: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const p = row.profile;
  const risk = row.risk;
  const initial = (p?.display_name || p?.username || "?").slice(0, 1).toUpperCase();

  async function toggle() {
    if (!canEdit) return;
    setBusy(true);
    try {
      await updateAssignment(row.id, { enabled: !row.enabled });
      onChange();
    } finally {
      setBusy(false);
    }
  }
  async function changeRole(role: BotType) {
    if (!canEdit) return;
    setBusy(true);
    try {
      await updateAssignment(row.id, { bot_role: role });
      onChange();
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!canEdit) return;
    if (!confirm("Bỏ gán bot khỏi user này?")) return;
    setBusy(true);
    try {
      await removeAssignment(row.id);
      onChange();
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="group rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl transition hover:border-white/20"
    >
      <div className="flex items-center gap-3">
        <div className="relative">
          {p?.avatar_url ? (
            <img loading="lazy" decoding="async" src={avatarSrc(p.avatar_url, 64)} alt="" className="h-11 w-11 rounded-full object-cover ring-2 ring-white/10" />
          ) : (
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-blue-500 text-sm font-bold">
              {initial}
            </div>
          )}
          <span
            className={`absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full ring-2 ring-[#0a0b14] ${
              row.enabled ? "bg-emerald-400" : "bg-zinc-500"
            }`}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="truncate text-sm font-semibold">
              {p?.display_name || p?.username || row.user_id.slice(0, 8)}
            </div>
            {p?.is_admin && (
              <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-300">admin</span>
            )}
          </div>
          <div className="truncate text-xs text-muted-foreground">@{p?.username ?? "—"}</div>
        </div>
        <button
          disabled={!canEdit || busy}
          onClick={remove}
          aria-label="Xoá"
          className="rounded-lg p-1.5 text-muted-foreground opacity-0 transition hover:bg-red-500/20 hover:text-red-400 group-hover:opacity-100 disabled:opacity-30"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <select
          disabled={!canEdit || busy}
          value={row.bot_role}
          onChange={(e) => changeRole(e.target.value as BotType)}
          className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs focus:border-white/30 focus:outline-none"
        >
          {BOT_ROLES.map((r) => (
            <option key={r} value={r} className="bg-[#0a0b14]">
              {BOT_TYPE_LABEL[r]}
            </option>
          ))}
        </select>
        <button
          disabled={!canEdit || busy}
          onClick={toggle}
          className={`rounded-lg border px-2 py-1.5 text-xs font-medium transition ${
            row.enabled
              ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
              : "border-white/10 bg-white/5 text-muted-foreground"
          } disabled:opacity-40`}
        >
          {row.enabled ? "● Đang chạy" : "○ Tắt"}
        </button>
      </div>

      <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>
          Priority <b className="text-foreground">{row.priority_level}</b>
        </span>
        <span className={risk ? RISK_COLOR[risk.level] : ""}>
          Risk: {risk ? `${risk.level} (${risk.score})` : "low"}
        </span>
        <span>{row.last_action_at ? new Date(row.last_action_at).toLocaleTimeString() : "—"}</span>
      </div>
    </motion.div>
  );
}

function AddAssignmentModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ProfileSlim[]>([]);
  const [picked, setPicked] = useState<ProfileSlim | null>(null);
  const [role, setRole] = useState<BotType>("engagement_bot");
  const [priority, setPriority] = useState(5);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const debRef = useRef<number | null>(null);

  useEffect(() => {
    if (debRef.current) window.clearTimeout(debRef.current);
    if (!q.trim()) {
      setResults([]);
      return;
    }
    debRef.current = window.setTimeout(async () => {
      try {
        setResults(await searchProfiles(q));
      } catch (e: any) {
        setErr(e.message);
      }
    }, 250);
    return () => {
      if (debRef.current) window.clearTimeout(debRef.current);
    };
  }, [q]);

  async function submit() {
    if (!picked) return;
    setBusy(true);
    setErr(null);
    try {
      await assignBot({ user_id: picked.id, bot_role: role, priority_level: priority, enabled: true });
      onCreated();
      onClose();
    } catch (e: any) {
      setErr(e.message ?? "Không thể gán bot (cần quyền super_admin)");
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 sm:items-center"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 20, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0f1020]/95 p-5 backdrop-blur-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold">Gán bot cho user</h3>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-white/10">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <label className="block">
            <div className="mb-1 text-xs text-muted-foreground">Tìm user</div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPicked(null);
                }}
                placeholder="username hoặc display name…"
                className="w-full rounded-lg border border-white/10 bg-white/5 py-2 pl-8 pr-3 text-sm focus:border-white/30 focus:outline-none"
              />
            </div>
          </label>

          {!picked && results.length > 0 && (
            <div className="max-h-56 overflow-y-auto rounded-xl border border-white/10 bg-white/5">
              {results.map((u) => (
                <button
                  key={u.id}
                  onClick={() => {
                    setPicked(u);
                    setResults([]);
                    setQ(u.username || "");
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-white/10"
                >
                  {u.avatar_url ? (
                    <img loading="lazy" decoding="async" src={avatarSrc(u.avatar_url, 64)} className="h-7 w-7 rounded-full object-cover" alt="" />
                  ) : (
                    <div className="h-7 w-7 rounded-full bg-gradient-to-br from-purple-500 to-blue-500" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{u.display_name || u.username}</div>
                    <div className="truncate text-xs text-muted-foreground">@{u.username}</div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {picked && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-2 text-sm">
              {picked.avatar_url ? (
                <img loading="lazy" decoding="async" src={avatarSrc(picked.avatar_url, 64)} className="h-8 w-8 rounded-full object-cover" alt="" />
              ) : (
                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-purple-500 to-blue-500" />
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{picked.display_name || picked.username}</div>
                <div className="truncate text-xs text-muted-foreground">@{picked.username}</div>
              </div>
            </div>
          )}

          <label className="block">
            <div className="mb-1 text-xs text-muted-foreground">Bot role</div>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as BotType)}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm focus:border-white/30 focus:outline-none"
            >
              {BOT_ROLES.map((r) => (
                <option key={r} value={r} className="bg-[#0a0b14]">
                  {BOT_TYPE_LABEL[r]}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
              <span>Priority</span>
              <b className="text-foreground">{priority}</b>
            </div>
            <input
              type="range"
              min={0}
              max={10}
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value))}
              className="w-full accent-purple-500"
            />
          </label>

          {err && <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300">{err}</div>}

          <button
            disabled={!picked || busy}
            onClick={submit}
            className="w-full rounded-xl bg-gradient-to-r from-purple-500 to-blue-500 py-2.5 text-sm font-semibold disabled:opacity-40"
          >
            {busy ? "Đang gán…" : "Xác nhận gán bot"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
