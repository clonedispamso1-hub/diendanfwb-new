import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ImagePlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { adminDb } from "@/lib/admin-db";
import { sb4 } from "@/lib/supabase-v4";
import {
  hotAdminListFn, hotDeleteBannerFn, hotSaveBannerFn,
  hotSetBannerFn, hotSignBannerFn, type HotBanner,
} from "@/lib/hot-content.functions";

async function adminToken() {
  const db = await adminDb();
  const { data } = await db.auth.getSession();
  if (!data.session?.access_token) throw new Error("Phiên quản trị đã hết hạn.");
  return data.session.access_token;
}

export function HotContentManager() {
  const [banners, setBanners] = useState<HotBanner[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await hotAdminListFn({ data: { token: await adminToken() } });
      setBanners(result.banners);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không tải được nội dung HOT.");
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const run = async (action: () => Promise<unknown>, message: string) => {
    setBusy(true);
    try {
      await action();
      await load();
      toast.success(message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Thao tác thất bại.");
    } finally {
      setBusy(false);
    }
  };

  const upload = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 10 * 1024 * 1024) {
      toast.error("Chọn ảnh JPG, PNG, WebP hoặc GIF dưới 10 MB.");
      return;
    }
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "jpg" && ext !== "jpeg" && ext !== "png" && ext !== "webp" && ext !== "gif") {
      toast.error("Định dạng ảnh không được hỗ trợ.");
      return;
    }
    await run(async () => {
      const token = await adminToken();
      const signed = await hotSignBannerFn({ data: { token, ext } });
      const { error } = await sb4().storage.from("flash-albums").uploadToSignedUrl(signed.path, signed.uploadToken, file, { contentType: file.type });
      if (error) throw new Error(error.message);
      await hotSaveBannerFn({ data: { token, path: signed.path } });
    }, "Đã cập nhật banner HOT.");
  };


  return (
    <div className="space-y-7 border-t border-border pt-6">
      <section className="space-y-3">
        <h3 className="text-lg font-bold">Banner HOT</h3>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-semibold">
          <ImagePlus size={17} /> {banners.length ? "Thay banner" : "Tải banner"}
          <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" disabled={busy} onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
        {banners.map((banner) => (
          <div key={banner.id} className="flex flex-wrap items-center gap-3 border-b border-border py-3">
            <img src={banner.image_url} alt="Banner HOT" className="max-h-36 max-w-full object-contain" />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={banner.active} disabled={busy} onChange={(e) => void run(async () => hotSetBannerFn({ data: { token: await adminToken(), id: banner.id, active: e.target.checked } }), "Đã cập nhật banner.")} /> Hiển thị</label>
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => { if (window.confirm("Xóa banner này?")) void run(async () => hotDeleteBannerFn({ data: { token: await adminToken(), id: banner.id } }), "Đã xóa banner."); }}><Trash2 size={15} /> Xóa</Button>
          </div>
        ))}
      </section>

      {/* Danh sách Code cũ đã gộp vào ALBUM HOT (flash_albums). Dữ liệu flash_hot_codes vẫn giữ nguyên. */}
    </div>
  );
}