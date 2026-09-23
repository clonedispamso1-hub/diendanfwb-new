/**
 * Nút "Tải Icon / GIF lên" — dùng lại hệ thống upload sẵn có của website
 * (MediaService → Cloudflare R2, ký ở /api/public/r2-sign).
 *
 * KHÔNG lưu file vào Supabase; chỉ trả URL để lưu vào JSONB nội dung.
 */
import { useId, useState } from "react";
import { toast } from "sonner";
import { uploadMediaUrl } from "@/lib/media";

export function MediaUploadButton({
  label = "⬆️ Tải Icon / GIF lên",
  accept = "image/*",
  folder = "community",
  onUploaded,
  compact = false,
}: {
  label?: string;
  accept?: string;
  folder?: string;
  onUploaded: (url: string) => void;
  compact?: boolean;
}) {
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setPct(0);
    try {
      const url = await uploadMediaUrl(file, {
        kind: "other",
        folder,
        compress: false,
        onProgress: setPct,
      });
      onUploaded(url);
      toast.success("Đã tải lên thành công.");
    } catch (e: any) {
      toast.error("Tải lên thất bại: " + (e?.message || "lỗi không xác định"));
    } finally {
      setBusy(false);
      setPct(0);
    }
  };

  return (
    <>
      <input
        id={id}
        type="file"
        accept={accept}
        hidden
        onChange={(e) => {
          void pick(e.target.files?.[0]);
          e.currentTarget.value = "";
        }}
      />
      <label
        htmlFor={id}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: compact ? "5px 10px" : "8px 14px",
          borderRadius: 10,
          border: "1px dashed rgba(120,120,140,0.45)",
          fontSize: compact ? 12.5 : 13,
          fontWeight: 700,
          cursor: busy ? "progress" : "pointer",
          opacity: busy ? 0.6 : 1,
          whiteSpace: "nowrap",
        }}
      >
        {busy ? `Đang tải… ${pct}%` : label}
      </label>
    </>
  );
}

export default MediaUploadButton;
