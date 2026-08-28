/**
 * Admin Panel → "Quản lý Nhóm Mồi".
 * Dữ liệu nằm ở Supabase #4 (src/lib/supabase-v4.ts).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Trash2, Plus, FolderPlus, Pencil, X } from "lucide-react";
import { sb4Admin, folderLabel, shortCount, applyLocation, type BaitGroup, type BaitGroupFolder } from "@/lib/supabase-v4";

const field: React.CSSProperties = {
  width: "100%",
  padding: "9px 11px",
  borderRadius: 10,
  border: "1px solid rgba(120,120,140,0.3)",
  background: "transparent",
  color: "inherit",
  fontSize: 13,
};
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

type GroupDraft = {
  id?: string;
  folder_id: string;
  name: string;
  province: string;
  avatar_url: string;
  member_count: string;
  message_count: string;
  preview_text: string;
};

const emptyDraft = (folderId = ""): GroupDraft => ({
  folder_id: folderId,
  name: "",
  province: "",
  avatar_url: "",
  member_count: "",
  message_count: "",
  preview_text: "",
});

export function BaitGroupsManager() {
  const [folders, setFolders] = useState<BaitGroupFolder[]>([]);
  const [groups, setGroups] = useState<BaitGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // form thư mục
  const [fName, setFName] = useState("");
  const [fByLoc, setFByLoc] = useState(false);
  const [fTpl, setFTpl] = useState("Nhóm {location}");

  // form nhóm mồi
  const [draft, setDraft] = useState<GroupDraft>(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const sb = sb4Admin();
    const [f, g] = await Promise.all([
      sb.from("bait_group_folders").select("*").order("sort_order").order("created_at"),
      sb.from("bait_groups").select("*").order("sort_order").order("created_at"),
    ]);
    if (f.error || g.error) setErr((f.error || g.error)?.message || "Lỗi tải dữ liệu");
    else setErr(null);
    setFolders((f.data as BaitGroupFolder[]) || []);
    setGroups((g.data as BaitGroup[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Tự chọn thư mục đầu tiên nếu admin chưa chọn (tránh lỗi foreign key).
  useEffect(() => {
    if (!folders.length) return;
    setDraft((d) =>
      d.folder_id && folders.some((f) => f.id === d.folder_id) ? d : { ...d, folder_id: folders[0]!.id },
    );
  }, [folders]);

  const folderById = useMemo(
    () => new Map(folders.map((f) => [f.id, f] as const)),
    [folders],
  );

  const createFolder = async () => {
    if (!fName.trim() && !fByLoc) return toast.error("Nhập tên thư mục.");
    const { error } = await sb4Admin().from("bait_group_folders").insert({
      name: fName.trim() || "Nhóm theo khu vực",
      by_location: fByLoc,
      name_template: fByLoc ? fTpl.trim() || "Nhóm {location}" : null,
      sort_order: folders.length,
    });
    if (error) return toast.error("Lỗi: " + error.message);
    setFName(""); setFByLoc(false); setFTpl("Nhóm {location}");
    toast.success("Đã tạo thư mục.");
    void load();
  };

  const removeFolder = async (id: string) => {
    if (!confirm("Xoá thư mục và toàn bộ nhóm mồi bên trong?")) return;
    const { error } = await sb4Admin().from("bait_group_folders").delete().eq("id", id);
    if (error) return toast.error("Lỗi: " + error.message);
    toast.success("Đã xoá thư mục.");
    void load();
  };

  const uploadAvatar = async (file: File) => {
    setUploading(true);
    try {
      const path = `${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
      const sb = sb4Admin();
      const { error } = await sb.storage.from("bait-groups").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data } = sb.storage.from("bait-groups").getPublicUrl(path);
      setDraft((d) => ({ ...d, avatar_url: data.publicUrl }));
      toast.success("Đã tải avatar lên.");
    } catch (e: any) {
      toast.error("Upload lỗi: " + (e?.message || "không xác định"));
    } finally {
      setUploading(false);
    }
  };

  const saveGroup = async () => {
    const folder = folderById.get(draft.folder_id);
    if (!draft.folder_id || !folder) return toast.error("Vui lòng chọn Thư mục trước!");
    if (!draft.name.trim()) return toast.error("Nhập tên nhóm.");
    setSaving(true);
    // Thư mục theo khu vực mà tên chưa có {location} → tự gắn thêm.
    let name = draft.name.trim();
    if (folder.by_location && !/\{location\}/i.test(name)) name = `${name} {location}`;
    const payload = {
      folder_id: folder.id,
      name,
      province: null,
      avatar_url: draft.avatar_url.trim() || null,
      member_count: Number(draft.member_count) || 0,
      message_count: Number(draft.message_count) || 0,
      preview_text: draft.preview_text.trim() || null,
    };
    const sb = sb4Admin();
    const { error } = draft.id
      ? await sb.from("bait_groups").update(payload).eq("id", draft.id)
      : await sb.from("bait_groups").insert({ ...payload, sort_order: groups.length });
    setSaving(false);
    if (error) return toast.error("Lỗi: " + error.message);
    toast.success(draft.id ? "Đã cập nhật nhóm." : "Đã tạo nhóm mồi.");
    setDraft(emptyDraft(draft.folder_id));
    void load();
  };

  const removeGroup = async (id: string) => {
    if (!confirm("Xoá nhóm mồi này?")) return;
    const { error } = await sb4Admin().from("bait_groups").delete().eq("id", id);
    if (error) return toast.error("Lỗi: " + error.message);
    void load();
  };

  const editGroup = (g: BaitGroup) => {
    setDraft({
      id: g.id,
      folder_id: g.folder_id,
      name: g.name,
      province: g.province || "",
      avatar_url: g.avatar_url || "",
      member_count: String(g.member_count ?? ""),
      message_count: String(g.message_count ?? ""),
      preview_text: g.preview_text || "",
    });
  };

  

  return (
    <div style={{ maxWidth: 860, display: "grid", gap: 18 }}>
      <div>
        <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 800 }}>🎣 Quản lý Nhóm Mồi</h2>
        <p style={{ margin: 0, fontSize: 13, opacity: 0.72 }}>
          Dữ liệu lưu ở Supabase #4. Nhóm mồi chỉ để trưng bày — user bấm vào sẽ hiện popup VIP.
        </p>
      </div>

      {err && (
        <div style={{ padding: 12, borderRadius: 10, background: "rgba(239,68,68,.12)", fontSize: 13 }}>
          {err} — hãy chạy <code>supabase-sql/SB4/2026-08-27_bait_groups.sql</code> trên Supabase #4.
        </div>
      )}

      {/* Thư mục */}
      <div style={card}>
        <div style={{ fontWeight: 800, fontSize: 15 }}>📁 Thư mục Nhóm</div>
        <div style={{ display: "grid", gap: 10 }}>
          <input
            style={field}
            placeholder={fByLoc ? "Tên nội bộ (vd: Nhóm khu vực)" : "Tên cố định (vd: Nhóm 18+)"}
            value={fName}
            onChange={(e) => setFName(e.target.value)}
          />
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <input type="checkbox" checked={fByLoc} onChange={(e) => setFByLoc(e.target.checked)} />
            Đổi theo Tỉnh/Thành User
          </label>
          {fByLoc && (
            <input
              style={field}
              placeholder="Mẫu tên — dùng {location}, vd: Nhóm {location}"
              value={fTpl}
              onChange={(e) => setFTpl(e.target.value)}
            />
          )}
          <div>
            <button type="button" style={btn("#6366f1")} onClick={createFolder}>
              <FolderPlus size={15} /> Tạo thư mục
            </button>
          </div>
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          {folders.map((f) => (
            <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, padding: "8px 10px", borderRadius: 10, background: "rgba(120,120,140,.09)" }}>
              <span style={{ fontWeight: 700 }}>{f.by_location ? folderLabel(f, "[Tỉnh của user]") : f.name}</span>
              <span style={{ opacity: 0.6 }}>{f.by_location ? "· theo khu vực" : "· cố định"}</span>
              <span style={{ marginLeft: "auto", opacity: 0.6 }}>
                {groups.filter((g) => g.folder_id === f.id).length} nhóm
              </span>
              <button type="button" onClick={() => removeFolder(f.id)} style={{ ...btn("#ef4444"), padding: "6px 9px" }}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          {folders.length === 0 && !loading && <div style={{ opacity: 0.6, fontSize: 13 }}>Chưa có thư mục nào.</div>}
        </div>
      </div>

      {/* Nhóm mồi */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>{draft.id ? "✏️ Sửa nhóm mồi" : "➕ Tạo nhóm mồi"}</div>
          {draft.id && (
            <button type="button" onClick={() => setDraft(emptyDraft(draft.folder_id))} style={{ ...btn("#64748b"), padding: "6px 10px" }}>
              <X size={14} /> Huỷ sửa
            </button>
          )}
        </div>

        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
          <label style={{ display: "grid", gap: 5, fontSize: 13 }}>
            Thư mục
            <select style={field} value={draft.folder_id} onChange={(e) => setDraft({ ...draft, folder_id: e.target.value })}>
              <option value="">— Chọn thư mục —</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>{f.by_location ? `${f.name} (theo khu vực)` : f.name}</option>
              ))}
            </select>
          </label>

          <label style={{ display: "grid", gap: 5, fontSize: 13, gridColumn: "1 / -1" }}>
            Tên nhóm — dùng <code>{"{location}"}</code> để tự thay bằng Tỉnh/Thành của user
            <input
              style={field}
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="vd: Hẹn Hò Kín {location}"
            />
            <span style={{ fontSize: 12, opacity: 0.65 }}>
              Xem trước (user ở Hà Nội): <b>{applyLocation(draft.name || "Hẹn Hò Kín {location}", "Hà Nội")}</b>
            </span>
          </label>

          <label style={{ display: "grid", gap: 5, fontSize: 13 }}>
            Số member ảo
            <input style={field} inputMode="numeric" value={draft.member_count} onChange={(e) => setDraft({ ...draft, member_count: e.target.value })} placeholder="9217" />
          </label>

          <label style={{ display: "grid", gap: 5, fontSize: 13 }}>
            Số tin nhắn ảo
            <input style={field} inputMode="numeric" value={draft.message_count} onChange={(e) => setDraft({ ...draft, message_count: e.target.value })} placeholder="91729" />
          </label>

          <label style={{ display: "grid", gap: 5, fontSize: 13, gridColumn: "1 / -1" }}>
            Văn bản mẫu làm mờ
            <input style={field} value={draft.preview_text} onChange={(e) => setDraft({ ...draft, preview_text: e.target.value })} placeholder="Em ở gần đây nè, ai rảnh không…" />
          </label>

          <label style={{ display: "grid", gap: 5, fontSize: 13, gridColumn: "1 / -1" }}>
            Avatar
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {draft.avatar_url ? (
                <img src={draft.avatar_url} alt="" style={{ width: 46, height: 46, borderRadius: 12, objectFit: "cover" }} />
              ) : null}
              <input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadAvatar(f); }} />
              {uploading && <span style={{ fontSize: 12, opacity: 0.7 }}>Đang tải…</span>}
            </div>
            <input style={field} value={draft.avatar_url} onChange={(e) => setDraft({ ...draft, avatar_url: e.target.value })} placeholder="hoặc dán URL ảnh" />
          </label>
        </div>

        <div>
          <button type="button" style={btn("#22c55e")} onClick={saveGroup} disabled={saving}>
            <Plus size={15} /> {saving ? "Đang lưu…" : draft.id ? "Cập nhật nhóm" : "Tạo nhóm mồi"}
          </button>
        </div>
      </div>

      {/* Danh sách */}
      <div style={card}>
        <div style={{ fontWeight: 800, fontSize: 15 }}>📋 Danh sách nhóm mồi ({groups.length})</div>
        {loading && <div style={{ opacity: 0.6, fontSize: 13 }}>Đang tải…</div>}
        <div style={{ display: "grid", gap: 8 }}>
          {groups.map((g) => {
            const f = folderById.get(g.folder_id);
            return (
              <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 10, background: "rgba(120,120,140,.09)" }}>
                {g.avatar_url ? (
                  <img src={g.avatar_url} alt="" style={{ width: 38, height: 38, borderRadius: 12, objectFit: "cover" }} />
                ) : (
                  <div style={{ width: 38, height: 38, borderRadius: 12, background: "linear-gradient(135deg,#7c3aed,#ec4899)" }} />
                )}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{g.name}</div>
                  <div style={{ fontSize: 12, opacity: 0.66 }}>
                    {f ? (f.by_location ? `${f.name} · ${g.province || "—"}` : f.name) : "—"} · {shortCount(g.member_count)} thành viên · {shortCount(g.message_count)} tin
                  </div>
                </div>
                <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                  <button type="button" onClick={() => editGroup(g)} style={{ ...btn("#3b82f6"), padding: "6px 9px" }}><Pencil size={14} /></button>
                  <button type="button" onClick={() => removeGroup(g.id)} style={{ ...btn("#ef4444"), padding: "6px 9px" }}><Trash2 size={14} /></button>
                </div>
              </div>
            );
          })}
          {groups.length === 0 && !loading && <div style={{ opacity: 0.6, fontSize: 13 }}>Chưa có nhóm mồi nào.</div>}
        </div>
      </div>
    </div>
  );
}

export default BaitGroupsManager;
