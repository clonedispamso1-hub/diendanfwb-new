import { useEffect } from "react";
import { ShieldAlert, MessageCircle, LogOut, ExternalLink, Lock, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

import { openExternalLinkWithFeedback } from "@/lib/external-link";
interface SuspendedOverlayProps {
  username?: string | null;
  displayName?: string | null;
  uid?: string | number | null;
  onLogout: () => void;
  /** "banned_15" | "suspended" | "trust_low" (uy tín ≤ 70) | "multi_device" (>3 accounts/device) */
  mode?: "banned_15" | "suspended" | "trust_low" | "multi_device";
  reason?: string | null;
  bannedUntil?: string | null;
}

const ADMIN_FB_URL = "https://www.facebook.com/share/1Tpq77qfMn/?mibextid=wwXIfr";

export function SuspendedOverlay({
  username,
  displayName,
  uid,
  onLogout,
  mode = "suspended",
  reason,
  bannedUntil,
}: SuspendedOverlayProps) {
  // Khoá scroll nền & chặn phím Esc để overlay không thể bị đóng.
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const blockKeys = (e: KeyboardEvent) => {
      if (e.key === "Escape") e.preventDefault();
    };
    window.addEventListener("keydown", blockKeys, true);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", blockKeys, true);
    };
  }, []);

  const handleContactAdmin = () => {
    openExternalLinkWithFeedback(ADMIN_FB_URL);
  };

  const incidentCode = `LOCK-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, "0")}${String(new Date().getDate()).padStart(2, "0")}`;

  // Tiêu đề thống nhất theo yêu cầu mới
  const titleText = "TÀI KHOẢN BỊ TẠM KHÓA";

  // Subtitle: Display Name + [UID] (fallback @username)
  const subtitleText = (() => {
    const name = (displayName || "").trim();
    const id = uid != null && String(uid).trim() !== "" ? `[${uid}]` : "";
    if (name && id) return `${name} ${id}`;
    if (name) return name;
    if (username) return `@${username}`;
    return "";
  })();

  // Nội dung lý do — handle 2 conditions chính + fallback cũ
  const reasonContent = (() => {
    if (mode === "multi_device") {
      return "Nhận thấy hành vi gian lận (Đăng ký quá nhiều tài khoản trên một thiết bị)";
    }
    if (mode === "trust_low") {
      return "Phát hiện hành vi vi phạm điều khoản (Uy tín thấp)";
    }
    if (reason) return String(reason);
    if (mode === "banned_15") {
      return `Tài khoản tạm khoá 15 ngày${
        bannedUntil ? ` · đến ${new Date(bannedUntil).toLocaleDateString("vi-VN")}` : ""
      }.`;
    }
    return "Phát hiện hành vi vi phạm điều khoản cộng đồng.";
  })();

  return (
    <div
      className="suspended-overlay text-gray-100"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="suspended-title"
      aria-describedby="suspended-desc"
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="suspended-card" data-mode={mode}>
        <div className="suspended-brandbar text-gray-100">
          <Lock className="h-3.5 w-3.5" />
          <span>FWB SECURITY · Trung tâm An toàn Tài khoản</span>
        </div>

        <div className="suspended-icon-wrap">
          <ShieldAlert className="suspended-icon" strokeWidth={2.2} />
        </div>

        <h1 id="suspended-title" className="suspended-title text-white">
          {titleText}
        </h1>

        {subtitleText ? (
          <p className="suspended-username text-gray-300">
            {subtitleText}
          </p>
        ) : null}

        <div className="suspended-divider" />

        <div className="suspended-reason" id="suspended-desc">
          <p className="suspended-reason-label text-red-300">
            <AlertTriangle className="inline h-3 w-3 mr-1 -mt-0.5" />
            LÝ DO ĐÌNH CHỈ
          </p>
          <p className="suspended-reason-text text-gray-200">
            <strong className="text-red-400">{reasonContent}</strong>
          </p>
        </div>

        <p className="suspended-help text-gray-300">
          Tài khoản của bạn đã bị vô hiệu hoá. Nếu bạn cho rằng đây là nhầm lẫn, vui lòng liên hệ
          Quản trị viên qua Facebook để được xem xét mở khoá.
        </p>

        <div className="suspended-actions">
          <Button type="button" className="suspended-btn-primary" onClick={handleContactAdmin}>
            <MessageCircle className="h-4 w-4" />
            Liên hệ Admin để mở khoá
            <ExternalLink className="h-3.5 w-3.5 opacity-80" />
          </Button>

          <Button
            type="button"
            variant="outline"
            className="suspended-btn-secondary"
            onClick={onLogout}
          >
            <LogOut className="h-4 w-4" />
            Đăng xuất
          </Button>
        </div>

        <div className="suspended-footer-block">
          <p className="suspended-footer text-gray-400">
            Mã sự cố: <strong className="text-gray-200">{incidentCode}</strong>
          </p>
          <p className="suspended-footer suspended-footer-muted text-gray-500">
            © {new Date().getFullYear()} FWB · Bảo mật & Cộng đồng
          </p>
        </div>
      </div>
    </div>
  );
}
