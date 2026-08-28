import { useEffect, useState } from "react";
import { MapPin, Users, Trash2, MessageCircle, Eye, Pencil } from "lucide-react";
import { toast } from "sonner";
import { loadSuggestedVirtualProfiles, type SuggestCategory, adminUpdateVirtualProfile } from "@/lib/virtual-profiles";
import type { Profile } from "@/lib/app-types";
import UniversalBadge from "@/components/candy/universal-badge";
import { AvatarGlow } from "@/components/candy/avatar-glow";
import { useAuth } from "@/components/candy/auth-provider";
import { supabase } from "@/lib/supabase";
import { resolveUserName } from "@/lib/user-name";

// Admin gate uses profiles.is_admin via useAuth().

interface PeopleYouMayKnowProps {
  province: string | null | undefined;
  onOpenProfile: (id: string) => void;
  onOpenChat?: (id: string) => void;
  category?: SuggestCategory;
}

const CATEGORY_LABEL: Record<SuggestCategory, string> = {
  ons: "Người phù hợp tìm ONS",
  fwb: "Người phù hợp tìm FWB",
  dating: "Người phù hợp tìm Người Yêu",
};

export function PeopleYouMayKnow({ province, onOpenProfile, onOpenChat, category = "ons" }: PeopleYouMayKnowProps) {
  const { isAdmin } = useAuth();
  const canEdit = isAdmin;
  const [list, setList] = useState<Profile[]>([]);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [editName, setEditName] = useState("");
  const [editBio, setEditBio] = useState("");
  const [editAvatar, setEditAvatar] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    loadSuggestedVirtualProfiles(province, 12, category)
      .then((rows) => {
        if (!alive) return;
        const localized = rows.map((p) =>
          (p as any).is_virtual && province
            ? ({ ...p, province, location: province } as Profile)
            : p
        );
        setList(localized);
      })
      .catch(() => { if (alive) setList([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [province, category]);

  const handleDelete = async (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    if (!confirm(`Xóa vĩnh viễn nick "${name}" khỏi database?`)) return;
    const { error } = await supabase.from("profiles").delete().eq("id", id);
    if (error) {
      toast.error("Lỗi xóa: " + error.message);
      return;
    }
    setList((prev) => prev.filter((p) => p.id !== id));
    try {
      Object.keys(localStorage).forEach((k) => {
        if (k.startsWith("vprof.suggest.v1::")) localStorage.removeItem(k);
      });
    } catch { /* ignore */ }
    toast.success(`Đã xóa "${name}"`);
  };

  if (loading) {
    return (
      <div className="panel" style={{ padding: 8 }}>
        <div className="pymk-skeleton">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="pymk-skeleton-card" />
          ))}
        </div>
      </div>
    );
  }

  if (list.length === 0) {
    return null;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 4px" }}>
        <Users size={14} />
        <span style={{ fontWeight: 700, fontSize: "0.9rem" }}>{CATEGORY_LABEL[category]}</span>
        {province ? <span style={{ fontSize: "0.7rem", color: "var(--muted-foreground)" }}>· {province}</span> : null}
      </div>
      <div
        style={{
          display: "flex",
          gap: 10,
          overflowX: "auto",
          padding: "4px 4px 12px",
          scrollSnapType: "x mandatory",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {list.map((p) => (
          <div
            key={p.id}
            className="panel"
            style={{
              flex: "0 0 160px",
              scrollSnapAlign: "start",
              padding: 10,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 6,
              border: "1px solid oklch(0.92 0.05 350)",
              borderRadius: 24,
              background: "var(--card, white)",
              position: "relative",
            }}
          >
            {canEdit ? (
              <>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setEditing(p); setEditName(resolveUserName(p as any, "")); setEditBio(p.bio || ""); setEditAvatar(p.avatar || ""); }}
                  title="Chỉnh sửa nick (Admin)"
                  className="rounded-full"
                  style={{
                    position: "absolute", top: 4, left: 4,
                    background: "oklch(0.7 0.15 280)", color: "white",
                    border: "none", width: 22, height: 22,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: "pointer", zIndex: 2,
                  }}
                >
                  <Pencil size={12} />
                </button>
                <button
                  type="button"
                  onClick={(e) => void handleDelete(e, p.id, resolveUserName(p as any, "?"))}
                  title="Xóa nick này (Admin)"
                  style={{
                    position: "absolute", top: 4, right: 4,
                    background: "oklch(0.55 0.22 25)", color: "white",
                    border: "none", borderRadius: "50%", width: 22, height: 22,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: "pointer", zIndex: 2,
                  }}
                >
                  <Trash2 size={12} />
                </button>
              </>
            ) : null}
            <AvatarGlow
              avatar={p.avatar || null}
              userId={p.id}
              size={70}
              alt={resolveUserName(p as any, "")}
              onClick={() => onOpenProfile(p.id)}
              style={{ border: "2px solid var(--gold-400, gold)", borderRadius: "50%" }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 4, maxWidth: "100%" }}>
              <span style={{ fontSize: "0.78rem", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 110 }}>
                {p.full_name || p.username}
              </span>
              <UniversalBadge profile={p as any} />
            </div>
            {p.province ? (
              <span style={{ fontSize: "0.68rem", color: "var(--muted-foreground)", display: "inline-flex", alignItems: "center", gap: 2 }}>
                <MapPin size={10} /> {p.province}
              </span>
            ) : null}
            <div style={{ display: "flex", gap: 4, width: "100%" }}>
              <button
                type="button"
                onClick={() => onOpenChat?.(p.id)}
                disabled={!onOpenChat}
                style={{
                  flex: 1, fontSize: "0.7rem", padding: "5px 4px", borderRadius: 8,
                  border: "none", cursor: "pointer", fontWeight: 600, color: "white",
                  background: "linear-gradient(135deg, oklch(0.65 0.18 350), oklch(0.6 0.2 320))",
                  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 3,
                }}
              >
                <MessageCircle size={11} /> Nhắn
              </button>
              <button
                type="button"
                onClick={() => onOpenProfile(p.id)}
                style={{
                  flex: 1, fontSize: "0.7rem", padding: "5px 4px", borderRadius: 8,
                  border: "1px solid oklch(0.85 0.05 350)", cursor: "pointer", fontWeight: 600,
                  background: "transparent", color: "var(--foreground)",
                  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 3,
                }}
              >
                <Eye size={11} /> Bài viết
              </button>
            </div>
          </div>
        ))}
      </div>

      {editing ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 animate-in fade-in" onClick={() => setEditing(null)}>
          <div className="w-full max-w-sm rounded-3xl bg-card p-5 shadow-xl space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold inline-flex items-center gap-1.5">
              <Pencil size={16} className="text-fuchsia-500" /> Sửa nhanh nick ảo
            </h3>
            <div className="space-y-2 text-sm">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Tên hiển thị</label>
                <input className="w-full rounded-2xl border bg-background px-3 py-2 text-sm" value={editName} onChange={(e) => setEditName(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Avatar URL</label>
                <input className="w-full rounded-2xl border bg-background px-3 py-2 text-sm" value={editAvatar} onChange={(e) => setEditAvatar(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Bio</label>
                <textarea className="w-full rounded-2xl border bg-background px-3 py-2 text-sm" rows={3} value={editBio} onChange={(e) => setEditBio(e.target.value)} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button className="rounded-2xl border bg-card px-3 py-2 text-sm" onClick={() => setEditing(null)}>Hủy</button>
              <button
                disabled={saving}
                className="rounded-2xl bg-foreground text-background px-3 py-2 text-sm font-semibold disabled:opacity-60"
                onClick={async () => {
                  if (!editing) return;
                  setSaving(true);
                  try {
                    await adminUpdateVirtualProfile(editing.id, { full_name: editName, bio: editBio, avatar: editAvatar });
                    setList((prev) => prev.map((x) => x.id === editing.id ? { ...x, full_name: editName, bio: editBio, avatar: editAvatar } : x));
                    toast.success("Đã cập nhật nick ảo");
                    setEditing(null);
                  } catch (e: any) {
                    toast.error("Lỗi: " + (e?.message || e));
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                {saving ? "Đang lưu…" : "Lưu"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
