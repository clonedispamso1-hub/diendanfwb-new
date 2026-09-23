/**
 * BaitGroupInfoPopup — Popup Thông tin Nhóm (duy nhất cho tab Nhóm & Card Nhóm).
 * Avatar trên cùng → Tên nhóm + số thành viên → nội dung admin cấu hình
 * (info_text) → nút "Tham Gia Ngay". Góc phải có dấu X để tắt.
 */
import { Users, X, Images, ArrowRight } from "lucide-react";
import { shortCount, applyLocation, type BaitGroup } from "@/lib/supabase-v4";
import { Portal } from "@/components/candy/portal";

export function BaitGroupInfoPopup({
  group,
  province,
  onClose,
  onJoin,
}: {
  group: BaitGroup;
  province?: string | null;
  onClose: () => void;
  onJoin: () => void;
}) {
  const info = (group.info_text || "").trim();

  return (
    <Portal>
    <div
      className="zalo-detail-overlay fixed inset-0 z-[100000] grid place-items-center p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="zalo-detail-card relative w-full max-w-xs overflow-hidden text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Đóng"
          onClick={onClose}
          className="zalo-detail-close absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center transition-colors"
        >
          <X size={16} />
        </button>

        <div className="zalo-detail-head pb-5 pt-7">
          {group.avatar_url ? (
            <img
              src={group.avatar_url}
              alt=""
              loading="lazy"
              className="zalo-detail-avatar mx-auto h-24 w-24 object-cover"
            />
          ) : (
            <span
              className="zalo-detail-avatar zalo-detail-avatar--empty mx-auto grid h-24 w-24 place-items-center"
              aria-hidden
            >
              <Users size={34} />
            </span>
          )}

          <h3 className="mt-3 px-5 text-base font-extrabold leading-snug">
            {applyLocation(group.name, province)}
          </h3>
          <p className="mt-1 inline-flex items-center justify-center gap-1 text-xs font-semibold text-muted-foreground">
            <Users size={12} />
            {shortCount(group.member_count || 0)} thành viên
          </p>
        </div>

        <div className="px-5 pb-5 pt-4">
          {info ? (
            <p className="whitespace-pre-line text-left text-[13px] leading-relaxed text-muted-foreground">
              {applyLocation(info, province)}
            </p>
          ) : (
            <p className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
              <Images size={14} /> Nhóm kín — chia sẻ ảnh &amp; video mỗi ngày.
            </p>
          )}

          <button
            type="button"
            onClick={onJoin}
            className="zalo-detail-cta mt-4 inline-flex w-full items-center justify-center gap-1.5 px-4 py-3 text-sm font-extrabold transition-transform active:scale-[0.98]"
          >
            Tham Gia Ngay <ArrowRight size={15} />
          </button>
        </div>
      </div>
    </div>
    </Portal>
  );
}

export default BaitGroupInfoPopup;
