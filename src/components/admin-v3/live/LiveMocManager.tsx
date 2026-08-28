/**
 * Admin — Quản lý Live Móc 🦋.
 * CRUD phòng Live (chỉ dữ liệu, không upload/nhúng video) + link Liên hệ Admin & Cộng đồng VIP.
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { storageDb as supabase } from "@/services/database";
import { supabase as mainDb } from "@/lib/supabase";
import {
  clearLiveSettingsCache,
  fetchLiveRooms,
  fetchLiveSettings,
  uploadLiveThumbnail,
  type LiveMocRoom,
  type LiveMocSettings,
  DEFAULT_LIVE_SETTINGS,
} from "@/lib/live-moc";

type Draft = Omit<LiveMocRoom, "id"> & { id?: string };

const EMPTY: Draft = {
  title: "",
  description: "",
  thumbnail_url: "",
  viewers: 0,
  is_online: true,
  visible: true,
  sort_order: 0,
  contact_url: "",
  vip_url: "",
  started_at: "",
  created_at: "",
  ends_at: "",
  likes: 0,
  comments: 0,
  is_hot: false,
  live_user_id: null,
};

/** ISO -> giá trị cho <input type="datetime-local"> (giờ địa phương). */
function toLocalInput(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}


export function LiveMocManager() {
  const [rooms, setRooms] = useState<LiveMocRoom[]>([]);
  const [settings, setSettings] = useState<LiveMocSettings>(DEFAULT_LIVE_SETTINGS);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  /** Danh sách tài khoản website (DB chính) cho ô "Tài khoản đang Live". */
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data } = await mainDb
        .from("profiles")
        .select("id, full_name, username")
        .order("full_name", { ascending: true })
        .limit(100);
      if (!alive || !data) return;
      setAccounts(
        (data as Record<string, unknown>[]).map((r) => ({
          id: String(r.id),
          name: String(r.full_name || r.username || r.id),
        })),
      );
    })();
    return () => {
      alive = false;
    };
  }, []);

  const onPickThumb = async (file: File | undefined) => {
    if (!file || !draft) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Vui lòng chọn tệp ảnh.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Ảnh tối đa 5MB.");
      return;
    }
    setUploading(true);
    try {
      const url = await uploadLiveThumbnail(file);
      setDraft((d) => (d ? { ...d, thumbnail_url: url } : d));
      toast.success("Đã tải ảnh lên.");
    } catch (err) {
      toast.error("Tải ảnh thất bại: " + (err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const load = useCallback(async () => {
    const [list, cfg] = await Promise.all([fetchLiveRooms(true), fetchLiveSettings(true)]);
    setRooms(list);
    setSettings(cfg);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveSettings = async () => {
    setSaving(true);
    const { error } = await supabase()
      .from("live_moc_settings")
      .upsert({ id: 1, ...settings, updated_at: new Date().toISOString() });
    setSaving(false);
    if (error) {
      toast.error("Lưu thất bại: " + error.message);
      return;
    }
    clearLiveSettingsCache();
    toast.success("Đã lưu link Liên hệ Admin / Cộng đồng VIP.");
  };

  const saveRoom = async () => {
    if (!draft) return;
    if (!draft.title.trim()) {
      toast.error("Vui lòng nhập tiêu đề phòng.");
      return;
    }
    setSaving(true);
    const payload = {
      title: draft.title.trim(),
      description: draft.description.trim(),
      thumbnail_url: draft.thumbnail_url.trim(),
      viewers: Number(draft.viewers) || 0,
      is_online: draft.is_online,
      visible: draft.visible,
      sort_order: Number(draft.sort_order) || 0,
      contact_url: draft.contact_url.trim(),
      vip_url: draft.vip_url.trim(),
      // GIỮ NGUYÊN mốc bắt đầu Live khi sửa phòng (sửa xong KHÔNG reset bộ đếm).
      // Chỉ đặt mốc mới khi tạo phòng hoặc khi bấm "Bắt đầu Live lại".
      started_at: draft.started_at
        ? new Date(draft.started_at).toISOString()
        : new Date().toISOString(),
      ends_at: draft.ends_at ? new Date(draft.ends_at).toISOString() : null,
      likes: Number(draft.likes) || 0,
      comments: Number(draft.comments) || 0,
      is_hot: draft.is_hot,
      live_user_id: draft.live_user_id || null,

    };
    const { error } = draft.id
      ? await supabase().from("live_moc_rooms").update(payload).eq("id", draft.id)
      : await supabase().from("live_moc_rooms").insert(payload);
    setSaving(false);
    if (error) {
      toast.error("Lưu thất bại: " + error.message);
      return;
    }
    toast.success(draft.id ? "Đã cập nhật phòng." : "Đã thêm phòng.");
    setDraft(null);
    void load();
  };

  const toggleVisible = async (room: LiveMocRoom) => {
    const { error } = await supabase()
      .from("live_moc_rooms")
      .update({ visible: !room.visible })
      .eq("id", room.id);
    if (error) toast.error("Không đổi được trạng thái: " + error.message);
    else void load();
  };

  const removeRoom = async (room: LiveMocRoom) => {
    if (!window.confirm(`Xóa phòng "${room.title}"?`)) return;
    const { error } = await supabase().from("live_moc_rooms").delete().eq("id", room.id);
    if (error) toast.error("Xóa thất bại: " + error.message);
    else {
      toast.success("Đã xóa phòng.");
      void load();
    }
  };

  const field = (
    label: string,
    value: string | number,
    onChange: (v: string) => void,
    type: "text" | "number" = "text",
  ) => (
    <label style={{ display: "grid", gap: 4, fontSize: 13, fontWeight: 600 }}>
      <span>{label}</span>
      <input
        className="admv3-input"
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          padding: "8px 10px",
          borderRadius: 10,
          border: "1px solid rgba(148,163,184,.4)",
          background: "transparent",
          color: "inherit",
          fontWeight: 500,
        }}
      />
    </label>
  );

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <section
        style={{
          border: "1px solid rgba(148,163,184,.28)",
          borderRadius: 16,
          padding: 16,
          display: "grid",
          gap: 12,
        }}
      >
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>Link chung</h3>
        {field("Link Liên hệ Admin (Zalo / Facebook / Messenger)", settings.admin_contact_url, (v) =>
          setSettings({ ...settings, admin_contact_url: v }),
        )}
        {field("Link Cộng đồng VIP", settings.vip_community_url, (v) =>
          setSettings({ ...settings, vip_community_url: v }),
        )}
        <div>
          <button className="admv3-btn" disabled={saving} onClick={() => void saveSettings()}>
            Lưu link
          </button>
        </div>
      </section>

      <section
        style={{
          border: "1px solid rgba(148,163,184,.28)",
          borderRadius: 16,
          padding: 16,
          display: "grid",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>
            Phòng Live ({rooms.length})
          </h3>
          <button className="admv3-btn" onClick={() => setDraft({ ...EMPTY })}>
            + Thêm phòng
          </button>
        </div>

        {draft ? (
          <div
            style={{
              display: "grid",
              gap: 10,
              padding: 14,
              borderRadius: 14,
              background: "rgba(14,165,233,.07)",
            }}
          >
            {field("Tiêu đề", draft.title, (v) => setDraft({ ...draft, title: v }))}
            {field("Mô tả ngắn", draft.description, (v) => setDraft({ ...draft, description: v }))}
            <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 600 }}>
              <span>Ảnh thumbnail (tải trực tiếp lên Supabase #2)</span>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <div
                  style={{
                    width: 96,
                    height: 54,
                    borderRadius: 10,
                    overflow: "hidden",
                    background: "rgba(148,163,184,.25)",
                    flexShrink: 0,
                  }}
                >
                  {draft.thumbnail_url ? (
                    <img
                      src={draft.thumbnail_url}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : null}
                </div>
                <input
                  type="file"
                  accept="image/*"
                  disabled={uploading}
                  onChange={(e) => void onPickThumb(e.target.files?.[0])}
                  style={{ fontSize: 12.5, fontWeight: 500 }}
                />
                {uploading ? <span style={{ fontSize: 12 }}>Đang tải…</span> : null}
                {draft.thumbnail_url && !uploading ? (
                  <button
                    className="admv3-btn admv3-btn-ghost"
                    onClick={() => setDraft({ ...draft, thumbnail_url: "" })}
                  >
                    Xóa ảnh
                  </button>
                ) : null}
              </div>
            </label>
            {field("Số người xem", draft.viewers, (v) => setDraft({ ...draft, viewers: Number(v) }), "number")}
            <label style={{ display: "grid", gap: 4, fontSize: 13, fontWeight: 600 }}>
              <span>Tài khoản đang Live (hiện badge 🔴 LIVE toàn website)</span>
              <select
                className="admv3-input"
                value={draft.live_user_id ?? ""}
                onChange={(e) => setDraft({ ...draft, live_user_id: e.target.value || null })}
                style={{
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid rgba(148,163,184,.4)",
                  background: "transparent",
                  color: "inherit",
                  fontWeight: 500,
                }}
              >
                <option value="">— Không gắn tài khoản —</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            {field("Thứ tự hiển thị", draft.sort_order, (v) => setDraft({ ...draft, sort_order: Number(v) }), "number")}
            {field("Link liên hệ Admin (riêng phòng, để trống dùng link chung)", draft.contact_url, (v) =>
              setDraft({ ...draft, contact_url: v }),
            )}
            {field("Link cộng đồng VIP (riêng phòng)", draft.vip_url, (v) =>
              setDraft({ ...draft, vip_url: v }),
            )}
            <label style={{ display: "grid", gap: 4, fontSize: 13, fontWeight: 600 }}>
              <span>Thời gian kết thúc Live (hết giờ này phòng tự ẩn khỏi website)</span>
              <input
                className="admv3-input"
                type="datetime-local"
                value={toLocalInput(draft.ends_at)}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    ends_at: e.target.value ? new Date(e.target.value).toISOString() : "",
                  })
                }
                style={{
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid rgba(148,163,184,.4)",
                  background: "transparent",
                  color: "inherit",
                  fontWeight: 500,
                }}
              />
            </label>

            {field("Lượt thích", draft.likes, (v) => setDraft({ ...draft, likes: Number(v) }), "number")}
            {field("Bình luận", draft.comments, (v) => setDraft({ ...draft, comments: Number(v) }), "number")}
            <div
              style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
                flexWrap: "wrap",
                fontSize: 12.5,
                fontWeight: 600,
              }}
            >
              <span>
                Bắt đầu Live:{" "}
                {draft.started_at
                  ? new Date(draft.started_at).toLocaleString("vi-VN")
                  : "chưa đặt (sẽ lấy giờ hiện tại)"}
              </span>
              <button
                className="admv3-btn admv3-btn-ghost"
                onClick={() => setDraft({ ...draft, started_at: new Date().toISOString() })}
              >
                Bắt đầu Live lại từ bây giờ
              </button>
            </div>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
              <input
                type="checkbox"
                checked={draft.is_hot}
                onChange={(e) => setDraft({ ...draft, is_hot: e.target.checked })}
              />
              🔥 Hot hôm nay
            </label>

            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
              <input
                type="checkbox"
                checked={draft.is_online}
                onChange={(e) => setDraft({ ...draft, is_online: e.target.checked })}
              />
              Đang Online (hiện badge LIVE)
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
              <input
                type="checkbox"
                checked={draft.visible}
                onChange={(e) => setDraft({ ...draft, visible: e.target.checked })}
              />
              Hiển thị với người dùng
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="admv3-btn" disabled={saving} onClick={() => void saveRoom()}>
                {draft.id ? "Cập nhật" : "Thêm phòng"}
              </button>
              <button className="admv3-btn admv3-btn-ghost" onClick={() => setDraft(null)}>
                Hủy
              </button>
            </div>
          </div>
        ) : null}

        <div style={{ display: "grid", gap: 8 }}>
          {rooms.map((room) => (
            <div
              key={room.id}
              style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
                padding: 10,
                borderRadius: 12,
                border: "1px solid rgba(148,163,184,.24)",
              }}
            >
              <div
                style={{
                  width: 56,
                  height: 40,
                  borderRadius: 8,
                  overflow: "hidden",
                  background: "rgba(148,163,184,.25)",
                  flexShrink: 0,
                }}
              >
                {room.thumbnail_url ? (
                  <img
                    src={room.thumbnail_url}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : null}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>{room.title}</div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>
                  #{room.sort_order} · {room.viewers} người xem ·{" "}
                  {room.is_online ? "Online" : "Offline"} · {room.visible ? "Đang hiện" : "Đang ẩn"}
                </div>
              </div>
              <button className="admv3-btn admv3-btn-ghost" onClick={() => setDraft({ ...room })}>
                Sửa
              </button>
              <button className="admv3-btn admv3-btn-ghost" onClick={() => void toggleVisible(room)}>
                {room.visible ? "Ẩn" : "Hiện"}
              </button>
              <button className="admv3-btn admv3-btn-ghost" onClick={() => void removeRoom(room)}>
                Xóa
              </button>
            </div>
          ))}
          {rooms.length === 0 ? (
            <div style={{ fontSize: 13, opacity: 0.7 }}>
              Chưa có phòng nào. Nếu vừa cài đặt, hãy chạy file
              <code> supabase/sql/DB2_live_moc_community.sql </code> trên Supabase.
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

export default LiveMocManager;