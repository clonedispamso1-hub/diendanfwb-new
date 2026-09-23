import type { ReactNode } from "react";
import { getValidAvatarUrl, handleAvatarError } from "@/lib/avatar-utils";
import type { VipProfileLike } from "@/lib/vip-status";

type InboxUserCardProps = {
  name: string;
  avatar?: string | null;
  userId?: string | null;
  profile?: VipProfileLike;
  countdown?: ReactNode;
  onPlay?: () => void;
};

/**
 * Card người dùng nằm trong header trang Tin nhắn,
 * thay thế badge đếm ngược bên phải tiêu đề.
 * Chỉ hiển thị — không đụng tới logic/dữ liệu tin nhắn.
 */
export function InboxUserCard({ name, avatar, countdown }: InboxUserCardProps) {
  return (
    <div className="inbox-user-card">
      <div className="inbox-user-card__avatar">
        <img
          src={getValidAvatarUrl(avatar, 96)}
          alt={name}
          loading="lazy"
          decoding="async"
          onError={handleAvatarError}
        />
      </div>

      <div className="inbox-user-card__info">
        <span className="inbox-user-card__name">{name}</span>
      </div>

      {countdown ? <div className="inbox-user-card__countdown">{countdown}</div> : null}
    </div>
  );
}
