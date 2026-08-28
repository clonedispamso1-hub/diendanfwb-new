import { patchProfileCache } from "@/lib/profile-cache";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { Portal } from "@/components/candy/portal";
import { AvatarCropper } from "@/components/ui/avatar-cropper";
import { supabase } from "@/lib/supabase";
import {
  uploadAvatarUrl,
  AVATAR_ACCEPT,
  AVATAR_ONLY_MESSAGE,
  isAllowedAvatarFile,
} from "@/lib/media";


/**
 * Shared "change avatar" flow:
 *  Trigger → File Picker → Crop Modal (top of stack) → Upload → profiles.update
 *
 * The crop modal is rendered in a Portal at the document body so it always
 * sits above any parent Sheet / Dialog / stacking context.
 *
 * UI-only: no schema / API / logic changes.
 */
export function useAvatarChangeFlow(opts: {
  userId?: string | null;
  onUpdated?: (url: string) => void;
}) {
  const { userId, onUpdated } = opts;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const openPicker = useCallback(() => {
    if (!userId) {
      toast.error("Bạn cần đăng nhập.");
      return;
    }
    inputRef.current?.click();
  }, [userId]);

  const persistAvatar = useCallback(
    async (url: string) => {
      if (!userId) return;
      const { error } = await supabase
        .from("profiles")
        .update({ avatar: url } as any)
        .eq("id", userId);
      if (error) throw error;
      // Patch cache thay vì xoá → UI đổi avatar ngay, không tạo request mới.
      patchProfileCache(userId, { avatar: url });
      try {
        window.dispatchEvent(
          new CustomEvent("app:avatar-updated", { detail: { userId, url } }),
        );
      } catch {
        /* ignore */
      }
      onUpdated?.(url);
    },
    [userId, onUpdated],
  );

  const handleConfirm = useCallback(
    async (blob: Blob) => {
      if (!userId) return;
      setUploading(true);
      try {
        const file = new File([blob], `avatar-${Date.now()}.jpg`, {
          type: "image/jpeg",
          lastModified: Date.now(),
        });
        // Chỉ tạo DUY NHẤT bản gốc-hiển-thị 320px WebP (quality ~0.82, ≤60KB)
        // khi upload — nét hơn mà chỉ +~20KB/avatar. Bản thumbnail 64px do CDN
        // sinh & cache theo URL — không upload thêm file, không phóng to ảnh
        // nhỏ (cropper + compressor đều không upscale).
        const url = await uploadAvatarUrl(file, {
          kind: "avatar",
          maxWidthOrHeight: 600,
          maxSizeMB: 0.25,
        });

        await persistAvatar(url);
        toast.success("Đã cập nhật ảnh đại diện.");
        setCropFile(null);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Không tải được ảnh.");
      } finally {
        setUploading(false);
      }
    },
    [userId, persistAvatar],
  );

  const flowNode = (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={AVATAR_ACCEPT}
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0] || null;
          e.target.value = "";
          if (!f) return;
          // Avatar chỉ hỗ trợ JPG / PNG / WEBP — chặn GIF/APNG/SVG/video
          // TRƯỚC khi upload (không gọi Cloudinary, không ghi database).
          if (!isAllowedAvatarFile(f)) {
            toast.error(AVATAR_ONLY_MESSAGE);
            return;
          }
          setCropFile(f);
        }}
      />

      {cropFile ? (
        <Portal>
          <div
            // Highest priority — sits above Sheet/Dialog/overlays.
            style={{ position: "fixed", inset: 0, zIndex: 100000 }}
          >
            <AvatarCropper
              file={cropFile}
              outputSize={600}
              onCancel={() => {
                if (!uploading) setCropFile(null);
              }}
              onConfirm={handleConfirm}
            />
          </div>
        </Portal>
      ) : null}
    </>
  );

  return { openPicker, flowNode, uploading, isOpen: !!cropFile };
}
