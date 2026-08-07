/**
 * <UserDisplayName /> — RENDERER TÊN NGƯỜI DÙNG DUY NHẤT của toàn website.
 *
 * MỌI nơi render tên người dùng (hồ sơ, feed, bài đăng, bình luận, trả lời,
 * tin nhắn, danh sách chat, follow, người thích, người chia sẻ, online,
 * tìm kiếm, popup hồ sơ, thông báo, kết bạn, tag/mention, Admin Panel…)
 * đều PHẢI dùng component này.
 *
 * Nó tự render: Tên → Badge (Crown / Tick VIP / Medal) → Media VIP (GIF).
 * GIF VIP cao đúng bằng font chữ (1em), dính sát tên, không xuống dòng.
 */
import type { CSSProperties, ElementType, ReactNode } from "react";
import {
  UniversalBadge,
  type UniversalBadgeProfile,
} from "@/components/candy/universal-badge";

export interface UserDisplayNameProps {
  /** Hồ sơ (để hiện đúng badge). Có thể bỏ qua nếu chỉ có userId. */
  profile?: UniversalBadgeProfile | null;
  /** Bắt buộc khi không truyền profile — dùng để nạp Media VIP. */
  userId?: string | null;
  /** Tên hiển thị. Nếu bỏ trống sẽ dùng "Người dùng". */
  name?: ReactNode;
  /** Cỡ icon badge (px). */
  badgeSize?: number;
  /** Ẩn badge (crown/tick/medal) — chỉ hiện tên + GIF VIP. */
  hideBadge?: boolean;
  /** Ẩn medal Top 1/2/3. */
  hideMedal?: boolean;
  /** Ẩn GIF VIP (hiếm khi dùng). */
  hideVipMedia?: boolean;
  className?: string;
  /** Class riêng cho phần chữ (vd: truncate, font-semibold). */
  nameClassName?: string;
  style?: CSSProperties;
  as?: ElementType;
}

export function UserDisplayName({
  profile,
  userId,
  name,
  badgeSize = 22,
  hideBadge = false,
  hideMedal = false,
  hideVipMedia = false,
  className,
  nameClassName,
  style,
  as: Tag = "span",
}: UserDisplayNameProps) {
  const id = userId ?? profile?.id ?? profile?.user_id ?? null;
  const badgeProfile: UniversalBadgeProfile | null = profile ?? (id ? { id } : null);

  return (
    <Tag
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        maxWidth: "100%",
        minWidth: 0,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      <span className={nameClassName} style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
        {name ?? "Người dùng"}
      </span>
      {!hideBadge && badgeProfile ? (
        <UniversalBadge
          profile={badgeProfile}
          size={badgeSize}
          hideMedal={hideMedal}
          hideVipMedia={hideVipMedia}
        />
      ) : null}
    </Tag>
  );
}

export default UserDisplayName;
