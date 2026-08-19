// Tab "Theo Dõi Thành Viên" — clone follow người dùng thật.
// Hàng đợi chạy trong PostgreSQL (pg_cron → clone_follow_tick) nên đóng web vẫn chạy.
// Frontend KHÔNG có timer: chỉ đọc dữ liệu khi mở tab hoặc bấm Làm mới.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { RefreshCw, Search, UserPlus, Trash2, Check, Users } from "lucide-react";
import { ClonePickerModal } from "@/components/admin-v3/scenario/ClonePickerModal";
import { ClearBotDataButton } from "@/components/admin-v3/scenario/ClearBotDataButton";
import {
  followUserList, followApply, followTasks, followClear,
  FOLLOW_STATUS_LABEL, type FollowUser, type FollowTask,
} from "@/lib/admin/clone-follow";

type CloneMode = "male" | "female" | "random" | "manual";

export function FollowMembersTab() {
  /* ----------------------------- Clone ----------------------------- */
  const [cloneMode, setCloneMode] = useState<CloneMode>("random");
  const [cloneIds, setCloneIds] = useState<string[]>([]);
  const [picker, setPicker] = useState<null | "male" | "female">(null);

  /* ------------------------------ User ----------------------------- */
  const [q, setQ] = useState("");
  const [users, setUsers] = useState<FollowUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [sel, setSel] = useState<Set<string>>(() => new Set());
  const lastIndex = useRef<number | null>(null);

  /* ----------------------------- Config ---------------------------- */
  const [perUser, setPerUser] = useState(10);
  const [delayMin, setDelayMin] = useState(0);
  const [delayMax, setDelayMax] = useState(60);
  const [busy, setBusy] = useState(false);

  /* ------------------------------ Queue ---------------------------- */
  const [tasks, setTasks] = useState<FollowTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);

  const loadUsers = useCallback(async (search: string) => {
    setLoading(true);
    try {
      setUsers(await followUserList(search));
    } catch (e: any) {
      toast.error(e?.message || "Không tải được danh sách người dùng");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTasks = useCallback(async () => {
    setTasksLoading(true);
    try {
      setTasks(await followTasks(300));
    } catch (e: any) {
      toast.error(e?.message || "Không tải được hàng đợi theo dõi");
    } finally {
      setTasksLoading(false);
    }
  }, []);

  useEffect(() => { void loadUsers(""); void loadTasks(); }, [loadUsers, loadTasks]);

  function pickMode(m: CloneMode) {
    setCloneMode(m);
    if (m === "random") { setCloneIds([]); return; }
    if (m === "male" || m === "female") { setPicker(m); return; }
    setPicker("male");
  }

  function click(e: React.MouseEvent, index: number) {
    const row = users[index];
    if (!row) return;
    const next = new Set(sel);
    if (e.shiftKey && lastIndex.current !== null) {
      const [a, b] = [lastIndex.current, index].sort((x, y) => x - y);
      for (let i = a; i <= b; i++) next.add(users[i].id);
    } else {
      if (next.has(row.id)) next.delete(row.id); else next.add(row.id);
      lastIndex.current = index;
    }
    setSel(next);
  }

  const allSelected = users.length > 0 && users.every((u) => sel.has(u.id));
  const selectedIds = useMemo(() => [...sel], [sel]);

  async function apply() {
    if (!selectedIds.length) { toast.error("Chưa chọn user nào"); return; }
    setBusy(true);
    try {
      const n = await followApply({
        cloneIds: cloneMode === "random" ? [] : cloneIds,
        userIds: selectedIds,
        perUser,
        delayMin,
        delayMax,
      });
      toast.success(`Đã đưa ${n} lượt theo dõi vào hàng đợi`);
      setSel(new Set());
      await loadTasks();
    } catch (e: any) {
      toast.error(e?.message || "Không tạo được hàng đợi");
    } finally {
      setBusy(false);
    }
  }

  async function clearQueue() {
    if (!confirm("Xóa toàn bộ lượt theo dõi chưa chạy?")) return;
    try {
      const n = await followClear();
      toast.success(`Đã xóa ${n} lượt`);
      await loadTasks();
    } catch (e: any) {
      toast.error(e?.message || "Xóa thất bại");
    }
  }

  return (
    <div className="admv3-card p-3 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="text-sm font-semibold flex items-center gap-1">
          <Users size={15} /> Theo Dõi Thành Viên
        </div>
        <span className="text-xs text-muted-foreground">
          Hàng đợi chạy trong PostgreSQL — đóng website vẫn chạy
        </span>
        <button className="admv3-btn admv3-btn-ghost ml-auto" onClick={() => { void loadUsers(q); void loadTasks(); }} disabled={loading}>
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Làm mới
        </button>
        <ClearBotDataButton tab="follows" onCleared={() => { void loadTasks(); }} />
      </div>

      {/* Chọn clone */}
      <div className="rounded-lg border p-2 space-y-2 text-xs">
        <div className="font-semibold">1. Chọn clone theo dõi</div>
        <div className="flex items-center gap-2 flex-wrap">
          {(["male", "female", "random", "manual"] as CloneMode[]).map((m) => (
            <button key={m}
              className={`admv3-btn ${cloneMode === m ? "" : "admv3-btn-ghost"}`}
              onClick={() => pickMode(m)}>
              {m === "male" ? "Nam" : m === "female" ? "Nữ" : m === "random" ? "Random" : "Thủ công"}
            </button>
          ))}
          <span className="text-muted-foreground">
            {cloneMode === "random"
              ? "Dùng toàn bộ clone (chia đều ngẫu nhiên)"
              : `Đã chọn ${cloneIds.length} clone`}
          </span>
        </div>

        <div className="grid sm:grid-cols-3 gap-2">
          <label className="block">
            <div className="text-muted-foreground mb-1">Số clone follow mỗi user</div>
            <input type="number" min={1} className="admv3-input" value={perUser}
              onChange={(e) => setPerUser(Math.max(1, Number(e.target.value) || 1))} />
          </label>
          <label className="block">
            <div className="text-muted-foreground mb-1">Delay tối thiểu (phút)</div>
            <input type="number" min={0} className="admv3-input" value={delayMin}
              onChange={(e) => setDelayMin(Math.max(0, Number(e.target.value) || 0))} />
          </label>
          <label className="block">
            <div className="text-muted-foreground mb-1">Delay tối đa (phút)</div>
            <input type="number" min={0} className="admv3-input" value={delayMax}
              onChange={(e) => setDelayMax(Math.max(0, Number(e.target.value) || 0))} />
          </label>
        </div>
      </div>

      {/* Danh sách user thật */}
      <div className="rounded-lg border">
        <div className="flex items-center gap-2 p-2 border-b flex-wrap">
          <div className="text-xs font-semibold">2. Chọn thành viên</div>
          <div className="flex items-center gap-1 ml-auto">
            <Search size={13} className="text-muted-foreground" />
            <input className="admv3-input" placeholder="Tìm username / tên…" value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void loadUsers(q); }} />
            <button className="admv3-btn admv3-btn-ghost" onClick={() => void loadUsers(q)}>Tìm</button>
          </div>
          <button className="admv3-btn admv3-btn-ghost"
            onClick={() => setSel(allSelected ? new Set() : new Set(users.map((u) => u.id)))}>
            {allSelected ? "Bỏ chọn tất cả" : "Chọn tất cả"}
          </button>
          <span className="text-xs text-muted-foreground">Đã chọn {sel.size}</span>
        </div>

        <div className="text-[11px] text-muted-foreground px-2 py-1 border-b">
          Click để chọn • Shift + click = chọn dải • Ctrl/⌘ + click = chọn thêm
        </div>

        <div className="max-h-72 overflow-auto divide-y select-none">
          {loading && <div className="p-6 text-center text-xs text-muted-foreground">Đang tải…</div>}
          {!loading && !users.length && (
            <div className="p-6 text-center text-xs text-muted-foreground">Không có thành viên nào</div>
          )}
          {users.map((u, i) => {
            const on = sel.has(u.id);
            return (
              <div key={u.id} onClick={(e) => click(e, i)}
                className={`flex items-center gap-2 px-2 py-1.5 cursor-pointer text-xs ${on ? "bg-primary/10" : "hover:bg-muted/40"}`}>
                <span className={`h-4 w-4 rounded border flex items-center justify-center ${on ? "bg-primary text-primary-foreground" : ""}`}>
                  {on && <Check size={11} />}
                </span>
                <span className="w-6 text-muted-foreground">{i + 1}</span>
                <img loading="lazy" decoding="async" src={u.avatar || "/favicon.ico"} alt={u.username ?? ""}
                  className="h-7 w-7 rounded-full object-cover" />
                <span className="font-medium truncate">@{u.username ?? "—"}</span>
                <span className="text-muted-foreground truncate">{u.full_name ?? ""}</span>
                <span className="ml-auto text-muted-foreground shrink-0">👥 {u.followers}</span>
              </div>
            );
          })}
        </div>

        <div className="p-2 border-t flex items-center gap-2">
          <button className="admv3-btn" onClick={apply} disabled={busy || !sel.size}>
            <UserPlus size={14} /> {busy ? "Đang xử lý…" : "THEO DÕI"}
          </button>
          <button className="admv3-btn admv3-btn-ghost text-red-500 ml-auto" onClick={clearQueue}>
            <Trash2 size={14} /> Xóa hàng đợi chưa chạy
          </button>
        </div>
      </div>

      {/* Hàng đợi */}
      <div className="rounded-lg border">
        <div className="flex items-center gap-2 p-2 border-b">
          <div className="text-xs font-semibold">3. Hàng đợi theo dõi</div>
          <button className="admv3-btn admv3-btn-ghost ml-auto" onClick={() => void loadTasks()} disabled={tasksLoading}>
            <RefreshCw size={13} className={tasksLoading ? "animate-spin" : ""} /> Tải lại
          </button>
        </div>
        <div className="max-h-72 overflow-auto divide-y">
          {!tasks.length && (
            <div className="p-6 text-center text-xs text-muted-foreground">
              {tasksLoading ? "Đang tải…" : "Chưa có lượt theo dõi nào"}
            </div>
          )}
          {tasks.map((t) => (
            <div key={t.task_id} className="flex items-center gap-2 px-2 py-1.5 text-xs">
              <img loading="lazy" decoding="async" src={t.follower_avatar || "/favicon.ico"} alt="" className="h-6 w-6 rounded-full object-cover" />
              <span className="font-medium truncate">@{t.follower_username ?? "—"}</span>
              <span className="text-muted-foreground">→</span>
              <img loading="lazy" decoding="async" src={t.target_avatar || "/favicon.ico"} alt="" className="h-6 w-6 rounded-full object-cover" />
              <span className="truncate">@{t.target_username ?? "—"}</span>
              <span className="ml-auto text-muted-foreground shrink-0">
                {new Date(t.run_at).toLocaleString("vi-VN")}
              </span>
              <span className="rounded-full border px-2 py-0.5 text-[10px] shrink-0"
                title={t.error ?? ""}>
                {FOLLOW_STATUS_LABEL[t.status] ?? t.status}
              </span>
            </div>
          ))}
        </div>
      </div>

      {picker && (
        <ClonePickerModal
          gender={picker}
          max={9999}
          initial={cloneIds}
          onClose={() => setPicker(null)}
          onConfirm={(ids) => { setCloneIds(ids); setPicker(null); }}
        />
      )}
    </div>
  );
}
