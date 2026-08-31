/**
 * BaitGroupInfoPopup — Popup Thông tin Nhóm (duy nhất cho tab Nhóm & Card Nhóm).
 * Avatar trên cùng → Tên nhóm + số thành viên → nội dung admin cấu hình
 * (info_text) → nút "Tham Gia Ngay". Góc phải có dấu X để tắt.
 */
import { Users, X, Images, ArrowRight } from "lucide-react";
import { shortCount, applyLocation, type BaitGroup } from "@/lib/supabase-v4";

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
    <div
      className="fixed inset-0 z-[9999] grid place-items-center bg-black/65 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-xs overflow-hidden rounded-3xl bg-card text-center shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Đóng"
          onClick={onClose}
          className="absolute right-2.5 top-2.5 z-10 grid h-8 w-8 place-items-center rounded-full bg-black/35 text-white transition-colors hover:bg-black/55"
        >
          <X size={16} />
        </button>

        <div
          className="pb-5 pt-6"
          style={{ background: "linear-gradient(135deg,rgba(124,58,237,.18),rgba(236,72,153,.14))" }}
        >
          {group.avatar_url ? (
            <img
              src={group.avatar_url}
              alt=""
              loading="lazy"
              className="mx-auto h-24 w-24 rounded-2xl object-cover ring-2 ring-violet-400/50 shadow-lg"
            />
          ) : (
            <span
              className="mx-auto grid h-24 w-24 place-items-center rounded-2xl text-white shadow-lg"
              style={{ background: "linear-gradient(135deg,#7c3aed,#ec4899)" }}
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
            className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-extrabold text-white shadow-lg transition-transform active:scale-95"
            style={{ background: "linear-gradient(135deg,#7c3aed,#ec4899)" }}
          >
            Tham Gia Ngay <ArrowRight size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default BaitGroupInfoPopup;
