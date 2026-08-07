/**
 * Icon VIP hiển thị ngay sau tên thành viên (bài viết, bình luận, tin nhắn,
 * hồ sơ, kết quả tìm kiếm, Live Móc, Kết Nối Bí Mật).
 *
 * Bấm vào GIF → hiện FLOATING VIP CARD ngay phía trên GIF (không modal,
 * không làm mờ nền, không khóa màn hình). Click ra ngoài tự tắt.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  getCachedVipIcon,
  requestVipIcon,
  subscribeVipIcons,
} from "@/lib/vip-assets";
import { vipIconSize, type VipSizeContext } from "@/lib/vip-sizes";
import { VipMedia } from "@/components/vip/vip-media";
import { FloatingVipCard } from "@/components/vip/floating-vip-card";

export function useVipIcon(userId?: string | null) {
  const snapshot = useSyncExternalStore(
    subscribeVipIcons,
    () => (userId ? getCachedVipIcon(userId) ?? null : null),
    () => null,
  );
  useEffect(() => {
    if (userId) requestVipIcon(userId);
  }, [userId]);
  return snapshot;
}


export function VipIconBadge({
  userId,
  size,
  context = "name",
  className,
}: {
  userId?: string | null;
  size?: number;
  /** Kích thước chuẩn theo ngữ cảnh. `size` ghi đè nếu truyền. */
  context?: VipSizeContext;
  className?: string;
}) {
  const icon = useVipIcon(userId);
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const px = size ?? vipIconSize(context);
  if (!icon) return null;

  // GIF cạnh tên: cao ~1.25 lần chữ, luôn ngang hàng, không co, nét.
  const inlineName = context === "name" && size === undefined;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        title={icon.name}
        aria-label="Thành viên VIP"
        className={`vip-icon-badge ${className ?? ""}`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          verticalAlign: "middle",
          marginLeft: 4,
          background: "none",
          border: 0,
          padding: 0,
          cursor: "pointer",
          lineHeight: 0,
          flex: "0 0 auto",
        }}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <VipMedia
          url={icon.url}
          {...(inlineName
            ? { height: "1.25em", width: "auto" }
            : { size: px })}
          alt=""
          objectFit="contain"
          style={{
            imageRendering: "auto",
            flex: "0 0 auto",
            verticalAlign: "middle",
          }}
        />
      </button>
      {open ? (
        <FloatingVipCard anchor={btnRef.current} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

export default VipIconBadge;
