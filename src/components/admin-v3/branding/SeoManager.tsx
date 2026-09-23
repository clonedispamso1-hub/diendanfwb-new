/**
 * Admin → Cài đặt → SEO Website.
 * Chỉnh tiêu đề SEO, mô tả, từ khoá, ảnh chia sẻ — lưu ở Supabase 4 (site_branding).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  DEFAULT_SEO_DESCRIPTION,
  DEFAULT_SEO_TITLE,
  fetchBranding,
  saveBranding,
  uploadBrandingImage,
} from "@/lib/site/branding";

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

const field: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(120,120,140,0.3)",
  background: "transparent",
  color: "inherit",
  fontSize: 14,
};

export function SeoManager() {
  const [title, setTitle] = useState(DEFAULT_SEO_TITLE);
  const [desc, setDesc] = useState(DEFAULT_SEO_DESCRIPTION);
  const [keywords, setKeywords] = useState("");
  const [ogImage, setOgImage] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const b = await fetchBranding(true);
    setTitle(b.seo_title);
    setDesc(b.seo_description);
    setKeywords(b.seo_keywords);
    setOgImage(b.og_image_url);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onSave = async () => {
    setBusy(true);
    try {
      await saveBranding({
        seo_title: title.trim() || DEFAULT_SEO_TITLE,
        seo_description: desc.trim() || DEFAULT_SEO_DESCRIPTION,
        seo_keywords: keywords.trim(),
        og_image_url: ogImage.trim(),
      });
      toast.success("Đã lưu SEO cho toàn website.");
    } catch (e: any) {
      toast.error("Lưu SEO thất bại: " + (e?.message || "lỗi không xác định"));
    } finally {
      setBusy(false);
    }
  };

  const onPickOg = async (file: File | null) => {
    if (!file) return;
    if (!/^image\//.test(file.type)) {
      toast.error("Chỉ chấp nhận tệp ảnh.");
      return;
    }
    setBusy(true);
    try {
      const url = await uploadBrandingImage(file, "og");
      setOgImage(url);
      await saveBranding({ og_image_url: url });
      toast.success("Đã cập nhật ảnh chia sẻ.");
    } catch (e: any) {
      toast.error("Tải ảnh thất bại: " + (e?.message || "lỗi không xác định"));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div style={{ padding: 20, maxWidth: 760 }}>
      <h2 style={{ margin: "0 0 6px", fontSize: 20, fontWeight: 800 }}>🔎 SEO Website</h2>
      <p style={{ margin: "0 0 18px", opacity: 0.7, fontSize: 13.5 }}>
        Tiêu đề và mô tả này hiển thị trên Google, Facebook, Zalo và tab trình duyệt. Lưu là áp
        dụng ngay cho toàn website, không cần build lại.
      </p>

      <div style={box}>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>SEO Title ({title.length} ký tự)</span>
          <input
            style={field}
            value={title}
            maxLength={120}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Kết Nối FWB, ONS Uy Tín – Nhanh Chóng, Kín Đáo, An Toàn"
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>
            Meta Description ({desc.length} ký tự)
          </span>
          <textarea
            style={{ ...field, minHeight: 90, resize: "vertical" }}
            value={desc}
            maxLength={320}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Nền tảng kết nối FWB, ONS uy tín hàng đầu hiện nay…"
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>Từ khoá (cách nhau bằng dấu phẩy)</span>
          <input
            style={field}
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="fwb, ons, kết bạn, hẹn hò"
          />
        </label>

        <div style={{ display: "grid", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>Ảnh chia sẻ (Facebook / Zalo)</span>
          {ogImage ? (
            <img
              src={ogImage}
              alt="Ảnh chia sẻ"
              style={{ maxWidth: 320, borderRadius: 10, border: "1px solid rgba(120,120,140,.3)" }}
            />
          ) : (
            <span style={{ opacity: 0.7, fontSize: 12.5 }}>
              Chưa đặt — hệ thống dùng logo website.
            </span>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => void onPickOg(e.target.files?.[0] ?? null)}
          />
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button style={btn} disabled={busy} onClick={() => fileRef.current?.click()}>
              {ogImage ? "Thay ảnh chia sẻ" : "Tải ảnh chia sẻ"}
            </button>
            {ogImage ? (
              <button
                style={btn}
                disabled={busy}
                onClick={() => {
                  setOgImage("");
                  void saveBranding({ og_image_url: "" });
                }}
              >
                Xoá ảnh chia sẻ
              </button>
            ) : null}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button style={{ ...btn, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={() => void onSave()}>
            {busy ? "Đang lưu…" : "Lưu SEO"}
          </button>
          <button
            style={btn}
            disabled={busy}
            onClick={() => {
              setTitle(DEFAULT_SEO_TITLE);
              setDesc(DEFAULT_SEO_DESCRIPTION);
              setKeywords("");
            }}
          >
            Khôi phục mặc định
          </button>
          <button style={btn} disabled={busy} onClick={() => void load()}>
            Làm mới
          </button>
        </div>
      </div>
    </div>
  );
}

export default SeoManager;
