import { avatarSrc } from "@/lib/image-cdn";
import { LogOut, Mail, ShieldOff } from "lucide-react";

/* URL liên hệ admin — cấu hình lại sau */
const CONTACT_ADMIN_URL = "#";

export function LockedAccountScreen({
  avatarUrl,
  username = "Người dùng",
  uid = "—",
  vip = false,
  onLogout,
}: {
  avatarUrl?: string | null;
  username?: string;
  uid?: string;
  vip?: boolean;
  onLogout?: () => void;
}) {
  return (
    <div className="rd-locked-page">
      <div className="rd-locked-card">
        <div className="rd-locked-badge">
          <ShieldOff size={26} />
        </div>
        <div className="rd-locked-avatar">
          {avatarUrl ? (
            <img loading="lazy" decoding="async" src={avatarSrc(avatarUrl, 64)} alt={username} />
          ) : (
            <span>{username[0]?.toUpperCase()}</span>
          )}
        </div>
        <h1 className="rd-locked-name">
          {username}
          {vip && <span className="rd-locked-vip">VIP</span>}
        </h1>
        <div className="rd-locked-uid">UID: {uid}</div>

        <div className="rd-locked-reason">
          Tài khoản đã bị khóa.
        </div>
        <p className="rd-locked-desc">
          Tài khoản của bạn đã bị khóa vĩnh viễn vì vi phạm nhiều lần Quy định
          cộng đồng.
          <br />
          Nếu bạn cho rằng đây là nhầm lẫn, vui lòng liên hệ Quản trị viên.
        </p>

        <div className="rd-locked-actions">
          <button className="rd-btn-ghost" onClick={onLogout ?? (() => (window.location.href = "/"))}>
            <LogOut size={14} /> Đăng xuất
          </button>
          <a className="rd-btn-primary" href={CONTACT_ADMIN_URL}>
            <Mail size={14} /> Liên hệ Admin
          </a>
        </div>
      </div>
    </div>
  );
}
