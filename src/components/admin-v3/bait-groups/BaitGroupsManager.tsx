/**
 * Admin Panel → "Quản lý Nhóm Mồi".
 * Dữ liệu nằm ở Supabase #4 (src/lib/supabase-v4.ts).
 *
 * ĐÃ GỘP: bỏ hoàn toàn phần chia thư mục. Tất cả nhóm mồi nằm trong MỘT danh
 * sách duy nhất và đồng bộ thẳng ra tab "Nhóm" của người dùng. Bảng
 * `bait_group_folders` vẫn tồn tại (ràng buộc khoá ngoại) nên mọi nhóm mới được
 * tự gán vào một thư mục mặc định ẩn — admin không cần biết tới nó.
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Trash2, Plus, Pencil, X, Copy } from "lucide-react";
import { fetchBaitGroups, invalidateBaitGroupsCache } from "@/lib/bait-groups-cache";
import { sb4Admin, shortCount, applyLocation, type BaitGroup } from "@/lib/supabase-v4";

const DEFAULT_FOLDER_NAME = "Tất cả nhóm";

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
  name: string;
  avatar_url: string;
  member_count: string;
  message_count: string;
  preview_text: string;
  info_text: string;
};

const emptyDraft = (): GroupDraft => ({
  name: "",
  avatar_url: "",
  member_count: "",
  message_count: "",
  preview_text: "",
  info_text: "",
});

export function BaitGroupsManager() {
  const [groups, setGroups] = useState<BaitGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  /** Thư mục mặc định ẩn — chỉ để thoả khoá ngoại của bảng `bait_groups`. */
  const [defaultFolderId, setDefaultFolderId] = useState<string>("");

  const [draft, setDraft] = useState<GroupDraft>(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      invalidateBaitGroupsCache();
      const { folders, groups: g } = await fetchBaitGroups({
        force: true,
        client: sb4Admin() as any,
      });
      setErr(null);
      setGroups(g);
      setDefaultFolderId(folders[0]?.id || "");
    } catch (e: any) {
      setErr(e?.message || "Lỗi tải dữ liệu");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Lấy (hoặc tạo) thư mục mặc định ẩn để gán cho nhóm mới. */
  const ensureFolderId = async (): Promise<string> => {
    if (defaultFolderId) return defaultFolderId;
    const sb = sb4Admin();
    const { data, error } = await sb
      .from("bait_group_folders")
      .insert({ name: DEFAULT_FOLDER_NAME, by_location: false, name_template: null, sort_order: 0 })
      .select("id")
      .single();
    if (error || !data) throw new Error(error?.message || "Không tạo được nhóm mặc định");
    setDefaultFolderId((data as any).id as string);
    return (data as any).id as string;
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
    if (!draft.name.trim()) return toast.error("Nhập tên nhóm.");
    setSaving(true);
    try {
      const folderId = await ensureFolderId();
      const payload = {
        folder_id: folderId,
        name: draft.name.trim(),
        province: null,
        avatar_url: draft.avatar_url.trim() || null,
        member_count: Number(draft.member_count) || 0,
        message_count: Number(draft.message_count) || 0,
        preview_text: draft.preview_text.trim() || null,
        info_text: draft.info_text.trim() || null,
      };
      const sb = sb4Admin();
      const write = async (body: Record<string, unknown>) =>
        draft.id
          ? await sb.from("bait_groups").update(body).eq("id", draft.id)
          : await sb.from("bait_groups").insert({ ...body, sort_order: groups.length });
      let { error } = await write(payload);
      if (error && /info_text/i.test(error.message || "")) {
        // DB chưa có cột info_text → lưu các cột còn lại để không mất dữ liệu.
        const { info_text: _a, ...rest } = payload;
        ({ error } = await write(rest));
        if (!error) toast.warning("DB chưa có cột info_text — hãy thêm cột này để lưu nội dung popup.");
      }
      if (error) throw error;
      toast.success(draft.id ? "Đã cập nhật nhóm." : "Đã tạo nhóm mồi.");
      setDraft(emptyDraft());
      void load();
    } catch (e: any) {
      toast.error("Lỗi: " + (e?.message || "không xác định"));
    } finally {
      setSaving(false);
    }
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
      name: g.name,
      avatar_url: g.avatar_url || "",
      member_count: String(g.member_count ?? ""),
      message_count: String(g.message_count ?? ""),
      preview_text: g.preview_text || "",
      info_text: g.info_text || "",
    });
  };

  const copyToken = async (id: string) => {
    try {
      await navigator.clipboard.writeText(`[[baitgroup:${id}]]`);
      toast.success("Đã copy Card Nhóm — dán vào bài viết / bình luận / tin nhắn.");
    } catch {
      toast.error("Không copy được, hãy copy tay: [[baitgroup:" + id + "]]");
    }
  };

  return (
    <div style={{ maxWidth: 860, display: "grid", gap: 18 }}>
      <div>
        <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 800 }}>🎣 Quản lý Nhóm Mồi</h2>
        <p style={{ margin: 0, fontSize: 13, opacity: 0.72 }}>
          Một danh sách duy nhất — mọi nhóm ở đây hiện luôn trong tab “Nhóm” của người dùng.
        </p>
      </div>

      {err && (
        <div
          style={{ padding: 12, borderRadius: 10, background: "rgba(239,68,68,.12)", fontSize: 13 }}
        >
          {err} — hãy chạy <code>supabase-sql/SB4/2026-08-27_bait_groups.sql</code> trên Supabase #4.
        </div>
      )}

      {/* Form nhóm mồi */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>
            {draft.id ? "✏️ Sửa nhóm mồi" : "➕ Tạo nhóm mồi"}
          </div>
          {draft.id && (
            <button
              type="button"
              onClick={() => setDraft(emptyDraft())}
              style={{ ...btn("#64748b"), padding: "6px 10px" }}
            >
              <X size={14} /> Huỷ sửa
            </button>
          )}
        </div>

        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
          <label style={{ display: "grid", gap: 5, fontSize: 13, gridColumn: "1 / -1" }}>
            Tên nhóm — dùng <code>{"{location}"}</code> để tự thay bằng Tỉnh/Thành của user
            <input
              style={field}
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="vd: Hẹn Hò Kín {location}"
            />
            <span style={{ fontSize: 12, opacity: 0.65 }}>
              Xem trước (user ở Hà Nội):{" "}
              <b>{applyLocation(draft.name || "Hẹn Hò Kín {location}", "Hà Nội")}</b>
            </span>
          </label>

          <label style={{ display: "grid", gap: 5, fontSize: 13 }}>
            Số member ảo
            <input
              style={field}
              inputMode="numeric"
              value={draft.member_count}
              onChange={(e) => setDraft({ ...draft, member_count: e.target.value })}
              placeholder="9217"
            />
          </label>

          <label style={{ display: "grid", gap: 5, fontSize: 13 }}>
            Số tin nhắn ảo
            <input
              style={field}
              inputMode="numeric"
              value={draft.message_count}
              onChange={(e) => setDraft({ ...draft, message_count: e.target.value })}
              placeholder="91729"
            />
          </label>


          <label style={{ display: "grid", gap: 5, fontSize: 13, gridColumn: "1 / -1" }}>
            Văn bản mẫu làm mờ
            <input
              style={field}
              value={draft.preview_text}
              onChange={(e) => setDraft({ ...draft, preview_text: e.target.value })}
              placeholder="Em ở gần đây nè, ai rảnh không…"
            />
          </label>

          <label style={{ display: "grid", gap: 5, fontSize: 13, gridColumn: "1 / -1" }}>
            Nội dung popup thông tin nhóm
            <textarea
              style={{ ...field, minHeight: 96, resize: "vertical", lineHeight: 1.5 }}
              value={draft.info_text}
              onChange={(e) => setDraft({ ...draft, info_text: e.target.value })}
              placeholder="Nhóm kín chia sẻ ảnh & video mỗi ngày. Tham gia ngay để xem nội dung…"
            />
            <span style={{ fontSize: 11, opacity: 0.65 }}>
              Hiển thị trong popup khi thành viên bấm vào nhóm (trước khi yêu cầu VIP).
            </span>
          </label>

          <label style={{ display: "grid", gap: 5, fontSize: 13, gridColumn: "1 / -1" }}>
            Avatar
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {draft.avatar_url ? (
                <img
                  src={draft.avatar_url}
                  alt=""
                  style={{ width: 46, height: 46, borderRadius: 12, objectFit: "cover" }}
                />
              ) : null}
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadAvatar(f);
                }}
              />
              {uploading && <span style={{ fontSize: 12, opacity: 0.7 }}>Đang tải…</span>}
            </div>
            <input
              style={field}
              value={draft.avatar_url}
              onChange={(e) => setDraft({ ...draft, avatar_url: e.target.value })}
              placeholder="hoặc dán URL ảnh"
            />
          </label>
        </div>

        <div>
          <button type="button" style={btn("#22c55e")} onClick={saveGroup} disabled={saving}>
            <Plus size={15} /> {saving ? "Đang lưu…" : draft.id ? "Cập nhật nhóm" : "Tạo nhóm mồi"}
          </button>
        </div>
      </div>

      {/* Danh sách duy nhất */}
      <div style={card}>
        <div style={{ fontWeight: 800, fontSize: 15 }}>📋 Danh sách nhóm ({groups.length})</div>
        {loading && <div style={{ opacity: 0.6, fontSize: 13 }}>Đang tải…</div>}
        <div style={{ display: "grid", gap: 8 }}>
          {groups.map((g) => (
            <div
              key={g.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 10px",
                borderRadius: 10,
                background: "rgba(120,120,140,.09)",
              }}
            >
              {g.avatar_url ? (
                <img
                  src={g.avatar_url}
                  alt=""
                  style={{ width: 38, height: 38, borderRadius: 12, objectFit: "cover" }}
                />
              ) : (
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 12,
                    background: "linear-gradient(135deg,#7c3aed,#ec4899)",
                  }}
                />
              )}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{g.name}</div>
                <div style={{ fontSize: 12, opacity: 0.66 }}>
                  {shortCount(g.member_count)} thành viên · {shortCount(g.message_count)} tin
                </div>
              </div>
              <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                <button
                  type="button"
                  title="Copy Card Nhóm để đính kèm bài viết / bình luận / tin nhắn"
                  onClick={() => void copyToken(g.id)}
                  style={{ ...btn("#8b5cf6"), padding: "6px 9px" }}
                >
                  <Copy size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => editGroup(g)}
                  style={{ ...btn("#3b82f6"), padding: "6px 9px" }}
                >
                  <Pencil size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => removeGroup(g.id)}
                  style={{ ...btn("#ef4444"), padding: "6px 9px" }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
          {groups.length === 0 && !loading && (
            <div style={{ opacity: 0.6, fontSize: 13 }}>Chưa có nhóm mồi nào.</div>
          )}
        </div>
      </div>
    </div>
  );
}

export default BaitGroupsManager;
