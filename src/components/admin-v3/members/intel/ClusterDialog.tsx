import { avatarSrc } from "@/lib/image-cdn";
import { useEffect, useState } from "react";
import { X, Ban, LogOut, ShieldAlert, Unlock, Lock } from "lucide-react";
import { toast } from "sonner";
import { memberIntel, type ClusterDetail } from "@/lib/member-intel";

interface Props {
  scope: "ip" | "device";
  clusterKey: string;
  onClose: () => void;
  onChanged?: () => void;
}

export function ClusterDialog({ scope, clusterKey, onClose, onChanged }: Props) {
  const [data, setData] = useState<ClusterDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const load = async () => {
    try {
      setData(await memberIntel.cluster(scope, clusterKey));
    } catch (e: any) {
      toast.error("Không tải được cụm: " + (e?.message || e));
      onClose();
    }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [scope, clusterKey]);

  const run = async (action: Parameters<typeof memberIntel.clusterAction>[2], confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    try {
      const res = await memberIntel.clusterAction(scope, clusterKey, action);
      toast.success(`Đã xử lý ${res.affected} mục (${res.users} tài khoản)`);
      await load();
      onChanged?.();
    } catch (e: any) {
      toast.error(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const title = scope === "ip" ? "Chi tiết IP" : "Chi tiết Device";
  const accounts = data?.accounts ?? [];
  const shown = showAll ? accounts : accounts.slice(0, 6);

  return (
    <div className="mi-modal" onClick={onClose}>
      <div className="mi-modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="mi-modal-head">
          <div>
            <div className="mi-modal-title">{title}</div>
            <div className="mi-mini" style={{ fontFamily: "ui-monospace, monospace" }}>{clusterKey}</div>
          </div>
          <button className="mi-btn ghost" onClick={onClose} aria-label="Đóng"><X size={15} /></button>
        </div>

        {!data ? (
          <div className="mi-empty">Đang tải…</div>
        ) : (
          <>
            <div className="mi-kv">
              <div className="mi-cell">Số tài khoản<b>{data.account_count}</b></div>
              <div className="mi-cell">Quốc gia<b>{data.info.country || "—"}</b></div>
              <div className="mi-cell">Nhà mạng<b>{data.info.isp || "—"}</b></div>
              <div className="mi-cell">Trình duyệt<b>{data.info.browser || "—"}</b></div>
              <div className="mi-cell">Hệ điều hành<b>{data.info.os || "—"}</b></div>
              <div className="mi-cell">Loại thiết bị<b>{data.info.device_type || "—"}</b></div>
              <div className="mi-cell">Lần online cuối<b>{data.info.last_seen ? new Date(data.info.last_seen).toLocaleString("vi-VN") : "—"}</b></div>
              <div className="mi-cell">Trạng thái<b>{data.blocked ? "🔴 Đang bị chặn" : "🟢 Chưa chặn"}</b></div>
            </div>

            {scope === "device" && data.ips.length > 0 && (
              <div className="mi-mini" style={{ marginBottom: 8 }}>
                IP đã dùng: {data.ips.join(" · ")}
              </div>
            )}

            <div className="mi-list">
              {shown.map((a) => (
                <div className="mi-row" key={a.id}>
                  {a.avatar ? <img loading="lazy" decoding="async" className="mi-ava" src={avatarSrc(a.avatar, 64)} alt="" /> : <div className="mi-ava" />}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{a.full_name || a.username || "—"}</div>
                    <div className="mi-mini">@{a.username || "—"} · {a.phone || "—"}</div>
                  </div>
                  {a.is_banned && <span className="mi-badge danger">Đã khóa</span>}
                </div>
              ))}
              {accounts.length === 0 && <div className="mi-empty">Chưa có tài khoản nào.</div>}
            </div>
            {accounts.length > 6 && (
              <div className="mi-more">
                <button className="mi-btn" onClick={() => setShowAll((v) => !v)}>
                  {showAll ? "Thu gọn" : `Xem tất cả (${accounts.length})`}
                </button>
              </div>
            )}

            <div className="mi-actions" style={{ marginTop: 14 }}>
              <button className="mi-btn danger" disabled={busy}
                onClick={() => run("ban_all", `Khóa TẤT CẢ ${accounts.length} tài khoản trong cụm này?`)}>
                <Ban size={14} /> Khóa tất cả
              </button>
              <button className="mi-btn" disabled={busy} onClick={() => run("logout_all")}>
                <LogOut size={14} /> Đăng xuất tất cả
              </button>
              <button className="mi-btn" disabled={busy} onClick={() => run("mark_spam")}>
                <ShieldAlert size={14} /> Đánh dấu Spam
              </button>
              {data.blocked ? (
                <button className="mi-btn" disabled={busy} onClick={() => run("unblock")}>
                  <Unlock size={14} /> Bỏ chặn {scope === "ip" ? "IP" : "Device"}
                </button>
              ) : (
                <button className="mi-btn primary" disabled={busy}
                  onClick={() => run("block", `Chặn ${scope === "ip" ? "IP" : "Device"} này?`)}>
                  <Lock size={14} /> Khóa {scope === "ip" ? "IP" : "Device"}
                </button>
              )}
              <button className="mi-btn ghost" disabled={busy} onClick={() => run("unban_all")}>
                <Unlock size={14} /> Mở khóa toàn bộ cụm
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
