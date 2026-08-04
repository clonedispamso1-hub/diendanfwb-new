import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  supabaseAdminSession,
  type BangchuRow,
} from "@/integrations/supabase/admin-client";
import { AdminShell } from "./AdminShell";

export default function AdminApprovalsPage() {
  const [rows, setRows] = useState<BangchuRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data } = await supabaseAdminSession
      .from("bangchu")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true });
    setRows((data as BangchuRow[]) ?? []);
    setLoading(false);
  }
  useEffect(() => {
    void load();
  }, []);

  async function approve(id: string) {
    setBusy(id);
    await supabaseAdminSession.rpc("approve_bangchu", { _target: id });
    setBusy(null);
    void load();
  }
  async function reject(id: string) {
    setBusy(id);
    await supabaseAdminSession.rpc("reject_bangchu", { _target: id });
    setBusy(null);
    void load();
  }

  return (
    <AdminShell title="📋 Duyệt admin">
      {loading ? (
        <p className="text-sm text-muted-foreground">Đang tải…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Không có yêu cầu nào.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="rounded-lg border p-3 flex items-center justify-between gap-2">
              <div>
                <p className="font-medium">{r.username}</p>
                <p className="text-xs text-muted-foreground">
                  {r.role} · {new Date(r.created_at).toLocaleString("vi-VN")}
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" disabled={busy === r.id} onClick={() => approve(r.id)}>
                  Duyệt
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={busy === r.id}
                  onClick={() => reject(r.id)}
                >
                  Từ chối
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </AdminShell>
  );
}