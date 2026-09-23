/**
 * Admin Panel → "Nhóm Zalo Mồi" → khu vực "Icon Zalo nổi".
 * Quản lý ảnh + Bật/Tắt icon Zalo nổi ở góc Trang Chủ (lưu trên Supabase #4).
 * KHÔNG thay đổi logic Popup Nhóm Zalo.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ImageUp, Trash2 } from "lucide-react";
import {
  getZaloFloatIcon,
  saveZaloFloatIcon,
  uploadZaloFloatIcon,
} from "@/lib/zalo-float-icon";

const card: React.CSSProperties = {
  border: "1px solid rgba(120,120,140,0.25)",
  borderRadius: 14,
  padding: 14,
  display: "grid",
  gap: 12,
};
const btn = (bg: string): React.CSSProperties => ({
  border: 0,
  borderRadius: 10,
  padding: "9px 14px",
  background: bg,
  color: "#fff",
  fontWeight: 700,
  fontSize: 13,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
});

export function ZaloFloatIconManager() {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const s = await getZaloFloatIcon();
      setImageUrl(s.image_url);
      setEnabled(s.enabled);
      setErr(null);
    } catch (e: any) {
      setErr(e?.message || "Lỗi tải cấu hình");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const pick = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Chỉ chọn tệp ảnh.");
      return;
    }
    setBusy(true);
    try {
      const url = await uploadZaloFloatIcon(file);
      await saveZaloFloatIcon({ image_url: url });
      setImageUrl(url);
      toast.success("Đã cập nhật ảnh icon Zalo nổi.");
    } catch (e: any) {
      toast.error(e?.message || "Không tải được ảnh.");
    }
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const toggle = async () => {
    const next = !enabled;
    setBusy(true);
    try {
      await saveZaloFloatIcon({ enabled: next });
      setEnabled(next);
      toast.success(next ? "Đã bật icon Zalo nổi." : "Đã tắt icon Zalo nổi.");
    } catch (e: any) {
      toast.error(e?.message || "Không lưu được trạng thái.");
    }
    setBusy(false);
  };

  const clearImage = async () => {
    if (!window.confirm("Xoá ảnh icon và dùng lại icon Zalo mặc định?")) return;
    setBusy(true);
    try {
      await saveZaloFloatIcon({ image_url: null });
      setImageUrl(null);
      toast.success("Đã xoá ảnh, quay lại icon mặc định.");
    } catch (e: any) {
      toast.error(e?.message || "Không xoá được ảnh.");
    }
    setBusy(false);
  };

  return (
    <div style={card}>
      <div>
        <strong style={{ fontSize: 14 }}>Icon Zalo nổi</strong>
        <p style={{ margin: "4px 0 0", fontSize: 12.5, opacity: 0.7 }}>
          Ảnh tải lên sẽ thay thế hoàn toàn icon Zalo mặc định đang nổi ở góc Trang Chủ. Vị trí,
          kích thước và hành vi click (mở Popup Nhóm Zalo) giữ nguyên.
        </p>
      </div>

      {loading ? <p style={{ fontSize: 13, opacity: 0.7 }}>Đang tải…</p> : null}
      {err ? (
        <p style={{ fontSize: 13, color: "#ef4444" }}>
          {err} — hãy chạy file supabase-sql/SB4/2026-09-18_zalo_float_icon.sql trong SQL Editor của
          Supabase 4.
        </p>
      ) : null}

      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: "50%",
            display: "grid",
            placeItems: "center",
            background: "rgba(120,120,140,0.18)",
            overflow: "hidden",
            fontSize: 11,
            opacity: enabled ? 1 : 0.45,
          }}
        >
          {imageUrl ? (
            <img
              src={imageUrl}
              alt="Icon Zalo nổi"
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <span style={{ opacity: 0.7, textAlign: "center" }}>Mặc định</span>
          )}
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              style={btn("#0ea5e9")}
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              <ImageUp size={15} /> {busy ? "Đang xử lý…" : imageUrl ? "Đổi ảnh" : "Tải ảnh lên"}
            </button>
            <button
              type="button"
              style={btn(enabled ? "#16a34a" : "#64748b")}
              disabled={busy}
              onClick={() => void toggle()}
            >
              {enabled ? "Đang BẬT — bấm để Tắt" : "Đang TẮT — bấm để Bật"}
            </button>
            {imageUrl ? (
              <button
                type="button"
                style={btn("#ef4444")}
                disabled={busy}
                onClick={() => void clearImage()}
              >
                <Trash2 size={14} /> Xoá ảnh
              </button>
            ) : null}
          </div>
          <span style={{ fontSize: 12, opacity: 0.65 }}>
            {enabled
              ? "Icon đang hiển thị trên Trang Chủ."
              : "Icon đang bị ẩn hoàn toàn khỏi Trang Chủ."}
          </span>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => void pick(e.target.files?.[0] ?? null)}
      />
    </div>
  );
}

export default ZaloFloatIconManager;
