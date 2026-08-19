// Popup "Hướng dẫn Admin" — nội dung lưu vĩnh viễn trong Supabase (text + ảnh).
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Copy, X, MapPin, Pencil, Save, RotateCcw, Plus, Trash2, Shuffle, ImagePlus, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { applyRegion, type GuideSection } from "@/lib/crm-guide-content";
import {
  cachedGuideSections,
  fetchGuideSections,
  persistGuideSections,
  restoreDefaultGuideSections,
  uploadGuideImage,
} from "@/lib/crm-guide-store";
import { generateVipCommunities, communitySetToText, circledNumber, type VipCommunitySet } from "@/lib/vip-communities";
import { VN_PROVINCES } from "@/lib/vn-provinces";
import { SearchableSelect } from "./SearchableSelect";
import "@/styles/admin-crm-v2.css";

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Đã sao chép.");
  } catch {
    toast.error("Trình duyệt chặn sao chép.");
  }
}

const clone = (s: GuideSection) => JSON.parse(JSON.stringify(s)) as GuideSection;

export function AdminGuideModal({
  region,
  onClose,
}: {
  region?: string | null;
  onClose: () => void;
}) {
  const [sections, setSections] = useState<GuideSection[]>(() => cachedGuideSections() ?? []);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState("");
  const [reg, setReg] = useState(region || "");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<GuideSection | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingAt, setUploadingAt] = useState<number | null>(null);
  const [vip, setVip] = useState<VipCommunitySet>(() => generateVipCommunities(region));
  const fileRef = useRef<HTMLInputElement | null>(null);
  const fileTarget = useRef<number>(0);

  // Tải nội dung thật từ Supabase (nguồn duy nhất).
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const data = await fetchGuideSections();
        if (!alive) return;
        setSections(data);
        setActive((a) => a || data[0]?.id || "");
      } catch {
        toast.error("Không tải được nội dung hướng dẫn từ Cloud.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => { setVip(generateVipCommunities(reg)); }, [reg]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const section = useMemo(
    () => sections.find((s) => s.id === active) ?? sections[0],
    [sections, active],
  );

  const select = (id: string) => { setActive(id); setEditing(false); setDraft(null); };

  const startEdit = () => {
    if (!section) return;
    setDraft(clone(section));
    setEditing(true);
  };

  const commit = async (next: GuideSection[], msg: string) => {
    setSaving(true);
    try {
      await persistGuideSections(next);
      setSections(next);
      setEditing(false);
      setDraft(null);
      toast.success(msg);
    } catch (e) {
      toast.error(`Lưu thất bại: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const saveDraft = () => {
    if (!draft) return;
    void commit(
      sections.map((s) => (s.id === draft.id ? draft : s)),
      "Đã lưu vĩnh viễn vào Cloud.",
    );
  };

  const doReset = async () => {
    if (!window.confirm("Khôi phục toàn bộ nội dung về mặc định? Nội dung đang có sẽ bị ghi đè.")) return;
    setSaving(true);
    try {
      const next = await restoreDefaultGuideSections();
      setSections(next);
      setActive(next[0]?.id || "");
      setEditing(false);
      setDraft(null);
      toast.success("Đã khôi phục nội dung mặc định.");
    } catch (e) {
      toast.error(`Không khôi phục được: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const addScriptSection = () => {
    const id = `script-${Date.now().toString(36)}`;
    const item: GuideSection = {
      id,
      icon: "💬",
      label: "Kịch bản mới",
      group: "script",
      blocks: [{ title: "Tiêu đề", text: "Nội dung tin nhắn…" }],
    };
    void commit([...sections, item], "Đã thêm mục kịch bản.");
    setActive(id);
  };

  const deleteSection = (id: string) => {
    if (!window.confirm("Xóa mục này? Không thể hoàn tác.")) return;
    const next = sections.filter((s) => s.id !== id);
    setActive(next[0]?.id || "");
    void commit(next, "Đã xóa mục.");
  };

  const patchBlock = (i: number, patch: Partial<{ title: string; text: string; image: string }>) =>
    setDraft((d) => d && { ...d, blocks: d.blocks.map((b, j) => (j === i ? { ...b, ...patch } : b)) });

  const pickImage = (i: number) => { fileTarget.current = i; fileRef.current?.click(); };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const i = fileTarget.current;
    setUploadingAt(i);
    try {
      const url = await uploadGuideImage(file);
      patchBlock(i, { image: url });
      toast.success("Đã tải ảnh lên. Nhấn Lưu để lưu vĩnh viễn.");
    } catch (e) {
      toast.error(`Tải ảnh thất bại: ${(e as Error).message}`);
    } finally {
      setUploadingAt(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const topLevel = sections.filter((s) => s.group !== "script");
  const scriptItems = sections.filter((s) => s.group === "script");

  return (
    <div className="crm2-overlay" onClick={onClose}>
      <div className="crm2-guide" onClick={(e) => e.stopPropagation()}>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(e) => void onFile(e.target.files?.[0])}
        />

        <div className="crm2-guide-head">
          <div style={{ flex: 1, minWidth: 160 }}>
            <div className="crm2-guide-title">👁 Hướng dẫn Admin tư vấn &amp; chốt khách</div>
            <div className="crm2-guide-region">{vip.title}</div>
          </div>
          <div className="crm2-guide-head-actions">
            <MapPin size={14} style={{ opacity: 0.6 }} />
            <SearchableSelect
              className="crm2-ss-compact"
              value={reg}
              options={VN_PROVINCES}
              placeholder="— Chọn khu vực —"
              onChange={setReg}
            />
            <button className="crm2-btn ghost sm" onClick={onClose} aria-label="Đóng">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="crm2-guide-body">
          <div className="crm2-guide-side">
            {topLevel.map((s) => (
              <div key={s.id}>
                <button
                  className={`crm2-guide-nav ${s.id === active ? "active" : ""}`}
                  onClick={() => select(s.id)}
                >
                  <span>{s.icon}</span> {s.label}
                </button>

                {s.id === "script" && (
                  <div className="crm2-guide-sub">
                    {scriptItems.map((c) => (
                      <button
                        key={c.id}
                        className={`crm2-guide-nav sub ${c.id === active ? "active" : ""}`}
                        onClick={() => select(c.id)}
                      >
                        <span>{c.icon}</span> {c.label}
                      </button>
                    ))}
                    <button className="crm2-guide-nav sub add" onClick={addScriptSection} disabled={saving}>
                      <Plus size={13} /> Thêm kịch bản
                    </button>
                  </div>
                )}
              </div>
            ))}

            <button className="crm2-guide-nav" onClick={() => void doReset()} title="Khôi phục nội dung gốc" disabled={saving}>
              <RotateCcw size={14} /> Khôi phục mặc định
            </button>
          </div>

          <div className="crm2-guide-content">
            <div className="crm2-guide-bar">
              <div className="crm2-guide-bar-title">
                {section?.icon} {section?.label}
              </div>
              {!editing ? (
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="crm2-btn sm" onClick={startEdit}><Pencil size={12} /> Chỉnh sửa</button>
                  {section?.group === "script" && (
                    <button className="crm2-btn sm danger" onClick={() => deleteSection(section.id)} disabled={saving}>
                      <Trash2 size={12} /> Xóa mục
                    </button>
                  )}
                </div>
              ) : (
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="crm2-btn sm primary" onClick={saveDraft} disabled={saving}>
                    {saving ? <Loader2 size={12} className="crm2-spin" /> : <Save size={12} />} Lưu
                  </button>
                  <button className="crm2-btn sm" onClick={() => { setEditing(false); setDraft(null); }}>Hủy</button>
                </div>
              )}
            </div>

            {loading && sections.length === 0 && (
              <div className="crm2-block"><div className="crm2-block-text">Đang tải nội dung từ Cloud…</div></div>
            )}

            {section?.id === "community" && !editing && (
              <div className="crm2-block">
                <div className="crm2-block-head">
                  <div className="crm2-block-title">Danh sách cộng đồng khu vực {vip.region}</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="crm2-btn sm" onClick={() => setVip(generateVipCommunities(reg))}>
                      <Shuffle size={12} /> Random lại
                    </button>
                    <button className="crm2-btn sm" onClick={() => void copyText(communitySetToText(vip))}>
                      <Copy size={12} /> Copy
                    </button>
                  </div>
                </div>
                <div className="crm2-vip-title">🔥 {vip.title}</div>
                <div className="crm2-vip-grid">
                  {vip.communities.map((c, i) => (
                    <div className="crm2-vip-item" key={`${c.name}-${i}`}>
                      <div className="crm2-vip-name">{circledNumber(i)} {c.name}</div>
                      <div className="crm2-vip-stats">
                        <span>{c.members} thành viên</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="crm2-vip-foot">
                  Hiện có <b>{vip.admins}</b> Admin hỗ trợ khu vực {vip.region}.
                </div>
              </div>
            )}

            {!editing &&
              section?.blocks.map((b, i) => {
                const text = applyRegion(b.text, reg);
                return (
                  <div className="crm2-block" key={`${section.id}-${i}`}>
                    <div className="crm2-block-head">
                      <div className="crm2-block-title">
                        {b.title ? applyRegion(b.title, reg) : `${section.label} ${i + 1}`}
                      </div>
                      <button className="crm2-btn sm" onClick={() => void copyText(text)}>
                        <Copy size={12} /> Copy
                      </button>
                    </div>
                    <div className="crm2-block-text">{text}</div>
                    {b.image && (
                      <img decoding="async" className="crm2-block-img" src={b.image} alt={b.title || "Ảnh minh hoạ"} loading="lazy" />
                    )}
                  </div>
                );
              })}

            {editing && draft && (
              <>
                <div className="crm2-block">
                  <div className="crm2-block-head">
                    <div className="crm2-block-title">Tên mục</div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      className="crm2-input"
                      style={{ width: 70, textAlign: "center" }}
                      value={draft.icon}
                      onChange={(e) => setDraft({ ...draft, icon: e.target.value })}
                    />
                    <input
                      className="crm2-input"
                      style={{ flex: 1 }}
                      value={draft.label}
                      onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                    />
                  </div>
                </div>

                {draft.blocks.map((b, i) => (
                  <div className="crm2-block" key={`edit-${i}`}>
                    <div className="crm2-block-head">
                      <input
                        className="crm2-input crm2-edit-title"
                        value={b.title ?? ""}
                        placeholder="Tiêu đề…"
                        onChange={(e) => patchBlock(i, { title: e.target.value })}
                      />
                      <button
                        className="crm2-btn sm danger"
                        onClick={() => setDraft({ ...draft, blocks: draft.blocks.filter((_, j) => j !== i) })}
                      >
                        <Trash2 size={12} /> Xóa
                      </button>
                    </div>
                    <textarea
                      className="crm2-textarea"
                      rows={Math.max(4, b.text.split("\n").length + 1)}
                      value={b.text}
                      onChange={(e) => patchBlock(i, { text: e.target.value })}
                    />
                    {b.image && (
                      <img decoding="async" className="crm2-block-img" src={b.image} alt="Ảnh minh hoạ" loading="lazy" />
                    )}
                    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                      <button className="crm2-btn sm" onClick={() => pickImage(i)} disabled={uploadingAt === i}>
                        {uploadingAt === i ? <Loader2 size={12} className="crm2-spin" /> : <ImagePlus size={12} />}
                        {b.image ? " Đổi ảnh" : " Thêm ảnh"}
                      </button>
                      {b.image && (
                        <button className="crm2-btn sm danger" onClick={() => patchBlock(i, { image: "" })}>
                          <Trash2 size={12} /> Xóa ảnh
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                <button
                  className="crm2-btn"
                  onClick={() => setDraft({ ...draft, blocks: [...draft.blocks, { title: "", text: "" }] })}
                >
                  <Plus size={14} /> Thêm dòng
                </button>
                <div className="crm2-edit-hint">
                  Mẹo: dùng <code>{"{REGION}"}</code> và <code>{"{REGION_UPPER}"}</code> để tự động thay theo khu vực.
                  Nội dung &amp; ảnh được lưu vĩnh viễn trong Cloud sau khi bấm Lưu.
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
