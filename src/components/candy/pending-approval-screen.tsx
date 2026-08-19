import { useEffect, useState } from "react";
import { LogOut, MessageCircle, RefreshCw, ShieldCheck, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import {
  fetchApprovalSettings,
  fetchMyApproval,
  type ApprovalStatus,
} from "@/lib/device-approval";
import { avatarSrc } from "@/lib/image-cdn";

interface Props {
  status: ApprovalStatus;
  seq?: number;
  /** Thông tin hiển thị của tài khoản đang chờ duyệt. */
  fullName?: string | null;
  username?: string | null;
  avatar?: string | null;
  uid?: string | null;
  reason?: string | null;
  /** Link liên hệ Admin (ưu tiên giá trị từ auth-provider, nếu không sẽ tự tải). */
  contactLink?: string | null;
  onRecheck: () => Promise<void>;
  onLogout: () => void;
}

/**
 * Pending Approval — phong cách Facebook Checkpoint:
 * avatar · tên · UID · icon khiên · trạng thái · lý do · Liên hệ Admin · Đăng xuất.
 */
export function PendingApprovalScreen({
  status,
  seq,
  fullName,
  username,
  avatar,
  uid,
  reason,
  contactLink,
  onRecheck,
  onLogout,
}: Props) {
  const [checking, setChecking] = useState(false);
  const [contact, setContact] = useState<string>(contactLink || "");
  const rejected = status === "rejected";

  useEffect(() => {
    if (contactLink) { setContact(contactLink); return; }
    let alive = true;
    void fetchApprovalSettings().then((s) => {
      if (alive && s.admin_contact_link) setContact(s.admin_contact_link);
    });
    return () => { alive = false; };
  }, [contactLink]);

  const recheck = async () => {
    setChecking(true);
    try {
      const info = await fetchMyApproval();
      await onRecheck();
      if (info.status === "approved") toast.success("Tài khoản đã được phê duyệt!");
      else if (info.status === "rejected") toast.error("Tài khoản đã bị từ chối.");
      else toast.info("Vẫn đang chờ quản trị viên phê duyệt.");
    } finally {
      setChecking(false);
    }
  };

  const displayName = fullName || username || "Thành viên";
  const displayReason =
    reason ||
    (rejected
      ? "Quản trị viên đã từ chối yêu cầu truy cập của tài khoản này."
      : seq && seq > 1
        ? `Tài khoản thứ ${seq} trên cùng thiết bị`
        : "Tài khoản cần quản trị viên xác minh trước khi sử dụng.");

  const openContact = () => {
    if (!contact) {
      toast.info("Admin chưa cấu hình link liên hệ.");
      return;
    }
    window.open(contact, "_blank", "noopener,noreferrer");
  };

  return (
    <main className="dap-wrap">
      <div className="dap-card">
        <div className="dap-head">
          <div className="dap-avatar-box">
            {avatar ? (
              <img loading="lazy" decoding="async" className="dap-avatar" src={avatarSrc(avatar, 128)} alt="" />
            ) : (
              <div className="dap-avatar dap-avatar-empty">{displayName.slice(0, 1).toUpperCase()}</div>
            )}
            <span className={`dap-shield ${rejected ? "is-danger" : ""}`}>
              {rejected ? <ShieldAlert size={16} /> : <ShieldCheck size={16} />}
            </span>
          </div>
          <div className="dap-id">
            <div className="dap-name">{displayName}</div>
            <div className="dap-uid">UID: {uid || "—"}</div>
            {username ? <div className="dap-uid">@{username}</div> : null}
          </div>
        </div>

        <h1 className="dap-title">
          {rejected ? "Tài khoản đã bị từ chối" : "Chúng tôi cần xác minh tài khoản của bạn"}
        </h1>

        <div className={`dap-status ${rejected ? "is-danger" : ""}`}>
          <span className="dap-dot" />
          {rejected ? "Từ chối" : "Đang chờ duyệt"}
        </div>

        <div className="dap-reason">
          <div className="dap-reason-label">Lý do</div>
          <div className="dap-reason-text">{displayReason}</div>
        </div>

        {!rejected ? (
          <p className="dap-note">
            Tài khoản của bạn <b>không bị khóa</b>. Ngay khi được phê duyệt bạn có thể tiếp tục sử dụng —
            bấm “Kiểm tra lại” để cập nhật trạng thái. Yêu cầu chưa được duyệt sau 24 giờ sẽ tự động bị xoá.
          </p>
        ) : (
          <p className="dap-note">Vui lòng liên hệ quản trị viên nếu bạn cho rằng đây là nhầm lẫn.</p>
        )}

        <div className="dap-actions">
          <button className="dap-btn dap-btn-primary" onClick={openContact}>
            <MessageCircle size={16} /> Liên hệ Admin
          </button>
          {!rejected ? (
            <button className="dap-btn dap-btn-soft" onClick={() => void recheck()} disabled={checking}>
              <RefreshCw size={15} className={checking ? "animate-spin" : ""} /> Kiểm tra lại
            </button>
          ) : null}
          <button className="dap-btn dap-btn-ghost" onClick={onLogout}>
            <LogOut size={15} /> Đăng xuất
          </button>
        </div>
      </div>

      <style>{`
        .dap-wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center;
          padding: 24px 16px; background: var(--color-background, #f0f2f5); }
        .dap-card { width: 100%; max-width: 420px; background: var(--color-card, #fff);
          border: 1px solid var(--color-border, rgba(0,0,0,.08)); border-radius: 18px; padding: 24px;
          box-shadow: 0 12px 32px rgba(0,0,0,.12); text-align: center; }
        .dap-head { display: flex; align-items: center; gap: 14px; text-align: left; }
        .dap-avatar-box { position: relative; flex: none; }
        .dap-avatar { width: 64px; height: 64px; border-radius: 50%; object-fit: cover;
          border: 2px solid rgba(24,119,242,.35); display: flex; align-items: center; justify-content: center;
          font-weight: 700; font-size: 22px; background: rgba(127,127,127,.18); }
        .dap-avatar-empty { color: inherit; }
        .dap-shield { position: absolute; right: -4px; bottom: -4px; width: 26px; height: 26px;
          border-radius: 50%; background: #1877f2; color: #fff; display: flex; align-items: center;
          justify-content: center; border: 2px solid var(--color-card, #fff); }
        .dap-shield.is-danger { background: #e41e3f; }
        .dap-id { min-width: 0; }
        .dap-name { font-weight: 700; font-size: 17px; }
        .dap-uid { font-size: 12px; opacity: .65; font-family: ui-monospace, monospace; }
        .dap-title { margin: 18px 0 10px; font-size: 19px; font-weight: 700; line-height: 1.35; }
        .dap-status { display: inline-flex; align-items: center; gap: 7px; font-size: 13px; font-weight: 600;
          padding: 6px 12px; border-radius: 999px; background: rgba(240,173,78,.16); color: #b8730b; }
        .dap-status.is-danger { background: rgba(228,30,63,.14); color: #e41e3f; }
        .dap-dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; }
        .dap-reason { margin-top: 16px; text-align: left; border-radius: 12px; padding: 12px 14px;
          background: rgba(127,127,127,.10); }
        .dap-reason-label { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; opacity: .6; }
        .dap-reason-text { margin-top: 3px; font-size: 14px; font-weight: 500; }
        .dap-note { margin-top: 14px; font-size: 13px; line-height: 1.6; opacity: .75; text-align: left; }
        .dap-actions { margin-top: 20px; display: flex; flex-direction: column; gap: 9px; }
        .dap-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px;
          padding: 11px 16px; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer;
          border: 1px solid transparent; transition: opacity .15s ease, background .15s ease; }
        .dap-btn:disabled { opacity: .6; cursor: default; }
        .dap-btn-primary { background: #1877f2; color: #fff; }
        .dap-btn-primary:hover { opacity: .9; }
        .dap-btn-soft { background: rgba(24,119,242,.12); color: #1877f2; }
        .dap-btn-ghost { background: transparent; border-color: var(--color-border, rgba(0,0,0,.12)); }
        .dap-btn-ghost:hover { background: rgba(127,127,127,.12); }
      `}</style>
    </main>
  );
}

export default PendingApprovalScreen;
