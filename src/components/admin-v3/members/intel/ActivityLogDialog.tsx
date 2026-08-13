import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { memberIntel, ACTIVITY_LABELS, type ActivityRow } from "@/lib/member-intel";

export function ActivityLogDialog({ userId, name, onClose }:
  { userId: string; name: string; onClose: () => void }) {
  const [rows, setRows] = useState<ActivityRow[] | null>(null);

  useEffect(() => {
    memberIntel.activity(userId, 100)
      .then(setRows)
      .catch((e) => { toast.error(e?.message || String(e)); setRows([]); });
  }, [userId]);

  return (
    <div className="mi-modal" onClick={onClose}>
      <div className="mi-modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="mi-modal-head">
          <div className="mi-modal-title">Nhật ký hoạt động · {name}</div>
          <button className="mi-btn ghost" onClick={onClose}><X size={15} /></button>
        </div>
        {!rows ? <div className="mi-empty">Đang tải…</div>
          : rows.length === 0 ? <div className="mi-empty">Chưa có hoạt động nào được ghi nhận.</div>
          : (
            <div className="mi-list">
              {rows.map((r) => (
                <div className="mi-row" key={r.id}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>
                      {ACTIVITY_LABELS[r.action] || r.action}
                    </div>
                    <div className="mi-mini">
                      {r.detail || "—"}{r.ip ? ` · IP ${r.ip}` : ""}{r.fingerprint ? ` · ${r.fingerprint}` : ""}
                    </div>
                  </div>
                  <div className="mi-mini">{new Date(r.created_at).toLocaleString("vi-VN")}</div>
                </div>
              ))}
            </div>
          )}
      </div>
    </div>
  );
}
