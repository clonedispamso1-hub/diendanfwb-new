/**
 * <CloneVipAvatarMedia> — Media VIP xoay quanh avatar của clone (tối đa 10).
 *
 * Chỉ đọc dữ liệu đã được Admin gán (profiles.vip_media). Không có avatar media
 * thì component trả về đúng children → user thường không bị ảnh hưởng gì.
 */
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { VipMedia } from "@/components/vip/vip-media";
import {
  MAX_AVATAR_VIP_MEDIA,
  getCachedCloneVipAvatarMedia,
  requestCloneVipMedia,
  subscribeCloneVipMedia,
} from "@/lib/clone-vip-media";

const EMPTY_VIP_MEDIA: string[] = [];

export function useCloneVipAvatarMedia(userId?: string | null) {
  const list = useSyncExternalStore(
    subscribeCloneVipMedia,
    () => (userId ? getCachedCloneVipAvatarMedia(userId) : undefined),
    () => undefined,
  );
  useEffect(() => {
    if (userId) requestCloneVipMedia(userId);
  }, [userId]);
  return list ?? EMPTY_VIP_MEDIA;
}

export function CloneVipAvatarMedia({
  userId,
  size,
  itemSize,
  children,
}: {
  userId?: string | null;
  /** Cạnh avatar (px) — dùng để tính bán kính vòng media. */
  size: number;
  /** Cạnh mỗi media (px). Mặc định 34% cạnh avatar. */
  itemSize?: number;
  children: ReactNode;
}) {
  const urls = useCloneVipAvatarMedia(userId).slice(0, MAX_AVATAR_VIP_MEDIA);
  if (!urls.length) return <>{children}</>;

  const item = Math.max(10, Math.round(itemSize ?? size * 0.34));
  const radius = size / 2 + item * 0.18;

  return (
    <span
      className="clone-vip-avatar-media"
      style={{ position: "relative", display: "inline-flex", width: size, height: size }}
    >
      {children}
      {urls.map((url, i) => {
        const angle = (360 / urls.length) * i - 90;
        const rad = (angle * Math.PI) / 180;
        return (
          <VipMedia
            key={`${url}-${i}`}
            url={url}
            width={item}
            height={item}
            alt=""
            style={{
              position: "absolute",
              left: `calc(50% + ${Math.cos(rad) * radius}px - ${item / 2}px)`,
              top: `calc(50% + ${Math.sin(rad) * radius}px - ${item / 2}px)`,
              pointerEvents: "none",
            }}
          />
        );
      })}
    </span>
  );
}
