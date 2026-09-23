/**
 * Admin Panel → "Quản Lý Album".
 *
 * - Chọn 1 "Tài khoản thứ hai" (đúng danh sách của module Tài khoản thứ hai,
 *   Supabase #1 qua RPC admin_list_internal_accounts) để ĐỨNG TÊN Album.
 *   Ưu tiên tài khoản nữ lên trước. Chỉ hiện Avatar + Tên + GIF/badge.
 * - Nhập tiêu đề + số hiển thị (views / ảnh / video) + upload 1 ảnh cover.
 * - Ảnh cover và dữ liệu Album lưu trên SUPABASE #4 (supabase-sql/SB4/2026-09-21_albums.sql).
 * - KHÔNG lấy / copy bài viết của tài khoản thứ hai.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Eye, EyeOff, ImagePlus, Images, Pencil, Plus, Save, Trash2, Video, X } from "lucide-react";
import { fetchCloneList, type CloneListRow } from "@/lib/admin/clone-list-cache";
import { UserDisplayName } from "@/components/vip/user-display-name";
import { avatarSrc } from "@/lib/image-cdn";
import {
  createAlbum,
  deleteAlbum,
  formatDisplayCount,
  formatThousands,
  listAlbumsAdmin,
  setAlbumEnabled,
  updateAlbum,
  uploadAlbumCover,
  type Album,
} from "@/lib/albums";

const shell: React.CSSProperties = {
  border: "1px solid rgba(120,120,140,0.25)",
  borderRadius: 14,
  padding: 14,
  display: "grid",
  gap: 12,
};
const box: React.CSSProperties = {
  border: "1px solid rgba(120,120,140,0.22)",
  borderRadius: 12,
  padding: 12,
  display: "grid",
  gap: 10,
};
const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 11px",
  borderRadius: 10,
  border: "1px solid rgba(120,120,140,0.3)",
  background: "transparent",
  color: "inherit",
  fontSize: 14,
};
const btn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "8px 12px",
  borderRadius: 10,
  border: "1px solid rgba(120,120,140,0.3)",
  background: "transparent",
  color: "inherit",
  fontSize: 13,
  cursor: "pointer",
};
const label: React.CSSProperties = { fontSize: 12, opacity: 0.7 };

type Owner = { id: string; username: string; name: string; avatar: string | null; female: boolean };

function toOwner(r: CloneListRow): Owner {
  const g = String((r as any).gender ?? "").toLowerCase();
  return {
    id: String(r.id),
    username: String(r.username ?? ""),
    name: String((r as any).full_name || r.username || "Người dùng"),
    avatar: ((r as any).avatar ?? null) as string | null,
    female: g === "female" || g === "nữ" || g === "nu" || g === "f",
  };
}

function OwnerChip({ owner, size = 28 }: { owner: Owner; size?: number }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}>
      {owner.avatar ? (
        <img
          src={avatarSrc(owner.avatar, size)}
          alt=""
          width={size}
          height={size}
          style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flex: "0 0 auto" }}
        />
      ) : (
        <span
          style={{
            width: size,
            height: size,
            borderRadius: "50%",
            background: "rgba(120,120,140,0.25)",
            flex: "0 0 auto",
          }}
        />
      )}
      <UserDisplayName
        userId={owner.id}
        name={owner.name}
        badgeSize={16}
        nameClassName="truncate"
        style={{ fontSize: 13, fontWeight: 600, minWidth: 0 }}
      />
    </span>
  );
}

const numeric = (v: string) => Math.max(0, Math.floor(Number(String(v).replace(/[^\d]/g, "")) || 0));

export function AlbumsManager() {
  const [owners, setOwners] = useState<Owner[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // form
  const [ownerId, setOwnerId] = useState("");
  const [title, setTitle] = useState("");
  const [views, setViews] = useState("");
  const [photos, setPhotos] = useState("");
  const [videos, setVideos] = useState("");
  const [price, setPrice] = useState("");
  const [fakeBuys, setFakeBuys] = useState("");
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const reloadAlbums = useCallback(async () => {
    try {
      setAlbums(await listAlbumsAdmin());
      setErr(null);
    } catch (e: any) {
      setErr(e?.message || String(e));
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const rows = await fetchCloneList({ limit: 10000 });
        if (!alive) return;
        const list = rows.map(toOwner);
        list.sort((a, b) =>
          a.female === b.female ? a.name.localeCompare(b.name, "vi") : a.female ? -1 : 1,
        );
        setOwners(list);
      } catch (e: any) {
        if (alive) toast.error(`Không tải được Tài khoản thứ hai: ${e?.message || e}`);
      }
      await reloadAlbums();
      if (alive) setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [reloadAlbums]);

  const selectedOwner = useMemo(() => owners.find((o) => o.id === ownerId) || null, [owners, ownerId]);

  const resetForm = () => {
    setEditingId(null);
    setOwnerId("");
    setTitle("");
    setViews("");
    setPhotos("");
    setVideos("");
    setPrice("");
    setFakeBuys("");
    setCoverUrl(null);
  };

  const onPickCover = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Chỉ nhận tệp ảnh");
      return;
    }
    setUploading(true);
    try {
      setCoverUrl(await uploadAlbumCover(file));
      toast.success("Đã nén và tải ảnh cover lên Supabase #4");
    } catch (e: any) {
      toast.error(`Tải ảnh thất bại: ${e?.message || e}`);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const submit = async () => {
    if (!selectedOwner) return toast.error("Hãy chọn Tài khoản thứ hai đứng tên Album");
    if (!title.trim()) return toast.error("Hãy nhập tiêu đề Album");
    if (!coverUrl) return toast.error("Hãy tải lên 1 ảnh cover");
    setSaving(true);
    try {
      const payload = {
        owner_id: selectedOwner.id,
        owner_username: selectedOwner.username,
        owner_name: selectedOwner.name,
        owner_avatar: selectedOwner.avatar,
        title: title.trim(),
        cover_url: coverUrl,
        view_count: numeric(views),
        photo_count: numeric(photos),
        video_count: numeric(videos),
        price: numeric(price),
        fake_purchase_count: numeric(fakeBuys),
      };
      if (editingId) {
        await updateAlbum(editingId, payload);
        toast.success("Đã lưu Album");
      } else {
        await createAlbum(payload);
        toast.success("Đã tạo Album");
      }
      resetForm();
      await reloadAlbums();
    } catch (e: any) {
      toast.error(`Lưu thất bại: ${e?.message || e}`);
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (a: Album) => {
    setEditingId(a.id);
    setOwnerId(a.owner_id);
    setTitle(a.title);
    setViews(String(a.view_count));
    setPhotos(String(a.photo_count));
    setVideos(String(a.video_count));
    setPrice(a.price ? String(a.price) : "");
    setFakeBuys(a.fake_purchase_count ? String(a.fake_purchase_count) : "");
    setCoverUrl(a.cover_url);
  };

  const remove = async (a: Album) => {
    if (!window.confirm(`Xóa Album "${a.title}"?`)) return;
    try {
      await deleteAlbum(a.id);
      setAlbums((prev) => prev.filter((x) => x.id !== a.id));
      if (editingId === a.id) resetForm();
      toast.success("Đã xóa Album");
    } catch (e: any) {
      toast.error(`Xóa thất bại: ${e?.message || e}`);
    }
  };

  const toggle = async (a: Album) => {
    try {
      await setAlbumEnabled(a.id, !a.enabled);
      setAlbums((prev) => prev.map((x) => (x.id === a.id ? { ...x, enabled: !a.enabled } : x)));
    } catch (e: any) {
      toast.error(`Không đổi được trạng thái: ${e?.message || e}`);
    }
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Images size={18} />
        <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>Quản Lý Album</h2>
      </div>

      {err && (
        <div style={{ ...box, borderColor: "rgba(220,80,80,0.5)", fontSize: 13 }}>
          {err} — hãy chạy <code>supabase-sql/SB4/2026-09-21_albums.sql</code> trên Supabase #4.
        </div>
      )}

      {/* FORM */}
      <div style={shell}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>
          {editingId ? "Sửa Album" : "Tạo Album mới"}
        </div>

        <div style={box}>
          <div style={label}>Tài khoản thứ hai đứng tên Album (nữ hiển thị trước)</div>
          <select
            value={ownerId}
            onChange={(e) => setOwnerId(e.target.value)}
            style={{ ...inputStyle, maxWidth: 420 }}
          >
            <option value="">— Chọn tài khoản thứ hai —</option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.female ? "♀ " : "♂ "}
                {o.name}
              </option>
            ))}
          </select>
          {selectedOwner && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={label}>Đứng tên:</span>
              <OwnerChip owner={selectedOwner} />
            </div>
          )}
        </div>

        <div style={box}>
          <div style={label}>Tiêu đề Album</div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Tiêu đề Album"
            style={inputStyle}
          />
        </div>

        <div style={box}>
          <div style={label}>Ảnh cover (1 ảnh duy nhất — lưu trên Supabase #4)</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            {coverUrl ? (
              <div style={{ position: "relative" }}>
                <img
                  src={coverUrl}
                  alt=""
                  style={{ width: 120, height: 120, borderRadius: 12, objectFit: "cover" }}
                />
                <button
                  type="button"
                  onClick={() => setCoverUrl(null)}
                  aria-label="Bỏ ảnh cover"
                  style={{ ...btn, position: "absolute", top: 4, right: 4, padding: 4, borderRadius: 999 }}
                >
                  <X size={13} />
                </button>
              </div>
            ) : (
              <div
                style={{
                  width: 120,
                  height: 120,
                  borderRadius: 12,
                  border: "1px dashed rgba(120,120,140,0.4)",
                  display: "grid",
                  placeItems: "center",
                  opacity: 0.6,
                }}
              >
                <ImagePlus size={20} />
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={(e) => void onPickCover(e.target.files?.[0] ?? null)}
              style={{ display: "none" }}
            />
            <button
              type="button"
              style={btn}
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              <ImagePlus size={14} />
              {uploading ? "Đang tải…" : coverUrl ? "Đổi ảnh cover" : "Chọn ảnh cover"}
            </button>
          </div>
        </div>

        <div style={{ ...box, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
          <div>
            <div style={label}>Số lượt xem hiển thị</div>
            <input
              value={views}
              onChange={(e) => setViews(e.target.value.replace(/[^\d]/g, ""))}
              inputMode="numeric"
              placeholder="1000"
              style={inputStyle}
            />
            <div style={{ ...label, marginTop: 4 }}>Hiển thị: {formatDisplayCount(numeric(views))}</div>
          </div>
          <div>
            <div style={label}>Số lượng ảnh hiển thị</div>
            <input
              value={photos}
              onChange={(e) => setPhotos(e.target.value.replace(/[^\d]/g, ""))}
              inputMode="numeric"
              placeholder="120"
              style={inputStyle}
            />
            <div style={{ ...label, marginTop: 4 }}>Hiển thị: {formatDisplayCount(numeric(photos))}</div>
          </div>
          <div>
            <div style={label}>Số lượng video hiển thị</div>
            <input
              value={videos}
              onChange={(e) => setVideos(e.target.value.replace(/[^\d]/g, ""))}
              inputMode="numeric"
              placeholder="8"
              style={inputStyle}
            />
            <div style={{ ...label, marginTop: 4 }}>Hiển thị: {formatDisplayCount(numeric(videos))}</div>
          </div>
          <div>
            <div style={label}>Giá (Xu)</div>
            <input
              value={formatThousands(price)}
              onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, "").replace(/^0+(?=\d)/, ""))}
              inputMode="numeric"
              placeholder="20,000"
              style={inputStyle}
            />
            <div style={{ ...label, marginTop: 4 }}>
              {numeric(price) > 0 ? `Album có phí: ${formatThousands(numeric(price))} Xu` : "Để trống hoặc 0 = Album miễn phí"}
            </div>
          </div>
          <div>
            <div style={label}>Lượt mua ảo</div>
            <input
              value={fakeBuys}
              onChange={(e) => setFakeBuys(e.target.value.replace(/[^\d]/g, ""))}
              inputMode="numeric"
              placeholder="120"
              style={inputStyle}
            />
            <div style={{ ...label, marginTop: 4 }}>Hiển thị: {numeric(fakeBuys)} lượt mua</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" style={btn} onClick={() => void submit()} disabled={saving}>
            {editingId ? <Save size={14} /> : <Plus size={14} />}
            {saving ? "Đang lưu…" : editingId ? "Lưu Album" : "Tạo Album"}
          </button>
          {editingId && (
            <button type="button" style={btn} onClick={resetForm}>
              <X size={14} />
              Hủy
            </button>
          )}
        </div>
      </div>

      {/* DANH SÁCH */}
      <div style={shell}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>Album đã tạo ({albums.length})</div>
        {loading && <div style={{ opacity: 0.6, fontSize: 13 }}>Đang tải…</div>}
        {!loading && albums.length === 0 && (
          <div style={{ opacity: 0.6, fontSize: 13 }}>Chưa có Album nào.</div>
        )}
        {albums.map((a) => {
          const owner: Owner = {
            id: a.owner_id,
            username: a.owner_username || "",
            name: a.owner_name || a.owner_username || "Người dùng",
            avatar: a.owner_avatar,
            female: false,
          };
          return (
            <div
              key={a.id}
              style={{ ...box, gridTemplateColumns: "76px 1fr auto", alignItems: "center", gap: 12 }}
            >
              {a.cover_url ? (
                <img
                  src={a.cover_url}
                  alt=""
                  style={{ width: 76, height: 76, borderRadius: 10, objectFit: "cover" }}
                />
              ) : (
                <div
                  style={{
                    width: 76,
                    height: 76,
                    borderRadius: 10,
                    background: "rgba(120,120,140,0.2)",
                  }}
                />
              )}
              <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
                <OwnerChip owner={owner} size={24} />
                <div style={{ fontWeight: 600, fontSize: 14 }}>{a.title}</div>
                <div style={{ ...label, display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <span>👁 {formatDisplayCount(a.view_count)}</span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <Images size={12} /> {formatDisplayCount(a.photo_count)}
                  </span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <Video size={12} /> {formatDisplayCount(a.video_count)}
                  </span>
                  <span>{a.price > 0 ? `💰 ${formatThousands(a.price)} Xu` : "Miễn phí"}</span>
                  <span>🛒 {a.fake_purchase_count}</span>
                  <span>{a.created_at ? new Date(a.created_at).toLocaleString("vi-VN") : ""}</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  style={btn}
                  onClick={() => void toggle(a)}
                  title={a.enabled ? "Đang hiển thị" : "Đang ẩn"}
                >
                  {a.enabled ? <Eye size={14} /> : <EyeOff size={14} />}
                  {a.enabled ? "Hiện" : "Ẩn"}
                </button>
                <button type="button" style={btn} onClick={() => startEdit(a)}>
                  <Pencil size={14} />
                  Sửa
                </button>
                <button type="button" style={btn} onClick={() => void remove(a)}>
                  <Trash2 size={14} />
                  Xóa
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default AlbumsManager;
