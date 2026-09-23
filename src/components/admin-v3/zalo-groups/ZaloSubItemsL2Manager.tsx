/**
 * Admin — MỤC LỚP 2 của một mục lớp 1 KHÔNG theo tỉnh/thành (ví dụ "VIP ZALO MIỄN PHÍ").
 * Mỗi mục lớp 2: tên, mô tả, ảnh (kho ảnh chung), bật/tắt, thứ tự, và nút quản lý nhóm.
 * Nhóm dùng lại bảng `zalo_area_groups` với province = '' và area_id = id mục lớp 2.
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, ChevronUp, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import type { CountryFlagId } from "@/components/candy/zalo-country-flags";
import type { ZaloMediaAsset, ZaloSubItemL1 } from "@/lib/zalo-sub-items";
import { AreaGroupsPanel } from "@/components/admin-v3/zalo-groups/ZaloAreaGroupsManager";
import {
  createZaloSubItemL2,
  deleteZaloSubItemL2,
  listZaloSubItemsL2,
  swapZaloSubItemL2Order,
  updateZaloSubItemL2,
  type ZaloSubItemL2,
} from "@/lib/zalo-sub-items-l2";
import { countZaloAreaGroups, type ZaloAreaGroupScope } from "@/lib/zalo-area-groups";
import { deriveGroupStats } from "@/lib/zalo-auto-stats";

const box: React.CSSProperties = {
  border: "1px solid rgba(120,120,140,0.22)",
  borderRadius: 12,
  padding: 12,
  display: "grid",
  gap: 10,
};
const input: React.CSSProperties = {
  width: "100%",
  border: "1px solid rgba(120,120,140,0.35)",
  borderRadius: 10,
  padding: "9px 11px",
  fontSize: 13,
  background: "transparent",
  color: "inherit",
};
const btn = (bg: string): React.CSSProperties => ({
  border: 0,
  borderRadius: 10,
  padding: "8px 12px",
  background: bg,
  color: "#fff",
  fontWeight: 700,
  fontSize: 12.5,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
});
const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 700, opacity: 0.75 };

type Draft = {
  id?: string;
  name: string;
  subtitle: string;
  image_url: string | null;
  member_count: number;
  join_url: string;
};

const emptyDraft = (): Draft => ({
  name: "",
  subtitle: "",
  image_url: null,
  member_count: 0,
  join_url: "",
});

function ItemL2Form({
  draft,
  setDraft,
  assets,
  saving,
  onSave,
  onCancel,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  assets: ZaloMediaAsset[];
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  const stats = deriveGroupStats(draft.member_count);
  return (
    <div style={box}>
      <label style={{ display: "grid", gap: 5 }}>
        <span style={lbl}>Tên mục</span>
        <input
          style={input}
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          placeholder="Ví dụ: NHÓM CHAT VUI"
        />
      </label>
      <label style={{ display: "grid", gap: 5 }}>
        <span style={lbl}>Mô tả</span>
        <input
          style={input}
          value={draft.subtitle}
          onChange={(e) => setDraft({ ...draft, subtitle: e.target.value })}
          placeholder="Mô tả ngắn"
        />
      </label>
      <label style={{ display: "grid", gap: 5 }}>
        <span style={lbl}>Tổng thành viên</span>
        <input
          style={input}
          type="number"
          min={0}
          step={1}
          value={String(draft.member_count)}
          onChange={(e) =>
            setDraft({ ...draft, member_count: deriveGroupStats(e.target.value).member_count })
          }
          placeholder="Ví dụ: 999"
        />
      </label>
      <div
        style={{
          fontSize: 12,
          lineHeight: 1.7,
          background: "rgba(120,120,140,0.12)",
          borderRadius: 10,
          padding: "8px 10px",
        }}
      >
        Hệ thống tự tính: 👥 Tổng <strong>{stats.member_count}</strong> · 👨 Nam{" "}
        <strong>{stats.men_count}</strong> · 👩 Nữ <strong>{stats.women_count}</strong> · 👑 Key vàng{" "}
        <strong>{stats.gold_key}</strong> · 🔑 Key bạc <strong>{stats.silver_key}</strong>
      </div>
      <label style={{ display: "grid", gap: 5 }}>
        <span style={lbl}>Link tham gia (không bắt buộc)</span>
        <input
          style={input}
          value={draft.join_url}
          onChange={(e) => setDraft({ ...draft, join_url: e.target.value })}
          placeholder="https://zalo.me/g/…"
        />
      </label>
      <div style={{ display: "grid", gap: 6 }}>
        <span style={lbl}>Ảnh của mục</span>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => setDraft({ ...draft, image_url: null })}
            style={{
              ...btn(draft.image_url ? "rgba(120,120,140,0.3)" : "#6366f1"),
              padding: "6px 10px",
            }}
          >
            Không ảnh
          </button>
          {assets.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setDraft({ ...draft, image_url: a.url })}
              style={{
                width: 54,
                height: 54,
                padding: 0,
                borderRadius: 12,
                overflow: "hidden",
                cursor: "pointer",
                border:
                  draft.image_url === a.url
                    ? "2px solid #6366f1"
                    : "1px solid rgba(120,120,140,0.3)",
                background: "rgba(120,120,140,0.12)",
              }}
            >
              <img
                src={a.url}
                alt={a.label}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" style={btn("#16a34a")} disabled={saving} onClick={onSave}>
          <Save size={14} /> {saving ? "Đang lưu…" : "Lưu mục"}
        </button>
        <button type="button" style={btn("rgba(120,120,140,0.55)")} onClick={onCancel}>
          <X size={14} /> Huỷ
        </button>
      </div>
    </div>
  );
}

export function ZaloSubItemsL2Manager({
  countryId,
  item,
  assets,
}: {
  countryId: CountryFlagId;
  item: ZaloSubItemL1;
  assets: ZaloMediaAsset[];
}) {
  const [rows, setRows] = useState<ZaloSubItemL2[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [openGroups, setOpenGroups] = useState<ZaloSubItemL2 | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, cnt] = await Promise.all([
        listZaloSubItemsL2(item.id),
        countZaloAreaGroups({
          platform: "zalo",
          country_id: countryId,
          item_id: item.id,
          province: "",
        }),
      ]);
      setRows(list);
      setCounts(cnt);
    } catch (e: any) {
      toast.error(e?.message || "Lỗi tải mục lớp 2.");
    }
    setLoading(false);
  }, [countryId, item.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) {
      toast.error("Nhập tên mục.");
      return;
    }
    setSaving(true);
    try {
      const stats = deriveGroupStats(draft.member_count);
      if (draft.id) {
        await updateZaloSubItemL2(draft.id, {
          name,
          subtitle: draft.subtitle.trim(),
          image_url: draft.image_url,
          join_url: draft.join_url.trim(),
          ...stats,
        });
      } else {
        await createZaloSubItemL2({
          parent_item_id: item.id,
          name,
          subtitle: draft.subtitle.trim(),
          image_url: draft.image_url,
          sort_order: rows.length,
          join_url: draft.join_url.trim(),
          ...stats,
        });
      }
      setDraft(null);
      await load();
      toast.success("Đã lưu mục.");
    } catch (e: any) {
      toast.error(e?.message || "Lỗi lưu mục.");
    }
    setSaving(false);
  };

  if (openGroups) {
    const scope: ZaloAreaGroupScope = {
      platform: "zalo",
      country_id: countryId,
      item_id: item.id,
      province: "",
      area_id: openGroups.id,
    };
    return (
      <AreaGroupsPanel
        key={openGroups.id}
        scope={scope}
        areaLabel={openGroups.name}
        assets={assets}
        onBack={() => {
          setOpenGroups(null);
          void load();
        }}
        onChanged={() => void load()}
      />
    );
  }

  return (
    <div style={box}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <strong style={{ fontSize: 13.5, flex: 1 }}>Mục lớp 2 của: {item.name}</strong>
        <span style={{ fontSize: 12, opacity: 0.7 }}>{rows.length} mục</span>
        <button type="button" style={btn("#6366f1")} onClick={() => setDraft(emptyDraft())}>
          <Plus size={14} /> Thêm mục lớp 2
        </button>
      </div>
      <p style={{ margin: 0, fontSize: 12, opacity: 0.65 }}>
        Mục ở đây không phụ thuộc tỉnh/thành của người dùng. Nhóm thuộc mục nào chỉ hiện trong đúng
        mục đó.
      </p>

      {draft ? (
        <ItemL2Form
          draft={draft}
          setDraft={setDraft}
          assets={assets}
          saving={saving}
          onSave={save}
          onCancel={() => setDraft(null)}
        />
      ) : null}

      {loading ? (
        <p style={{ margin: 0, fontSize: 12.5, opacity: 0.7 }}>Đang tải…</p>
      ) : rows.length === 0 ? (
        <p style={{ margin: 0, fontSize: 12.5, opacity: 0.7 }}>Chưa có mục lớp 2 nào.</p>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {rows.map((r, i) => (
            <div
              key={r.id}
              style={{
                border: "1px solid rgba(120,120,140,0.25)",
                borderRadius: 12,
                padding: "10px 12px",
                display: "grid",
                gap: 8,
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto minmax(0,1fr) auto",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <span
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 999,
                    overflow: "hidden",
                    background: "rgba(120,120,140,0.2)",
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  {r.image_url ? (
                    <img
                      src={r.image_url}
                      alt=""
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : null}
                </span>
                <span style={{ minWidth: 0 }}>
                  <strong style={{ fontSize: 13 }}>{r.name}</strong>
                  {r.subtitle ? (
                    <span style={{ display: "block", fontSize: 11.5, opacity: 0.7 }}>
                      {r.subtitle}
                    </span>
                  ) : null}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    background: "rgba(120,120,140,0.22)",
                    borderRadius: 999,
                    padding: "2px 9px",
                  }}
                >
                  {counts[r.id] ?? 0} nhóm
                </span>
              </div>

              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button
                  type="button"
                  style={btn("#7c3aed")}
                  onClick={() => setOpenGroups(r)}
                >
                  <ChevronRight size={14} /> Quản lý nhóm
                </button>
                <button
                  type="button"
                  style={btn("#334155")}
                  onClick={() =>
                    setDraft({
                      id: r.id,
                      name: r.name,
                      subtitle: r.subtitle,
                      image_url: r.image_url,
                      member_count: r.member_count,
                      join_url: r.join_url,
                    })
                  }
                >
                  <Pencil size={14} /> Sửa
                </button>
                <button
                  type="button"
                  style={btn(r.enabled ? "#059669" : "rgba(120,120,140,0.55)")}
                  onClick={async () => {
                    await updateZaloSubItemL2(r.id, { enabled: !r.enabled });
                    await load();
                  }}
                >
                  {r.enabled ? "Đang bật" : "Đang tắt"}
                </button>
                <button
                  type="button"
                  style={btn("rgba(120,120,140,0.55)")}
                  disabled={i === 0}
                  onClick={async () => {
                    const prev = rows[i - 1];
                    if (!prev) return;
                    await swapZaloSubItemL2Order(r, prev);
                    await load();
                  }}
                >
                  <ChevronUp size={14} />
                </button>
                <button
                  type="button"
                  style={btn("rgba(120,120,140,0.55)")}
                  disabled={i === rows.length - 1}
                  onClick={async () => {
                    const next = rows[i + 1];
                    if (!next) return;
                    await swapZaloSubItemL2Order(r, next);
                    await load();
                  }}
                >
                  <ChevronDown size={14} />
                </button>
                <button
                  type="button"
                  style={btn("#dc2626")}
                  onClick={async () => {
                    if (!window.confirm(`Xoá mục "${r.name}" và toàn bộ nhóm bên trong?`)) return;
                    await deleteZaloSubItemL2(r.id);
                    await load();
                  }}
                >
                  <Trash2 size={14} /> Xoá
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default ZaloSubItemsL2Manager;
