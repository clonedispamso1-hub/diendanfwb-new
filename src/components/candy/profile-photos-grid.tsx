import { useRef, useState } from "react";
import { Plus, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { uploadAvatarUrl } from "@/lib/media";
import { supabase } from "@/lib/supabase";
import { ImageLightbox } from "@/components/candy/image-lightbox";
import { getMediaUrl as cdnUrl } from "@/lib/media";

interface ProfilePhotosGridProps {
  userId: string;
  isOwn: boolean;
  initialPhotos: string[];
  onChange?: (photos: string[]) => void;
}

const SLOTS = 3;

export function ProfilePhotosGrid({ userId, isOwn, initialPhotos, onChange }: ProfilePhotosGridProps) {
  const [photos, setPhotos] = useState<string[]>(initialPhotos.slice(0, SLOTS));
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const pendingSlot = useRef<number>(-1);

  const persist = async (next: string[]) => {
    setPhotos(next);
    onChange?.(next);
    const { error } = await supabase
      .from("profiles")
      .update({ photos: next } as any)
      .eq("id", userId);
    if (error) {
      console.error("[photos] update failed", error);
      toast.error("Không lưu được ảnh hồ sơ. (Cần cột 'photos' trong bảng profiles)");
    }
  };

  const handleAddClick = (slot: number) => {
    pendingSlot.current = slot;
    inputRef.current?.click();
  };

  const handleFile = async (file: File) => {
    const slot = pendingSlot.current;
    if (slot < 0) return;
    setUploadingIdx(slot);
    try {
      // Ảnh hồ sơ = luồng avatar → luôn Cloudinary, không đi qua logic chặn bài viết.
      const url = await uploadAvatarUrl(file, { kind: "gallery" });
      if (!url) throw new Error("Không tải được ảnh.");
      const next = [...photos];
      next[slot] = url;
      await persist(next.filter(Boolean));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Tải ảnh thất bại.");
    } finally {
      setUploadingIdx(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const removePhoto = async (slot: number) => {
    const next = photos.filter((_, i) => i !== slot);
    await persist(next);
  };

  return (
    <div style={{ marginTop: 4 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 10,
        }}
      >
        {Array.from({ length: SLOTS }).map((_, i) => {
          const photo = photos[i];
          const uploading = uploadingIdx === i;
          if (photo) {
            return (
              <div
                key={i}
                style={{
                  position: "relative",
                  aspectRatio: "1 / 1",
                  borderRadius: 14,
                  overflow: "hidden",
                  background: "hsl(var(--secondary) / 0.4)",
                  border: "1px solid hsl(var(--border))",
                  cursor: "pointer",
                }}
                onClick={() => setLightbox(photo)}
              >
                <img src={cdnUrl(photo)} alt={`Ảnh ${i + 1}`} loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                {isOwn && (
                  <button
                    onClick={(e) => { e.stopPropagation(); void removePhoto(i); }}
                    aria-label="Xoá ảnh"
                    style={{
                      position: "absolute", top: 6, right: 6,
                      width: 26, height: 26, borderRadius: 999,
                      background: "rgba(0,0,0,0.55)", color: "#fff",
                      border: "none", display: "inline-flex",
                      alignItems: "center", justifyContent: "center", cursor: "pointer",
                    }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            );
          }
          // Empty slot — only owner sees the "+" tile
          if (!isOwn) {
            return (
              <div
                key={i}
                style={{
                  aspectRatio: "1 / 1",
                  borderRadius: 14,
                  background: "transparent",
                  border: "1px dashed hsl(var(--border))",
                }}
              />
            );
          }
          return (
            <button
              key={i}
              type="button"
              onClick={() => !uploading && handleAddClick(i)}
              disabled={uploading}
              style={{
                aspectRatio: "1 / 1",
                borderRadius: 14,
                background: "transparent",
                border: "1.5px dashed hsl(var(--primary) / 0.5)",
                color: "hsl(var(--primary))",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                cursor: uploading ? "wait" : "pointer",
                transition: "background 0.2s",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "hsl(var(--primary) / 0.06)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
            >
              {uploading ? <Loader2 size={22} className="animate-spin" /> : <Plus size={26} />}
              <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.8 }}>
                {uploading ? "Đang tải..." : "Tải ảnh của bạn lên"}
              </span>
            </button>
          );
        })}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />

      {lightbox && (
        <ImageLightbox src={lightbox} alt="Ảnh hồ sơ" onClose={() => setLightbox(null)} />
      )}
    </div>
  );
}
