/**
 * Admin → Cài đặt → Logo Website.
 * Upload / preview / thay / xoá / khôi phục logo mặc định.
 * Lưu URL ở nguồn DUY NHẤT (site_settings2.site_logo) — toàn site tự cập nhật.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { uploadMedia } from "@/lib/media";
import {
  DEFAULT_LOGO_URL,
  DEFAULT_LOGO_SIZE,
  LOGO_SIZE_MAX,
  LOGO_SIZE_MIN,
  clampLogoSize,
  fetchSiteLogoConfig,
  resetSiteLogo,
  saveSiteLogo,
  saveSiteLogoSize,
} from "@/lib/site/branding";
import { SiteLogo } from "@/components/candy/site-logo";

const box: React.CSSProperties = {
  border: "1px solid rgba(120,120,140,0.25)",
  borderRadius: 14,
  padding: 18,
  display: "grid",
  gap: 14,
};

const btn: React.CSSProperties = {
  padding: "9px 14px",
  borderRadius: 10,
  border: "1px solid rgba(120,120,140,0.3)",
  background: "transparent",
  color: "inherit",
  fontWeight: 700,
  cursor: "pointer",
};

export function LogoManager() {
  const [url, setUrl] = useState<string>(DEFAULT_LOGO_URL);
  const [size, setSize] = useState<number>(DEFAULT_LOGO_SIZE);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const cfg = await fetchSiteLogoConfig(true);
    setUrl(cfg.url);
    setSize(cfg.size);
  }, []);

  /** Đổi kích thước → lưu ngay vào Site Settings (logo_size). */
  const commitSize = useCallback(async (next: number) => {
    const clean = clampLogoSize(next);
    setSize(clean);
    try {
      await saveSiteLogoSize(clean);
      toast.success(`Đã lưu kích thước logo: ${clean}px`);
    } catch (e: any) {
      toast.error("Không lưu được kích thước: " + (e?.message || "lỗi không xác định"));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onPick = async (file: File | null) => {
    if (!file) return;
    if (!/^image\//.test(file.type)) {
      toast.error("Chỉ chấp nhận tệp ảnh (PNG, JPG, WEBP, SVG…).");
      return;
    }
    setBusy(true);
    try {
      const up = await uploadMedia(file, { kind: "banner" });
      await saveSiteLogo(up.secureUrl);
      setUrl(up.secureUrl);
      toast.success("Đã cập nhật logo cho toàn bộ website.");
    } catch (e: any) {
      toast.error("Tải logo thất bại: " + (e?.message || "lỗi không xác định"));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const onReset = async () => {
    setBusy(true);
    try {
      await resetSiteLogo();
      setUrl(DEFAULT_LOGO_URL);
      toast.success("Đã khôi phục logo mặc định.");
    } catch (e: any) {
      toast.error("Không thể khôi phục: " + (e?.message || "lỗi không xác định"));
    } finally {
      setBusy(false);
    }
  };

  const isDefault = url === DEFAULT_LOGO_URL;

  return (
    <div style={{ padding: 20, maxWidth: 720 }}>
      <h2 style={{ margin: "0 0 6px", fontSize: 20, fontWeight: 800 }}>🖼️ Logo Website</h2>
      <p style={{ margin: "0 0 18px", opacity: 0.7, fontSize: 13.5 }}>
        Đây là <strong>nguồn logo duy nhất</strong> của toàn website: Đăng nhập, Đăng ký, Quên mật
        khẩu, Header, Sidebar, Menu, màn hình chờ, trang bị chặn và Admin Panel đều đọc từ đây.
        Lưu xong là cập nhật ngay, <strong>không cần build lại</strong>.
      </p>

      <div style={box}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>Xem trước</div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 20,
            flexWrap: "wrap",
            padding: 18,
            borderRadius: 12,
            background: "rgba(0,0,0,0.65)",
          }}
        >
          <SiteLogo priority alt="Logo website (kích thước hiện tại)" />
          <SiteLogo size={96} alt="Logo website (xem trước lớn)" />
          <SiteLogo size={24} alt="Logo website (kích thước nhỏ)" />
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>
            Kích thước Logo — chiều cao {size}px
          </div>
          <input
            type="range"
            min={LOGO_SIZE_MIN}
            max={LOGO_SIZE_MAX}
            step={1}
            value={size}
            onChange={(e) => setSize(clampLogoSize(e.target.value))}
            onMouseUp={(e) => void commitSize(Number((e.target as HTMLInputElement).value))}
            onTouchEnd={(e) => void commitSize(Number((e.target as HTMLInputElement).value))}
            onKeyUp={(e) => void commitSize(Number((e.target as HTMLInputElement).value))}
            style={{ width: "100%" }}
            aria-label="Kích thước logo (px)"
          />
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button style={btn} disabled={busy} onClick={() => void commitSize(size - 2)}>
              −
            </button>
            <input
              type="number"
              min={LOGO_SIZE_MIN}
              max={LOGO_SIZE_MAX}
              value={size}
              onChange={(e) => setSize(clampLogoSize(e.target.value))}
              onBlur={(e) => void commitSize(Number(e.target.value))}
              style={{
                width: 90,
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid rgba(120,120,140,0.3)",
                background: "transparent",
                color: "inherit",
                fontWeight: 700,
              }}
              aria-label="Chiều cao logo (px)"
            />
            <span style={{ opacity: 0.7, fontSize: 13 }}>px</span>
            <button style={btn} disabled={busy} onClick={() => void commitSize(size + 2)}>
              +
            </button>
            <button style={btn} disabled={busy} onClick={() => void commitSize(DEFAULT_LOGO_SIZE)}>
              Mặc định ({DEFAULT_LOGO_SIZE}px)
            </button>
          </div>
          <div style={{ fontSize: 12.5, opacity: 0.7 }}>
            Giới hạn {LOGO_SIZE_MIN}–{LOGO_SIZE_MAX}px. Lưu là áp dụng ngay cho toàn website
            (Header, Đăng nhập, Đăng ký, Menu, Splash, 404, Admin…), không cần build lại.
          </div>
        </div>

        <div style={{ fontSize: 12.5, opacity: 0.7, wordBreak: "break-all" }}>
          Nguồn hiện tại: {isDefault ? "Logo mặc định" : url}
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => void onPick(e.target.files?.[0] ?? null)}
          />
          <button
            style={{ ...btn, opacity: busy ? 0.6 : 1 }}
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            {busy ? "Đang xử lý…" : isDefault ? "Tải logo lên" : "Thay logo"}
          </button>
          <button
            style={{ ...btn, opacity: busy || isDefault ? 0.5 : 1 }}
            disabled={busy || isDefault}
            onClick={() => void onReset()}
          >
            Xoá logo / Khôi phục mặc định
          </button>
          <button style={btn} disabled={busy} onClick={() => void load()}>
            Làm mới cache
          </button>
        </div>
      </div>
    </div>
  );
}

export default LogoManager;
