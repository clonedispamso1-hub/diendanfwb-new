// PHASE 3.4 — Popup MATCH 2 chiều
import { useEffect } from "react";
import { Heart, MessageCircle, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface NearbyMatchPopupProps {
  open: boolean;
  partnerName: string;
  partnerAvatar: string | null;
  onClose: () => void;
  onChat: () => void;
  onKeepExploring: () => void;
}

export function NearbyMatchPopup({
  open, partnerName, partnerAvatar, onClose, onChat, onKeepExploring,
}: NearbyMatchPopupProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-sm overflow-hidden rounded-3xl border bg-card shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-full bg-background/70 text-foreground hover:bg-background"
          aria-label="Đóng"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="bg-gradient-to-br from-rose-500/20 via-pink-500/20 to-fuchsia-500/20 px-6 pb-2 pt-8 text-center">
          <div className="mb-2 flex items-center justify-center gap-1 text-2xl">🎉</div>
          <h2 className="text-xl font-bold">Hai bạn đã kết nối thành công</h2>
          <div className="mt-4 flex items-center justify-center gap-3">
            <img loading="lazy" decoding="async"
              src={partnerAvatar || "/placeholder.svg"}
              alt={partnerName}
              className="h-20 w-20 rounded-full object-cover ring-4 ring-rose-500/40"
            />
            <Heart className="h-8 w-8 animate-pulse fill-rose-500 text-rose-500" />
          </div>
          <p className="mt-4 text-sm">
            ❤️ Bạn và <span className="font-semibold">{partnerName}</span>
            <br />
            đã cùng quan tâm nhau.
          </p>
        </div>
        <div className="flex flex-col gap-2 p-5">
          <Button onClick={onChat} className="h-11 rounded-full bg-rose-500 hover:bg-rose-600 text-white gap-2">
            <MessageCircle className="h-4 w-4" /> Nhắn tin ngay
          </Button>
          <Button onClick={onKeepExploring} variant="outline" className="h-11 rounded-full gap-2">
            <Sparkles className="h-4 w-4" /> Tiếp tục khám phá
          </Button>
        </div>
      </div>
    </div>
  );
}

export default NearbyMatchPopup;
