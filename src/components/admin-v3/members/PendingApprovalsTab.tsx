import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, RefreshCw, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { avatarSrc } from "@/lib/image-cdn";
import { purgeStalePendingAccounts } from "@/lib/device-approval";

interface PendingRow {
  id: string;
  public_id: string | null;
  username: string | null;
  full_name: string | null;
  phone: string | null;
  avatar: string | null;
  created_at: string;
  requested_at: string;
  fingerprint: string | null;
  cookie_id: string | null;
  device_index: number | null;
  reason: string | null;
}

const sb = supabase as any;

export function PendingApprovalsTab() {
  const [rows, setRows] = useState<PendingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await sb.rpc("admin_pending_signups");
      if (error) throw error;
      setRows((data || []) as PendingRow[]);
    } catch (e: any) {
      toast.error("Không tải được danh sách: " + (e?.message || e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Chỉ gọi khi mở tab (không polling). Đồng thời dọn pending quá 24 giờ.
    void purgeStalePendingAccounts().then(load);
  }, [load]);

  const act = async (row: PendingRow, action: "approved" | "rejected" | "delete") => {
    setBusy(row.id);
    const snapshot = rows;
    setRows((prev) => prev.filter((r) => r.id !== row.id));
    try {
      if (action === "delete") {
        const { error } = await sb.rpc("admin_delete_pending_account", { p_user: row.id });
        if (error) throw error;
        toast.success("Đã xoá tài khoản");
      } else {
        const { error } = await sb.rpc("admin_set_approval", { p_user: row.id, p_status: action });
        if (error) throw error;
        toast.success(action === "approved" ? "Đã phê duyệt" : "Đã từ chối");
      }
    } catch (e: any) {
      toast.error("Lỗi: " + (e?.message || e));
      setRows(snapshot);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section>
      <div className="admv3-toolbar" style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 13, opacity: 0.75 }}>
          Tài khoản thứ 2 trở đi trên cùng thiết bị (fingerprint + cookie). Không duyệt trong 24 giờ sẽ tự động bị xoá.
        </div>
        <button className="admv3-btn admv3-btn-ghost" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={14} /> Tải lại
        </button>
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
          <Loader2 className="animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <div className="admv3-empty" style={{ padding: 32, textAlign: "center", opacity: 0.7 }}>
          Không có tài khoản nào đang chờ phê duyệt.
        </div>
      ) : (
        <div className="admv3-table-wrap" style={{ overflowX: "auto" }}>
          <table className="admv3-table" style={{ width: "100%", fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Thành viên</th>
                <th style={{ textAlign: "left" }}>UID</th>
                <th style={{ textAlign: "left" }}>SĐT</th>
                <th style={{ textAlign: "left" }}>Đăng ký</th>
                <th style={{ textAlign: "left" }}>Fingerprint</th>
                <th style={{ textAlign: "left" }}>Cookie ID</th>
                <th style={{ textAlign: "left" }}>TK thứ</th>
                <th style={{ textAlign: "right" }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      {r.avatar ? (
                        <img
                          loading="lazy"
                          decoding="async"
                          src={avatarSrc(r.avatar, 64)}
                          alt=""
                          style={{ width: 34, height: 34, borderRadius: "50%", objectFit: "cover" }}
                        />
                      ) : (
                        <div style={{ width: 34, height: 34, borderRadius: "50%", background: "rgba(127,127,127,.25)" }} />
                      )}
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600 }}>{r.full_name || r.username || "—"}</div>
                        <div style={{ fontSize: 11, opacity: 0.65 }}>@{r.username || "—"}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ fontFamily: "monospace", fontSize: 11 }}>{r.public_id || r.id.slice(0, 8)}</td>
                  <td>{r.phone || "—"}</td>
                  <td style={{ fontSize: 11 }}>
                    {new Date(r.requested_at || r.created_at).toLocaleString("vi-VN")}
                  </td>
                  <td style={{ fontFamily: "monospace", fontSize: 11, maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {r.fingerprint || "—"}
                  </td>
                  <td style={{ fontFamily: "monospace", fontSize: 11, maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {r.cookie_id || "—"}
                  </td>
                  <td style={{ fontWeight: 700 }}>#{r.device_index ?? "—"}</td>
                  <td>
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                      <button
                        className="admv3-icon-btn"
                        title="Phê duyệt"
                        disabled={busy === r.id}
                        onClick={() => void act(r, "approved")}
                      >
                        <Check size={15} />
                      </button>
                      <button
                        className="admv3-icon-btn"
                        title="Từ chối"
                        disabled={busy === r.id}
                        onClick={() => void act(r, "rejected")}
                      >
                        <X size={15} />
                      </button>
                      <button
                        className="admv3-icon-btn is-danger"
                        title="Xoá"
                        disabled={busy === r.id}
                        onClick={() => void act(r, "delete")}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default PendingApprovalsTab;
