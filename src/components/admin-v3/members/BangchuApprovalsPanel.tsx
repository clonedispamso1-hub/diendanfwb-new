import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, X, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  supabaseAdminSession,
  type BangchuRole,
  type BangchuRow,
} from "@/integrations/supabase/admin-client";

export const BANGCHU_ROLE_LABELS: Record<BangchuRole, string> = {
  admin_1: "Admin 1 (Bang Chủ)",
  admin_2: "Admin 2 (Kiểm duyệt)",
  agent: "Agent (Cộng tác viên)",
};

/**
 * Danh sách tài khoản quản trị (bangchu) đang PENDING + hành động duyệt / từ chối.
 * Chỉ admin_1 đọc được danh sách (RLS) và gọi được RPC (security definer).
 * Khi duyệt, admin_1 CHỌN ROLE — người đăng ký không tự chọn được.
 */
export function BangchuApprovalsPanel() {
  const [rows, setRows] = useState<BangchuRow[]>([]);
  const [roles, setRoles] = useState<Record<string, BangchuRole>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await supabaseAdminSession
      .from("bangchu")
      .select("id, username, role, status, is_active, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(100);
    if (error) {
      toast.error("Không tải được danh sách: " + error.message);
    } else {
      setRows((data as BangchuRow[]) ?? []);
    }
    setLoading(false);
  }
  useEffect(() => {
    void load();
  }, []);

  async function approve(id: string) {
    const role = roles[id] ?? "agent";
    setBusy(id);
    const { error } = await supabaseAdminSession.rpc("approve_bangchu", {
      _target: id,
      _role: role,
    });
    setBusy(null);
    if (error) {
      toast.error("Duyệt thất bại: " + error.message);
      return;
    }
    toast.success(`Đã phê duyệt với quyền ${BANGCHU_ROLE_LABELS[role]}`);
    void load();
  }

  async function reject(id: string) {
    setBusy(id);
    const { error } = await supabaseAdminSession.rpc("reject_bangchu", { _target: id });
    setBusy(null);
    if (error) {
      toast.error("Từ chối thất bại: " + error.message);
      return;
    }
    toast.success("Đã từ chối yêu cầu");
    void load();
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Chỉ Admin 1 (Bang Chủ) thấy danh sách này. Chọn role trước khi duyệt.
        </p>
        <Button size="sm" variant="outline" disabled={loading} onClick={() => void load()}>
          <RefreshCw size={14} className="mr-1" /> Tải lại
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Đang tải…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Không có yêu cầu nào đang chờ.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li
              key={r.id}
              className="rounded-lg border p-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-medium flex items-center gap-2">
                  <ShieldCheck size={15} className="text-muted-foreground" />
                  {r.username}
                </p>
                <p className="text-xs text-muted-foreground">
                  Đăng ký lúc {new Date(r.created_at).toLocaleString("vi-VN")}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  value={roles[r.id] ?? "agent"}
                  onValueChange={(v) =>
                    setRoles((prev) => ({ ...prev, [r.id]: v as BangchuRole }))
                  }
                  disabled={busy === r.id}
                >
                  <SelectTrigger className="w-[190px] h-9">
                    <SelectValue placeholder="Chọn role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="agent">{BANGCHU_ROLE_LABELS.agent}</SelectItem>
                    <SelectItem value="admin_2">{BANGCHU_ROLE_LABELS.admin_2}</SelectItem>
                    <SelectItem value="admin_1">{BANGCHU_ROLE_LABELS.admin_1}</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="sm" disabled={busy === r.id} onClick={() => approve(r.id)}>
                  <Check size={14} className="mr-1" /> Duyệt
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={busy === r.id}
                  onClick={() => reject(r.id)}
                >
                  <X size={14} className="mr-1" /> Từ chối
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
