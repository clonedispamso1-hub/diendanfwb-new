import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { uploadFile, getMediaUrl as cdnUrl } from "@/lib/media";
import { logActivity } from "@/lib/activity-log";
import { AvatarGlow } from "@/components/candy/avatar-glow";
import { useRealtime } from "@/lib/realtime-registry";

interface StoryRecord {
  id: string;
  user_id: string;
  media_url: string;
  public_id: string | null;
  media_type: "image" | "video";
  created_at: string;
  expires_at: string;
}

export interface StoryRingAvatarHandle {
  openUpload: () => void;
}

interface Props {
  userId: string;
  avatarUrl: string | null;
  isOwn: boolean;
  size?: number;
  onOpenViewer: (stories: StoryRecord[]) => void;
  /** Khi isOwn & không có story: tap avatar → callback này (mặc định mở picker upload). */
  onOwnAvatarTap?: () => void;
}

/**
 * Avatar có ring xanh (FB) + hiệu ứng pulsing chậm khi user có story đang hoạt động.
 * - Tap khi có story → mở viewer.
 * - Owner không có story → gọi onOwnAvatarTap (mặc định: mở upload picker).
 * - Parent có thể imperative `ref.current.openUpload()` để mở picker từ nút bên ngoài.
 */
export const StoryRingAvatar = forwardRef<StoryRingAvatarHandle, Props>(function StoryRingAvatar(
  { userId, avatarUrl, isOwn, size = 132, onOpenViewer, onOwnAvatarTap },
  ref,
) {
  const [stories, setStories] = useState<StoryRecord[]>([]);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useImperativeHandle(ref, () => ({ openUpload: () => inputRef.current?.click() }), []);

  const load = async () => {
    const { data } = await supabase
      .from("stories" as any)
      .select("id, user_id, media_url, public_id, media_type, created_at, expires_at")
      .eq("user_id", userId)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: true });
    setStories(((data as any) ?? []) as StoryRecord[]);
  };

  useEffect(() => { void load(); }, [userId]);

  useRealtime(
    userId ? `story-ring-${userId}` : null,
    [{ table: "stories", filter: `user_id=eq.${userId}` }],
    () => { void load(); },
  );

  const MAX_FEATURED = 5;

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      // Chặn trước: nếu Tin nổi bật đã đạt 5 thì không cho đăng story mới
      const { count: featuredCount } = await supabase
        .from("featured_moments" as any)
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId);
      if ((featuredCount ?? 0) >= MAX_FEATURED) {
        toast.warning("⚠️ Bạn chỉ được phép đăng tối đa 5 tin nổi bật thôi!");
        setUploading(false);
        if (inputRef.current) inputRef.current.value = "";
        return;
      }

      // Giới hạn thời lượng video story: 10–15 giây (chỉ thông báo khi sai phạm)
      let videoDuration: number | null = null;
      if (file.type.startsWith("video/")) {
        const duration = await new Promise<number>((resolve) => {
          const v = document.createElement("video");
          v.preload = "metadata";
          v.onloadedmetadata = () => {
            URL.revokeObjectURL(v.src);
            resolve(Number.isFinite(v.duration) ? v.duration : 0);
          };
          v.onerror = () => resolve(0);
          v.src = URL.createObjectURL(file);
        });
        if (duration < 10 || duration > 15) {
          toast.error("Tài khoản của bạn chỉ được đăng video tối đa 10-15 giây.");
          setUploading(false);
          if (inputRef.current) inputRef.current.value = "";
          return;
        }
        videoDuration = duration;
      }
      const url = await uploadFile(file, "stories");
      const m = url.match(/\/upload\/(?:[^/]+\/)*([^.]+)\.[a-z0-9]+(?:\?.*)?$/i);
      const publicId = m ? m[1] : null;
      const mediaType = file.type.startsWith("video/") ? "video" : "image";
      const { error } = await supabase.from("stories" as any).insert({
        user_id: userId,
        media_url: url,
        public_id: publicId,
        media_type: mediaType,
      });
      if (error) throw error;

      // Tự đồng bộ Story → Tin nổi bật (giới hạn 5)
      try {
        await supabase.from("featured_moments" as any).insert({
          user_id: userId,
          image_url: url,
          caption: null,
          position: featuredCount ?? 0,
          media_type: mediaType,
          duration_seconds: videoDuration,
        } as any);
      } catch { /* best-effort: vẫn coi như đăng story OK */ }

      toast.success("Đã đăng story • tự huỷ sau 24h và lưu vào Tin nổi bật");
      try {
        void logActivity({
          userId,
          actionType: "story_create",
          description: `Bạn đã thêm một ${mediaType === "video" ? "story video" : "story ảnh"} mới.`,
          metadata: { media_type: mediaType, media_url: url },
        });
      } catch { /* best-effort */ }
      await load();
    } catch (err: any) {
      toast.error(err?.message ?? "Đăng story thất bại.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const hasStory = stories.length > 0;
  const ringPad = hasStory ? 4 : 0;
  const inner = size - ringPad * 2 - 6;

  const handleTap = () => {
    if (hasStory) {
      onOpenViewer(stories);
    } else if (isOwn) {
      if (onOwnAvatarTap) onOwnAvatarTap();
      else inputRef.current?.click();
    }
  };

  return (
    <div className="relative inline-block" style={{ width: size, height: size }}>
      <button
        type="button"
        onClick={handleTap}
        aria-label={hasStory ? "Xem story" : isOwn ? "Đổi ảnh đại diện" : "Avatar"}
        className={`block rounded-full transition active:scale-95 transform-gpu ${hasStory ? "story-ring-blue-pulse" : ""}`}
        style={{ width: size, height: size, padding: ringPad }}
      >
        <span
          className="block rounded-full bg-background p-[3px]"
          style={{ width: size - ringPad * 2, height: size - ringPad * 2 }}
        >
          <AvatarGlow
            avatar={avatarUrl || null}
            userId={userId}
            size={inner}
            alt=""
          />
        </span>
      </button>

      {uploading ? (
        <span className="absolute inset-0 grid place-items-center rounded-full bg-black/40 backdrop-blur-sm">
          <Loader2 size={20} className="animate-spin text-white" />
        </span>
      ) : null}

      {isOwn ? (
        <input
          ref={inputRef}
          type="file"
          accept="image/*,video/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleUpload(f);
          }}
        />
      ) : null}
    </div>
  );
});

export type { StoryRecord };
export const cdnStoryUrl = cdnUrl;
