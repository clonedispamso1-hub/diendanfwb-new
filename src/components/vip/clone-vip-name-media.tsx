/**
 * <CloneVipNameMedia> — Media VIP hiển thị NGAY SÁT TÊN người dùng.
 *
 * Dùng ở MỌI nơi render tên: hồ sơ, bài viết, bình luận, tin nhắn, chat list,
 * tìm kiếm, bạn bè, online, notification, mention, danh sách clone…
 *
 * - Cao bằng font chữ (1em) → tự scale theo cỡ chữ, không cách khoảng.
 * - Click → Tooltip/Card nhỏ (KHÔNG popup / dialog / modal), fade + scale.
 *
 * Nguồn dữ liệu: profiles.vip_media (gán từ "Quản Lý Icon VIP").
 * KHÔNG dùng chung component/query với Kho GIF dùng chung.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { VipMedia } from "@/components/vip/vip-media";
import { FloatingVipCard } from "@/components/vip/floating-vip-card";
import {
  VIP_MEMBER_TITLE,
  getCachedCloneVipMedia,
  randomVipDuration,
  requestCloneVipMedia,
  subscribeCloneVipMedia,
} from "@/lib/clone-vip-media";

export function useCloneVipMedia(userId?: string | null) {
  const list = useSyncExternalStore(
    subscribeCloneVipMedia,
    () => (userId ? getCachedCloneVipMedia(userId) : undefined),
    () => undefined,
  );
  useEffect(() => {
    if (userId) requestCloneVipMedia(userId);
  }, [userId]);
  return list ?? [];
}

export function CloneVipNameMedia({
  userId,
  size,
  max,
}: {
  userId?: string | null;
  /** Cạnh vuông (px). Mặc định: cao bằng font chữ (1em). */
  size?: number;
  /** Giới hạn hiển thị (mặc định: không giới hạn). */
  max?: number;
}) {
  const urls = useCloneVipMedia(userId);
  const [duration] = useState(randomVipDuration);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [open]);

  if (!urls.length) return null;
  const shown = max ? urls.slice(0, max) : urls;
  const dim = size ? { width: size, height: size } : { width: "auto", height: "1.25em" };

  return (
    <span
      ref={wrapRef}
      className="clone-vip-name-media"
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        verticalAlign: "middle",
        gap: 0,
        lineHeight: 0,
      }}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setOpen((v) => !v);
      }}
    >
      {shown.map((url, i) => (
        <VipMedia
          key={`${url}-${i}`}
          url={url}
          width={dim.width}
          height={dim.height}
          alt=""
          style={{ cursor: "pointer", display: "inline-block" }}
        />
      ))}
      {open ? (
        <FloatingVipCard
          anchor={wrapRef.current}
          durationText={duration}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </span>
  );
}

