/**
 * BaitGroupPickerButton — nút "Card Nhóm" dùng chung cho các composer trong
 * Admin (Bình luận, Nhắn tin, Bình luận hàng loạt, Gửi tin hàng loạt).
 *
 * Bấm nút → hiện danh sách nhóm mồi (1 danh sách duy nhất, không thư mục).
 * Chọn 1 nhóm → gọi onPick(token) với token `[[baitgroup:<id>]]` để composer
 * chèn vào nội dung hoặc gửi ngay.
 */
import { useEffect, useState } from "react";
import { Users } from "lucide-react";

import { fetchBaitGroups } from "@/lib/bait-groups-cache";
import { baitGroupToken } from "@/lib/bait-group-token";
import type { BaitGroup } from "@/lib/supabase-v4";

export function BaitGroupPickerButton({
  onPick,
  label = "Card Nhóm",
  iconOnly = false,
  disabled = false,
}: {
  onPick: (token: string, group: BaitGroup) => void;
  label?: string;
  iconOnly?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [groups, setGroups] = useState<BaitGroup[]>([]);

  useEffect(() => {
    if (!open || groups.length) return;
    let alive = true;
    void (async () => {
      const { groups: g } = await fetchBaitGroups().catch(() => ({ folders: [], groups: [] }));
      if (alive) setGroups(g);
    })();
    return () => {
      alive = false;
    };
  }, [open, groups.length]);

  return (
    <div className="relative">
      <button
        type="button"
        className={`admv3-btn admv3-btn-ghost${iconOnly ? " admv3-btn-icon" : ""}`}
        title="Chèn Card Nhóm"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        <Users size={iconOnly ? 16 : 14} /> {iconOnly ? null : label}
      </button>

      {open ? (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="absolute bottom-full left-0 z-50 mb-2 w-72 max-h-60 overflow-y-auto overflow-x-hidden overscroll-contain rounded-xl border bg-background p-1 shadow-xl"
            style={{ WebkitOverflowScrolling: "touch", scrollbarWidth: "thin" }}
            onWheel={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-background px-2 py-1.5 text-[11px] font-semibold text-muted-foreground">
              Chọn nhóm để chèn Card Nhóm
            </div>
            {groups.length === 0 ? (
              <div className="px-2 py-3 text-xs text-muted-foreground">Đang tải / chưa có nhóm…</div>
            ) : (

              groups.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted"
                  onClick={() => {
                    setOpen(false);
                    onPick(baitGroupToken(g.id), g);
                  }}
                >
                  {g.avatar_url ? (
                    <img
                      src={g.avatar_url}
                      alt=""
                      loading="lazy"
                      className="h-7 w-7 shrink-0 rounded-lg object-cover"
                    />
                  ) : (
                    <span
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-white"
                      style={{ background: "linear-gradient(135deg,#7c3aed,#ec4899)" }}
                      aria-hidden
                    >
                      <Users size={13} />
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate">{g.name}</span>
                </button>
              ))
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

export default BaitGroupPickerButton;
