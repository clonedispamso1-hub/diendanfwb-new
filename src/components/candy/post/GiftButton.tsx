import { useState } from "react";
import { Gift } from "lucide-react";
import { toast } from "sonner";
import { usePostCard } from "./post-card-context";

/**
 * GiftButton — mở popup Gift System V1 (catalog `gift_items` + RPC
 * `send_post_gift`). Không cho tự tặng quà cho chính mình.
 *
 * UI V4: chỉ icon 🎁 (không chữ), hover đổi màu + scale nhẹ, click có ripple.
 */
export function GiftButton() {
  const { isLocked, isPostOwner, meId, setGiftMenuOpen, showGiftBurst } = usePostCard();
  const [ripple, setRipple] = useState(0);

  const onClick = () => {
    setRipple((n) => n + 1);
    if (isLocked) { toast.error("Bài viết đã bị khóa."); return; }
    if (!meId) { toast.error("Bạn cần đăng nhập để tặng quà."); return; }
    if (isPostOwner) { toast.error("Không thể tự tặng quà cho mình."); return; }
    setGiftMenuOpen(true);
  };

  return (
    <button
      type="button"
      className={`pc-action pc-gift pc-gift--icon ${showGiftBurst ? "is-burst" : ""}`}
      onClick={onClick}
      disabled={isLocked}
      aria-label="Tặng quà"
      title="Tặng quà"
    >
      <span className="pc-action-icon">
        <Gift size={23} strokeWidth={2.2} />
      </span>
      {ripple > 0 ? <span key={ripple} className="pc-gift-ripple" aria-hidden /> : null}
      {showGiftBurst ? <span className="pc-gift-burst" aria-hidden>🎁</span> : null}
    </button>
  );
}
