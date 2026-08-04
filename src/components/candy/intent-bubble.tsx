import type { Intent } from "@/lib/vn-provinces";
import type { CSSProperties } from "react";

type Size = "sm" | "md" | "lg";

interface IntentBubbleProps {
  userId: string | null | undefined;
  initialIntent?: Intent | string | null;
  size?: Size;
  className?: string;
  style?: CSSProperties;
}

/**
 * Bong bóng "Nhu cầu" — TẠM ẨN theo yêu cầu UI polish.
 * Không hiển thị trên avatar (feed / hồ sơ / bình luận / card) để tránh
 * che ảnh đại diện. Giữ nguyên chữ ký component để không phá call-site.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function IntentBubble(_props: IntentBubbleProps) {
  return null;
}
