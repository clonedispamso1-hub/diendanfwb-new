/**
 * AlbumComposerModal — popup "Đăng Album" (chỉ dùng ở tab Album).
 *
 * Bước 1: chọn "Bán Album" hoặc "Album Miễn Phí".
 * Bước 2: form tương ứng (Bán Album có thêm ô Số tiền (Xu)).
 *
 * Quyền: TÁI SỬ DỤNG kiểm tra VIP Zalo hiện có (isVipMember / is_admin).
 * Chưa tham gia VIP Zalo → KHÔNG mở file picker, KHÔNG upload, chỉ báo lỗi.
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Images, Video, X, Coins, Gift, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/candy/auth-provider";
import { isVipMember } from "@/lib/contact-permission";

export const ALBUM_VIP_ZALO_MESSAGE =
  "Bạn chưa tham gia nhóm VIP Zalo để sử dụng tính năng này!";

type Mode = "choose" | "sell" | "free";

export interface AlbumComposerModalProps {
  open: boolean;
  onClose: () => void;
}

export const ALBUM_VIP_INLINE_MESSAGE =
  "Tính năng này chỉ dành cho thành viên đã tham gia nhóm VIP Zalo.";

function formatPriceDisplay(value: string): string {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function AlbumComposerModal({ open, onClose }: AlbumComposerModalProps) {
  const { me, isAdmin } = useAuth();
  const [mode, setMode] = useState<Mode>("choose");
  const [caption, setCaption] = useState("");
  const [price, setPrice] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [videos, setVideos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const photoRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLInputElement | null>(null);

  const canUseMedia = Boolean(isAdmin) || isVipMember(me as any);

  // Tạo/huỷ object URL để xem trước ảnh đã chọn (không upload thật).
  useEffect(() => {
    const urls = photos.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [photos]);

  useEffect(() => {
    if (!open) return;
    setMode("choose");
    setCaption("");
    setPrice("");
    setPhotos([]);
    setVideos([]);
    setError(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.classList.add("modal-open");
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.classList.remove("modal-open");
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  /** Chỉ chọn file để xem trước trong popup — KHÔNG upload thật. */
  const pick = (kind: "photo" | "video") => {
    (kind === "photo" ? photoRef : videoRef).current?.click();
  };

  const submit = () => {
    // Chưa tham gia VIP Zalo: báo ngay trong popup, không đóng/reset/upload.
    if (!canUseMedia) {
      setError(ALBUM_VIP_INLINE_MESSAGE);
      return;
    }
    setError(null);
    if (!caption.trim()) {
      toast.error("Vui lòng nhập caption cho Album.");
      return;
    }
    if (mode === "sell" && !price.trim()) {
      toast.error("Vui lòng nhập số tiền (Xu).");
      return;
    }
    if (photos.length === 0 && videos.length === 0) {
      toast.error("Vui lòng chọn ít nhất 1 ảnh hoặc 1 video.");
      return;
    }
    toast.info("Album của bạn đang chờ Admin mở tính năng đăng Album.");
  };

  return createPortal(
    <div className="alb-cp-overlay" role="dialog" aria-modal="true" aria-label="Đăng Album" onClick={onClose}>
      <div className="alb-cp-card" onClick={(e) => e.stopPropagation()}>
        <div className="alb-cp-head">
          {mode !== "choose" ? (
            <button type="button" className="alb-cp-back" onClick={() => setMode("choose")} aria-label="Quay lại">
              <ArrowLeft size={16} aria-hidden="true" />
            </button>
          ) : null}
          <span className="alb-cp-title">
            {mode === "sell" ? "Bán Album" : mode === "free" ? "Album Miễn Phí" : "Đăng Album"}
          </span>
          <button type="button" className="alb-cp-close" onClick={onClose} aria-label="Đóng">
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="alb-cp-body">
          {mode === "choose" ? (
            <div className="alb-cp-choices">
              <button type="button" className="alb-cp-choice" onClick={() => setMode("sell")}>
                <span className="alb-cp-choice__icon" aria-hidden="true">
                  <Coins size={20} />
                </span>
                <span className="alb-cp-choice__text">
                  <strong>Bán Album</strong>
                  <em>Người xem trả Xu để mở Album</em>
                </span>
              </button>
              <button type="button" className="alb-cp-choice" onClick={() => setMode("free")}>
                <span className="alb-cp-choice__icon alb-cp-choice__icon--free" aria-hidden="true">
                  <Gift size={20} />
                </span>
                <span className="alb-cp-choice__text">
                  <strong>Album Miễn Phí</strong>
                  <em>Mọi người xem được miễn phí</em>
                </span>
              </button>
            </div>
          ) : (
            <>
              <label className="alb-cp-field">
                <span>Caption</span>
                <textarea
                  rows={3}
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Viết caption cho Album…"
                />
              </label>

              {mode === "sell" ? (
                <label className="alb-cp-field">
                  <span>Số tiền (Xu)</span>
                  <input
                     type="text"
                    inputMode="numeric"
                     value={formatPriceDisplay(price)}
                     onChange={(e) => {
                       const digits = e.target.value.replace(/\D/g, "");
                       setPrice(digits.replace(/^0+(?=\d)/, ""));
                     }}
                    placeholder="Ví dụ: 50000"
                  />
                </label>
              ) : null}

              <div className="alb-cp-picks">
                <button type="button" className="alb-cp-pick" onClick={() => pick("photo")}>
                  <Images size={16} aria-hidden="true" />
                  Chọn ảnh{photos.length ? ` (${photos.length})` : ""}
                </button>
                <button type="button" className="alb-cp-pick" onClick={() => pick("video")}>
                  <Video size={16} aria-hidden="true" />
                  Chọn video{videos.length ? ` (${videos.length})` : ""}
                </button>
              </div>

              {previews.length ? (
                <div className="alb-cp-thumbs">
                  {previews.map((src, i) => (
                    <div className="alb-cp-thumb" key={`${src}-${i}`}>
                      <img src={src} alt={photos[i]?.name ?? `Ảnh ${i + 1}`} />
                      <button
                        type="button"
                        className="alb-cp-thumb__x"
                        aria-label="Bỏ ảnh"
                        onClick={() => setPhotos((prev) => prev.filter((_, idx) => idx !== i))}
                      >
                        <X size={12} aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}

              <input
                ref={photoRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  if (files.length) setPhotos((prev) => [...prev, ...files]);
                  e.target.value = "";
                }}
              />
              <input
                ref={videoRef}
                type="file"
                accept="video/*"
                multiple
                hidden
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  if (files.length) setVideos((prev) => [...prev, ...files]);
                  e.target.value = "";
                }}
              />

              {error ? (
                <div className="alb-cp-alert" role="alert" aria-live="assertive">
                  {error}
                </div>
              ) : null}

              <button type="button" className="alb-cp-submit" onClick={submit}>
                Đăng album
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default AlbumComposerModal;
