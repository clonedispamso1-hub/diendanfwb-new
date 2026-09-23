/**
 * GroupCard — markup DÙNG CHUNG cho mọi "Card Nhóm" (tab Nhóm ở Tin nhắn,
 * bài viết, bình luận, bong bóng tin nhắn).
 *
 * Chỉ dùng <span> (display block/flex) để card hợp lệ khi nằm inline trong
 * nội dung text. CSS ở src/styles/group-card.css (.bgc-*).
 */
import type { ReactNode } from "react";
import { ArrowRight, Lock, MessageCircle, Users } from "lucide-react";

export type GroupCardProps = {
  name: ReactNode;
  avatarUrl?: string | null;
  memberCount?: string | number | null;
  messageCount?: string | number | null;
  previewText?: ReactNode;
  /** Mờ dòng preview (nhóm mồi). Tắt cho phòng chat thật của chính user. */
  blurPreview?: boolean;
  /** Nội dung phụ bên phải hàng tên (giờ, ghim…). */
  trailing?: ReactNode;
  ctaLabel?: string;
  /** Bấm vào card (và nút "Vào"). */
  onOpen: () => void;
  /** Hành động riêng cho nút "Vào" nếu khác card. */
  onCta?: () => void;
  className?: string;
  inline?: boolean;
  /** data-bait-group=... để scroll/focus. */
  dataGroupId?: string;
};

export function GroupCard({
  name,
  avatarUrl,
  memberCount,
  messageCount,
  previewText,
  blurPreview = true,
  trailing,
  ctaLabel = "Vào",
  onOpen,
  onCta,
  className = "",
  inline = false,
  dataGroupId,
}: GroupCardProps) {
  const fire = (fn: () => void) => (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
    fn();
  };

  return (
    <span
      role="button"
      tabIndex={0}
      data-bait-group={dataGroupId}
      onClick={fire(onOpen)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") fire(onOpen)(e);
      }}
      className={`bgc-card ${inline ? "bgc-card--inline" : ""} ${className}`}
    >
      <span className="bgc-avatar">
        {avatarUrl ? (
          <img src={avatarUrl} alt="" loading="lazy" />
        ) : (
          <span className="bgc-avatar-fallback" aria-hidden>
            <Users size={20} />
          </span>
        )}
      </span>

      <span className="bgc-body">
        <span className="bgc-row1">
          <span className="bgc-name">{name}</span>
          <span className="bgc-tag">NHÓM</span>
          {trailing}
        </span>

        {previewText ? (
          <span className="bgc-preview">
            <span className={blurPreview ? "bgc-preview-text" : "bgc-preview-text bgc-preview-text--clear"}>
              {previewText}
            </span>
            {blurPreview ? (
              <span className="bgc-preview-veil">
                <span className="bgc-preview-lock">
                  <Lock size={9} />
                </span>
              </span>
            ) : null}
          </span>
        ) : null}

        <span className="bgc-meta">
          {memberCount != null ? (
            <span className="bgc-meta-item">
              <Users size={11} />
              {memberCount} thành viên
            </span>
          ) : null}
          {messageCount != null ? (
            <span className="bgc-meta-item bgc-meta-item--hot">
              <MessageCircle size={11} />
              {messageCount} tin nhắn
            </span>
          ) : null}
        </span>
      </span>

      <span
        role="button"
        tabIndex={-1}
        onClick={fire(onCta ?? onOpen)}
        className="bgc-cta"
      >
        {ctaLabel} <ArrowRight size={13} />
      </span>
    </span>
  );
}

export default GroupCard;
