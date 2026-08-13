import { avatarSrc } from "@/lib/image-cdn";
import { useCallback, useEffect, useState } from "react";
import { Check, X, Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";

interface PendingRow {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar: string | null;
  device_id: string | null;
  created_at: string;
  approval_status: string | null;
  is_clone: boolean | null;
  is_virtual: boolean | null;
  is_seed_account: boolean | null;
  trust_score: number | null;
  approval_reason: string | null;
}

const sb = supabase as any;

function isClone(r: PendingRow): boolean {
  return Boolean(r.is_clone || r.is_virtual || r.is_seed_account);
}

function reasonOf(r: PendingRow): string {
  if (r.approval_reason) return r.approval_reason;
  if ((r.trust_score ?? 100) < 50) return "Uy tín thấp";
  return "Vượt quá giới hạn 2 tài khoản";
}

export function AccountApprovalsTab() {
  const [rows, setRows] = useState<PendingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await sb
        .from("profiles")
        .select("id, username, full_name, avatar, device_id, created_at, approval_status, is_clone, is_virtual, is_seed_account, trust_score, approval_reason")
        .eq("approval_status", "pending")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      setRows((data || []) as PendingRow[]);
    } catch (e: any) {
      toast.error("Không tải được danh sách: " + (e?.message || e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const ch = sb
      .channel("profiles-approvals")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profiles", filter: "approval_status=eq.pending" },
        () => { void load(); },
      )
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [load]);

  const setStatus = async (row: PendingRow, status: "approved" | "rejected") => {
    setBusy(row.id);
    // Optimistic remove
    setRows((prev) => prev.filter((r) => r.id !== row.id));
    try {
      const { error } = await sb
        .from("profiles")
        .update({ approval_status: status })
        .eq("id", row.id);
      if (error) throw error;
      toast.success(status === "approved" ? "Đã duyệt tài khoản" : "Đã từ chối tài khoản");
    } catch (e: any) {
      toast.error("Lỗi cập nhật: " + (e?.message || e));
      // Restore on failure
      setRows((prev) => [row, ...prev]);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="stack-md">
      <header className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2">
            <ShieldAlert size={18} /> Duyệt Tài Khoản
          </h3>
          <p className="text-xs text-muted-foreground">
            Hồ sơ bị giữ lại vì vượt giới hạn thiết bị hoặc điểm uy tín thấp.
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-1.5 text-xs hover:bg-muted"
        >
          <RefreshCw size={12} /> Tải lại
        </button>
      </header>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="animate-spin" /></div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Không có tài khoản nào đang chờ duyệt.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Loại tài khoản</th>
                <th className="px-3 py-2 text-left">Thông tin</th>
                <th className="px-3 py-2 text-left">Lý do treo</th>
                <th className="px-3 py-2 text-right">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const clone = isClone(r);
                return (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-3 py-3">
                      {clone ? (
                        <span className="inline-flex items-center rounded-full bg-gray-500/15 px-2.5 py-0.5 text-xs font-medium text-gray-400 ring-1 ring-gray-500/30">
                          Tài khoản Clone
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-blue-500/15 px-2.5 py-0.5 text-xs font-semibold text-blue-400 ring-1 ring-blue-500/30">
                          Người thật
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {r.avatar ? (
                          <img loading="lazy" decoding="async" src={avatarSrc(r.avatar, 64)} alt="" className="h-9 w-9 rounded-full object-cover" />
                        ) : (
                          <div className="h-9 w-9 rounded-full bg-muted" />
                        )}
                        <div className="min-w-0">
                          <div className="truncate font-medium">
                            {r.full_name || r.username || r.id.slice(0, 8)}
                          </div>
                          <div className="truncate text-[11px] text-muted-foreground">
                            @{r.username || "—"} · Device: {r.device_id || "—"}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {new Date(r.created_at).toLocaleString("vi-VN")}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-xs">{reasonOf(r)}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          disabled={busy === r.id}
                          onClick={() => void setStatus(r, "approved")}
                          aria-label="Duyệt"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50"
                        >
                          <Check size={16} />
                        </button>
                        <button
                          disabled={busy === r.id}
                          onClick={() => void setStatus(r, "rejected")}
                          aria-label="Từ chối"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500 text-white hover:bg-rose-600 disabled:opacity-50"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default AccountApprovalsTab;
