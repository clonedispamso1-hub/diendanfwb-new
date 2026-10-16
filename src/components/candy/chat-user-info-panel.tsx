/**
 * Bảng thông tin người dùng trong header Tin nhắn.
 * Chỉ hiển thị — dùng dữ liệu đã có: avatar, tên, media sau tên (Admin Panel
 * tài khoản thứ hai — site_setting vip_media_assign), trạng thái, MXH.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Users, Crown, ShieldAlert, X as XIcon, ChevronRight } from "lucide-react";
import { getValidAvatarUrl, handleAvatarError } from "@/lib/avatar-utils";
import { VipMedia } from "@/components/vip/vip-media";
import {
  getCachedCloneVipMedia,
  requestCloneVipMedia,
  subscribeCloneVipMedia,
} from "@/lib/clone-vip-media";
import { SocialGlyph } from "@/components/candy/profile-uid-badge";
import type { SocialKey } from "@/components/candy/social-link-edit-modal";
import { CommonLockedPopup } from "@/components/candy/common-locked-popup";
import "@/styles/chat-user-info-panel.css";

const EMPTY: string[] = [];

export function useNameMedia(userId: string | null | undefined): string[] {
  useEffect(() => { requestCloneVipMedia(userId); }, [userId]);
  return useSyncExternalStore(
    subscribeCloneVipMedia,
    () => (userId ? getCachedCloneVipMedia(userId) ?? EMPTY : EMPTY),
    () => EMPTY,
  );
}

const SOCIALS: { key: SocialKey; label: string; action: string }[] = [
  { key: "zalo", label: "Zalo", action: "Kết bạn" },
  { key: "facebook", label: "Facebook", action: "Kết bạn" },
  { key: "telegram", label: "Telegram", action: "Nhắn tin" },
  { key: "instagram", label: "Instagram", action: "Theo dõi" },
  { key: "x", label: "X", action: "Theo dõi" },
];

function VnFlag() {
  return (
    <svg viewBox="0 0 30 20" width="26" height="18" aria-hidden className="cuip-flag">
      <rect width="30" height="20" rx="3" fill="#da251d" />
      <polygon fill="#ffff00" points="15,4 16.18,7.62 20,7.62 16.91,9.86 18.09,13.48 15,11.24 11.91,13.48 13.09,9.86 10,7.62 13.82,7.62" />
    </svg>
  );
}

interface Props {
  userId: string;
  name: string;
  avatar: string | null;
  statusLabel: string;
  online: boolean;
}

export function ChatUserInfoToggle({ userId, name, avatar, statusLabel, online }: Props) {
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<"joined" | "not-joined" | null>(null);
  const [vipOpen, setVipOpen] = useState(false);
  const locked = notice || vipOpen;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const media = useNameMedia(userId);
  const isVn = media.length > 0;

  useEffect(() => { setOpen(false); }, [userId]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (locked) return;
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, locked]);

  return (
    <div className="cuip-root" ref={rootRef}>
      <button
        type="button"
        className={`cuip-toggle${open ? " is-open" : ""}`}
        aria-expanded={open}
        aria-label={open ? "Đóng thông tin người dùng" : "Xem thông tin người dùng"}
        onClick={() => setOpen((v) => !v)}
      >
        <ChevronDown size={16} strokeWidth={2.6} />
      </button>

      {open ? (
        <div className={`cuip-panel${isVn ? " is-gold" : ""}`} role="dialog" aria-label="Thông tin người dùng">
          <div className="cuip-head">
            <img
              className="cuip-avatar"
              src={getValidAvatarUrl(avatar, 120)}
              alt={name}
              onError={handleAvatarError}
            />
            <div className="cuip-head__info">
              <div className="cuip-name">
                <span className="cuip-name__text">{name}</span>
                {media.map((url) => (
                  <VipMedia key={url} url={url} size={22} className="cuip-name__media" />
                ))}
              </div>
              <span className={`cuip-status${online ? " is-online" : ""}`}>
                <span className="cuip-status__dot" aria-hidden />
                {statusLabel}
              </span>
            </div>
          </div>

          <div className="cuip-section">
            <div className="cuip-section__title">Thông tin mạng xã hội</div>
            <div className="cuip-socials">
              {SOCIALS.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  className={`cuip-social cuip-social--${s.key}`}
                  aria-label={`${s.label} — ${s.action}`}
                  onClick={() => setVipOpen(true)}
                >
                  <span className="cuip-social__icon"><SocialGlyph k={s.key} /></span>
                  <span className="cuip-social__action">{s.action}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="cuip-section">
            <div className="cuip-section__title">Trạng thái server</div>
            <button
              type="button"
              className={`cuip-server${isVn ? " is-vn" : ""}`}
              onClick={() => (isVn ? setNotice("joined") : setVipOpen(true))}
            >
              {isVn ? <VnFlag /> : <span className="cuip-server__icon"><Users size={16} /></span>}
              <span className="cuip-server__text">
                <span className="cuip-server__name">{isVn ? "Việt Nam" : "Hỗn Tạp"}</span>
                <span className="cuip-server__hint">Nhấn để xem trạng thái</span>
              </span>
              <ChevronRight size={16} className="cuip-server__chev" />
            </button>
          </div>
        </div>
      ) : null}

      <CommonLockedPopup open={vipOpen} onClose={() => setVipOpen(false)} />

      {notice && typeof document !== "undefined"
        ? createPortal(
            <div className="cuip-notice-backdrop" onClick={() => setNotice(null)}>
              <div
                className={`cuip-notice is-${notice}`}
                role="alertdialog"
                aria-modal="true"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <button type="button" className="cuip-notice__close" aria-label="Đóng" onClick={() => setNotice(null)}>
                  <XIcon size={16} />
                </button>
                <div className="cuip-notice__icon">
                  {notice === "joined" ? <Crown size={26} /> : <ShieldAlert size={26} />}
                </div>
                <div className="cuip-notice__title">
                  {notice === "joined" ? "Server Việt Nam" : "Server Hỗn Tạp"}
                </div>
                <p className="cuip-notice__text">
                  {notice === "joined"
                    ? "Người dùng này đã tham gia nhóm VIP Zalo"
                    : "Người dùng này chưa tham gia VIP Zalo"}
                </p>
                <button type="button" className="cuip-notice__btn" onClick={() => setNotice(null)}>
                  Đã hiểu
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
