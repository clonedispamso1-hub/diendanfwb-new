import { useEffect, useRef, useState } from "react";
import { Plus, X, Loader2, Camera } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { uploadFile, getMediaUrl as cdnUrl, getMediaThumb } from "@/lib/media";
import { ImageLightbox } from "@/components/candy/image-lightbox";

interface GalleryItem {
  id: string;
  image_url: string;
  public_id: string | null;
}

interface Props {
  userId: string;
  isOwn: boolean;
}

const MAX = 5;

/**
 * Gallery cá nhân tối đa 5 ảnh.
 * - Lưu ở table public.profile_gallery
 * - Upload qua Cloudinary, lưu cả public_id (tên file) để tham chiếu.
 */
export function ProfileGalleryGrid({ userId, isOwn }: Props) {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("profile_gallery" as any)
      .select("id, image_url, public_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    setItems((data as any) ?? []);
    setLoading(false);
  };

  useEffect(() => { void load(); }, [userId]);

  const onPick = () => inputRef.current?.click();

  const handleFile = async (file: File) => {
    if (items.length >= MAX) {
      toast.error(`Tối đa ${MAX} ảnh trong Gallery.`);
      return;
    }
    setUploading(true);
    try {
      const url = await uploadFile(file, "profile-gallery");
      // public_id = tên file trên Cloudinary (a1b2c3.webp)
      const publicId = url.split("/").pop() || null;
      const { error } = await supabase
        .from("profile_gallery" as any)
        .insert({ user_id: userId, image_url: url, public_id: publicId });
      if (error) throw error;
      await load();
    } catch (err: any) {
      toast.error(err?.message?.includes("GALLERY_MAX_5") ? `Tối đa ${MAX} ảnh.` : (err?.message ?? "Tải ảnh thất bại."));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const removeItem = async (item: GalleryItem) => {
    const prev = items;
    setItems((s) => s.filter((x) => x.id !== item.id));
    const { error } = await supabase.from("profile_gallery" as any).delete().eq("id", item.id);
    if (error) {
      setItems(prev);
      toast.error("Xoá thất bại.");
    }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="aspect-square rounded-2xl bg-white/5 animate-pulse" />
        ))}
      </div>
    );
  }

  const empty = items.length === 0;

  return (
    <div>
      {empty && !isOwn ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur p-8 text-center text-sm text-muted-foreground">
          <Camera size={28} className="mx-auto mb-2 opacity-50" />
          Người này chưa có ảnh trong Gallery.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setLightbox(item.image_url)}
              className="group relative aspect-square overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.45)] transition hover:scale-[1.02]"
            >
              <img
                src={getMediaThumb(item.image_url, 480)}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover transition group-hover:scale-105"
              />
              {isOwn ? (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); void removeItem(item); }}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); void removeItem(item); } }}
                  aria-label="Xoá ảnh"
                  className="absolute top-2 right-2 grid h-8 w-8 cursor-pointer place-items-center rounded-full bg-black/60 text-white opacity-0 backdrop-blur transition hover:bg-black/80 group-hover:opacity-100"
                >
                  <X size={14} />
                </span>
              ) : null}
            </button>
          ))}

          {isOwn && items.length < MAX ? (
            <button
              type="button"
              disabled={uploading}
              onClick={onPick}
              className="aspect-square rounded-2xl border-2 border-dashed border-amber-300/30 bg-gradient-to-br from-amber-500/5 via-fuchsia-500/5 to-purple-500/5 backdrop-blur transition hover:border-amber-300/60 hover:from-amber-500/10 hover:to-purple-500/10 flex flex-col items-center justify-center gap-2 text-amber-200/80"
            >
              {uploading ? <Loader2 size={26} className="animate-spin" /> : <Plus size={28} />}
              <span className="text-xs font-semibold tracking-wide uppercase">
                {uploading ? "Đang tải..." : `Thêm ảnh (${items.length}/${MAX})`}
              </span>
            </button>
          ) : null}
        </div>
      )}

      {empty && isOwn ? (
        <button
          type="button"
          onClick={onPick}
          disabled={uploading}
          className="mt-3 w-full rounded-2xl border-2 border-dashed border-amber-300/30 bg-gradient-to-r from-amber-500/10 to-purple-500/10 px-6 py-8 text-amber-200/90 backdrop-blur transition hover:border-amber-300/60"
        >
          <Camera size={26} className="mx-auto mb-2" />
          <div className="text-sm font-semibold">Thêm ảnh đầu tiên vào Gallery</div>
          <div className="mt-1 text-[11px] uppercase tracking-[0.15em] opacity-70">Tối đa {MAX} ảnh</div>
        </button>
      ) : null}

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

      {lightbox ? <ImageLightbox src={lightbox} alt="Gallery" onClose={() => setLightbox(null)} /> : null}
    </div>
  );
}
