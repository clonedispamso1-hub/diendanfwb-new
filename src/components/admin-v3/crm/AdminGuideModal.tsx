// Popup "Hướng dẫn Admin" — dark theme tương phản cao, có mode xem & mode chỉnh sửa.
import { useEffect, useMemo, useState } from "react";
import { Copy, X, MapPin, Pencil, Save, RotateCcw, Plus, Trash2, Shuffle } from "lucide-react";
import { toast } from "sonner";
import { applyRegion, type GuideSection } from "@/lib/crm-guide-content";
import { loadGuideSections, saveGuideSections, resetGuideSections } from "@/lib/crm-guide-store";
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

export function AdminGuideModal({
  region,
  onClose,
}: {
  region?: string | null;
  onClose: () => void;
}) {
  const [sections, setSections] = useState<GuideSection[]>(() => loadGuideSections());
  const [active, setActive] = useState(sections[0]?.id ?? "");
  const [reg, setReg] = useState(region || "");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<GuideSection | null>(null);
  const [vip, setVip] = useState<VipCommunitySet>(() => generateVipCommunities(region));

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

  const startEdit = () => {
    if (!section) return;
    setDraft(JSON.parse(JSON.stringify(section)) as GuideSection);
    setEditing(true);
  };

  const commit = () => {
    if (!draft) return;
    const next = sections.map((s) => (s.id === draft.id ? draft : s));
    setSections(next);
    saveGuideSections(next);
    setEditing(false);
    setDraft(null);
    toast.success("Đã lưu nội dung hướng dẫn.");
  };

  const doReset = () => {
    const next = resetGuideSections();
    setSections(next);
    setEditing(false);
    setDraft(null);
    toast.success("Đã khôi phục nội dung mặc định.");
  };

  const patchBlock = (i: number, patch: Partial<{ title: string; text: string }>) =>
    setDraft((d) => d && { ...d, blocks: d.blocks.map((b, j) => (j === i ? { ...b, ...patch } : b)) });

  return (
    <div className="crm2-overlay" onClick={onClose}>
      <div className="crm2-guide" onClick={(e) => e.stopPropagation()}>
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
            {sections.map((s) => (
              <button
                key={s.id}
                className={`crm2-guide-nav ${s.id === active ? "active" : ""}`}
                onClick={() => { setActive(s.id); setEditing(false); setDraft(null); }}
              >
                <span>{s.icon}</span> {s.label}
              </button>
            ))}
            <button className="crm2-guide-nav" onClick={doReset} title="Khôi phục nội dung gốc">
              <RotateCcw size={14} /> Khôi phục mặc định
            </button>
          </div>

          <div className="crm2-guide-content">
            <div className="crm2-guide-bar">
              <div className="crm2-guide-bar-title">
                {section?.icon} {section?.label}
              </div>
              {!editing ? (
                <button className="crm2-btn sm" onClick={startEdit}><Pencil size={12} /> Chỉnh sửa</button>
              ) : (
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="crm2-btn sm primary" onClick={commit}><Save size={12} /> Lưu</button>
                  <button className="crm2-btn sm" onClick={() => { setEditing(false); setDraft(null); }}>Hủy</button>
                </div>
              )}
            </div>

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
                <div className="crm2-vip-title">{vip.title}</div>
                <div className="crm2-vip-grid">
                  {vip.communities.map((c, i) => (
                    <div className="crm2-vip-item" key={`${c.name}-${i}`}>
                      <div className="crm2-vip-name">{circledNumber(i)} {c.name}</div>
                      <div className="crm2-vip-stats">
                        <span>{c.members} thành viên</span>
                        <span className="m">Nam {c.male}</span>
                        <span className="f">Nữ {c.female}</span>
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
                  </div>
                );
              })}

            {editing && draft && (
              <>
                {draft.blocks.map((b, i) => (
                  <div className="crm2-block" key={`edit-${i}`}>
                    <div className="crm2-block-head">
                      <input
                        className="crm2-input crm2-edit-title"
                        value={b.title ?? ""}
                        placeholder="Tiêu đề bước…"
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
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
