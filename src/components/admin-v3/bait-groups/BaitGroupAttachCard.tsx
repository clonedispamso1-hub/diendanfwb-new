/**
 * BaitGroupAttachCard — khung preview "Card Nhóm" đã đính kèm, hiện ngay trong
 * khung soạn thảo (Bình luận / Nhắn tin / Hàng loạt) giống đính kèm ảnh–sticker.
 * Bố cục: caption ở trên (do composer), card nhóm ở dưới.
 */
import { Users, X, ArrowRight } from "lucide-react";

import { shortCount, type BaitGroup } from "@/lib/supabase-v4";

export function BaitGroupAttachCard({
  group,
  onRemove,
}: {
  group: BaitGroup;
  onRemove?: () => void;
}) {
  return (
    <div className="relative w-full max-w-sm">
      <div className="flex items-center gap-3 rounded-2xl border border-violet-400/40 bg-gradient-to-br from-violet-500/15 to-pink-500/10 p-2.5 shadow-sm">
        {group.avatar_url ? (
          <img
            src={group.avatar_url}
            alt=""
            loading="lazy"
            className="h-12 w-12 shrink-0 rounded-xl object-cover ring-1 ring-violet-400/40"
          />
        ) : (
          <span
            className="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-white"
            style={{ background: "linear-gradient(135deg,#7c3aed,#ec4899)" }}
            aria-hidden
          >
            <Users size={20} />
          </span>
        )}

        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold">{group.name}</span>
          <span className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
            <Users size={11} />
            {shortCount(group.member_count || 0)} thành viên
          </span>
        </span>

        <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-violet-600 px-3 py-1.5 text-[11px] font-extrabold text-white">
          Vào <ArrowRight size={12} />
        </span>
      </div>

      {onRemove ? (
        <button
          type="button"
          title="Bỏ Card Nhóm"
          onClick={onRemove}
          className="absolute -right-2 -top-2 rounded-full border bg-background p-0.5 shadow"
        >
          <X size={12} />
        </button>
      ) : null}
    </div>
  );
}

export default BaitGroupAttachCard;
