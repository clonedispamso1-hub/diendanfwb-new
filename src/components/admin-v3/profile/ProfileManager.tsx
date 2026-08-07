import { useState } from "react";
import { Search, Trash2, RefreshCw, Image as ImageIcon, User, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { MediaItem } from "../MediaItem";

type ProfileFull = {
  id: string;
  public_id: string | null;
  full_name: string | null;
  username: string | null;
  phone: string | null;
  avatar: string | null;
  cover_url: string | null;
  title_gif_url: string | null;
  bio: string | null;
  vip_level: number | null;
  is_admin: boolean | null;
  is_banned: boolean | null;
  created_at: string | null;
};

export function ProfileManager() {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<ProfileFull | null>(null);

  const find = async () => {
    const term = q.trim();
    if (!term) return;
    setLoading(true);
    try {
      let pq: any = (supabase.from("profiles") as any)
        .select("id, public_id, full_name, username, phone, avatar, cover_url, title_gif_url, bio, vip_level, is_admin, is_banned, created_at")
        .limit(1);

      if (/^[0-9a-f-]{8,}$/i.test(term)) pq = pq.or(`id.eq.${term},public_id.ilike.%${term}%`);
      else pq = pq.or(`public_id.ilike.%${term}%,username.ilike.%${term}%,full_name.ilike.%${term}%,phone.ilike.%${term}%`);

      const { data, error } = await pq.maybeSingle();
      if (error) throw error;
      if (!data) {
        toast.warning("Không tìm thấy hồ sơ");
        setProfile(null);
      } else {
        setProfile(data as ProfileFull);
      }
    } catch (e: any) {
      toast.error(e?.message || "Lỗi tìm kiếm");
    } finally {
      setLoading(false);
    }
  };

  const patch = async (payload: Partial<ProfileFull>, label: string) => {
    if (!profile) return;
    const { error } = await (supabase.from("profiles") as any).update(payload).eq("id", profile.id);
    if (error) return toast.error(error.message);
    toast.success(label);
    setProfile((p) => (p ? { ...p, ...payload } : p));
  };

  const reset = async () => {
    if (!profile) return;
    if (!window.confirm("Reset toàn bộ media & bio của hồ sơ này?")) return;
    await patch({ avatar: null, cover_url: null, title_gif_url: null, bio: null }, "Đã reset hồ sơ");
  };

  return (
    <div className="admv3-page">
      <div className="admv3-page-head">
        <div>
          <h2 className="admv3-page-title">Quản lý hồ sơ</h2>
          <p className="admv3-page-sub">Xem, xóa avatar/GIF/cover, reset hồ sơ theo UID hoặc tên.</p>
        </div>
      </div>

      <div className="admv3-toolbar">
        <div className="admv3-search admv3-search-lg">
          <Search size={14} />
          <input
            placeholder="Nhập UID / Username / Tên / SĐT rồi Enter…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && find()}
          />
        </div>
        <button className="admv3-btn admv3-btn-primary" onClick={find} disabled={loading}>
          {loading ? "Đang tìm…" : "Tìm hồ sơ"}
        </button>
      </div>

      {profile && (
        <div className="admv3-profile-card">
          <div className="admv3-profile-cover">
            {profile.cover_url ? <img loading="lazy" decoding="async" src={profile.cover_url} alt="cover" /> : <div className="admv3-profile-cover-empty">Chưa có ảnh bìa</div>}
          </div>
          <div className="admv3-profile-body">
            <div className="admv3-profile-avatar">
              {profile.avatar ? <img loading="lazy" decoding="async" src={profile.avatar} alt="avatar" /> : <User size={28} />}
            </div>
            <div className="admv3-profile-main">
              <h3>{profile.full_name || "—"} {profile.is_admin && <span className="admv3-pill admv3-pill-admin">Admin</span>}</h3>
              <div className="admv3-profile-meta">
                <span>@{profile.username || "—"}</span>
                <span className="admv3-mono">{profile.public_id || profile.id.slice(0, 8)}</span>
                <span>📱 {profile.phone || "—"}</span>
                <span>VIP {profile.vip_level ?? 0}</span>
              </div>
              {profile.title_gif_url && (
                <div className="admv3-profile-gif">
                  <span className="admv3-profile-meta-label">GIF danh hiệu:</span>
                  <MediaItem url={profile.title_gif_url} alt="gif" />
                </div>
              )}
            </div>
            <div className="admv3-profile-actions">
              <button className="admv3-btn admv3-btn-ghost" onClick={() => patch({ avatar: null }, "Đã xóa avatar")} disabled={!profile.avatar}>
                <Trash2 size={13} /> Xóa avatar
              </button>
              <button className="admv3-btn admv3-btn-ghost" onClick={() => patch({ title_gif_url: null }, "Đã xóa GIF")} disabled={!profile.title_gif_url}>
                <Sparkles size={13} /> Xóa GIF
              </button>
              <button className="admv3-btn admv3-btn-ghost" onClick={() => patch({ cover_url: null }, "Đã xóa ảnh bìa")} disabled={!profile.cover_url}>
                <ImageIcon size={13} /> Xóa ảnh bìa
              </button>
              <button className="admv3-btn admv3-btn-danger" onClick={reset}>
                <RefreshCw size={13} /> Reset hồ sơ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
