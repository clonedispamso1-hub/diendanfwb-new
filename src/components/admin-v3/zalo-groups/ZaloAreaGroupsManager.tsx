/**
 * LỚP 2 (Admin) — từ một MỤC LỚP 1 → danh sách KHU VỰC → nhóm riêng của khu vực.
 *
 * Dữ liệu: bảng `zalo_area_groups` (Supabase #4) qua src/lib/zalo-area-groups.ts.
 * Không tạo lại bảng, không dữ liệu giả trong frontend.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, ChevronDown, ChevronRight, ChevronUp, ImagePlus, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import type { CountryFlagId } from "@/components/candy/zalo-country-flags";
import { hasLocationToken } from "@/lib/zalo-location-areas";
import { getDistricts, resolveProvince, ALL_PROVINCES } from "@/lib/vn-locations";
import { addZaloMedia, type ZaloMediaAsset, type ZaloSubItemL1 } from "@/lib/zalo-sub-items";
import {
  countZaloAreaGroups,
  createZaloAreaGroup,
  deleteZaloAreaGroup,
  listZaloAreaGroups,
  swapZaloAreaGroupOrder,
  updateZaloAreaGroup,
  type ZaloAreaGroup,
  type ZaloAreaGroupScope,
} from "@/lib/zalo-area-groups";
import {
  MAX_ADMINS,
  MAX_GOLD_KEY,
  MAX_SILVER_KEY,
  adminCountOf,
  normalizeGroupStats,
  toCount,
  validateGroupStats,
  type ZaloGroupStats,
} from "@/lib/zalo-group-stats";
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
  avatar_url: string | null;
  member_count: number;
  men_count: number;
  women_count: number;
  gold_key: number;
  silver_key: number;
  join_url: string;
};

const emptyDraft = (): Draft => ({
  name: "",
  avatar_url: null,
  member_count: 0,
  men_count: 0,
  women_count: 0,
  gold_key: 0,
  silver_key: 0,
  join_url: "",
});

const n = toCount;

const STAT_KEYS = ["member_count", "men_count", "women_count", "gold_key", "silver_key"] as const;
type StatKey = (typeof STAT_KEYS)[number];

/** Áp quy tắc thống kê lên draft khi admin thay đổi một ô số. */
function applyStatRules(draft: Draft, key: StatKey, value: number): Draft {
  const next = normalizeGroupStats(
    {
      member_count: draft.member_count,
      men_count: draft.men_count,
      women_count: draft.women_count,
      gold_key: draft.gold_key,
      silver_key: draft.silver_key,
      [key]: value,
    } as ZaloGroupStats,
    key,
  );
  return { ...draft, ...next };
}

/* ------------------------- Form nhóm (thêm / sửa) ------------------------- */

function GroupForm({
  draft,
  assets,
  saving,
  autoStats = false,
  onChange,
  onSave,
  onCancel,
  onUpload,
}: {
  draft: Draft;
  assets: ZaloMediaAsset[];
  saving: boolean;
  /** true: admin chỉ nhập Tổng thành viên, nam/nữ/key tự tính. */
  autoStats?: boolean;
  onChange: (patch: Partial<Draft>) => void;
  onSave: () => void;
  onCancel: () => void;
  onUpload: (file: File) => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);

  const admins = adminCountOf(draft);
  const statError = autoStats ? null : validateGroupStats(draft as ZaloGroupStats);
  const remaining = Math.max(0, n(draft.member_count) - admins - n(draft.men_count) - n(draft.women_count));

  const numField = (label: string, key: StatKey, max?: number) => (
    <label style={{ display: "grid", gap: 5 }}>
      <span style={lbl}>{label}</span>
      <input
        style={input}
        type="number"
        min={0}
        max={max}
        step={1}
        value={String(draft[key] ?? 0)}
        onChange={(e) => onChange(applyStatRules(draft, key, n(e.target.value)))}
      />
    </label>
  );


  return (
    <div style={box}>
      <strong style={{ fontSize: 13.5 }}>{draft.id ? "Sửa nhóm" : "Thêm nhóm"}</strong>

      <label style={{ display: "grid", gap: 5 }}>
        <span style={lbl}>Tên nhóm</span>
        <input
          style={input}
          value={draft.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Nhóm Zalo khu vực…"
        />
      </label>

      <div style={{ display: "grid", gap: 6 }}>
        <span style={lbl}>Avatar nhóm</span>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.currentTarget.value = "";
            if (f) onUpload(f);
          }}
        />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span
            style={{
              width: 48,
              height: 48,
              borderRadius: "50%",
              overflow: "hidden",
              display: "grid",
              placeItems: "center",
              background: "rgba(120,120,140,0.2)",
              fontSize: 10,
              fontWeight: 800,
            }}
          >
            {draft.avatar_url ? (
              <img
                src={draft.avatar_url}
                alt=""
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              "N/A"
            )}
          </span>
          <button type="button" style={btn("#6366f1")} onClick={() => fileRef.current?.click()}>
            <ImagePlus size={14} /> Tải ảnh lên
          </button>
          {draft.avatar_url ? (
            <button
              type="button"
              style={btn("#64748b")}
              onClick={() => onChange({ avatar_url: null })}
            >
              <X size={13} /> Bỏ ảnh
            </button>
          ) : null}
        </div>
        {assets.length > 0 ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {assets.map((a) => (
              <button
                key={a.id}
                type="button"
                title={a.label || a.kind}
                onClick={() =>
                  onChange({ avatar_url: draft.avatar_url === a.url ? null : a.url })
                }
                style={{
                  width: 52,
                  height: 52,
                  padding: 0,
                  borderRadius: 12,
                  overflow: "hidden",
                  cursor: "pointer",
                  border:
                    draft.avatar_url === a.url
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
        ) : null}
      </div>

      {autoStats ? (
        <>
          <label style={{ display: "grid", gap: 5 }}>
            <span style={lbl}>Tổng thành viên</span>
            <input
              style={input}
              type="number"
              min={0}
              step={1}
              value={String(n(draft.member_count))}
              onChange={(e) => onChange(deriveGroupStats(e.target.value))}
              placeholder="Ví dụ: 999"
            />
          </label>
          <div style={{ fontSize: 12, lineHeight: 1.7, opacity: 0.9 }}>
            Hệ thống tự tính: 👥 Tổng <strong>{n(draft.member_count)}</strong> · 👨 Nam{" "}
            <strong>{n(draft.men_count)}</strong> · 👩 Nữ <strong>{n(draft.women_count)}</strong> ·
            👑 Key vàng <strong>{n(draft.gold_key)}</strong> · 🔑 Key bạc{" "}
            <strong>{n(draft.silver_key)}</strong>
          </div>
        </>
      ) : (
        <>
          <div
            style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))" }}
          >
            {numField("Tổng thành viên", "member_count")}
            {numField("Nam", "men_count")}
            {numField("Nữ", "women_count")}
            {numField(`Key vàng (tối đa ${MAX_GOLD_KEY})`, "gold_key", MAX_GOLD_KEY)}
            {numField(`Key bạc (tối đa ${MAX_SILVER_KEY})`, "silver_key", MAX_SILVER_KEY)}
          </div>

          <div style={{ fontSize: 12, lineHeight: 1.5, opacity: 0.85 }}>
            Admin: <strong>{admins}</strong>/{MAX_ADMINS} (key vàng {n(draft.gold_key)} + key bạc{" "}
            {n(draft.silver_key)}) · Nam + nữ + admin ={" "}
            <strong>{n(draft.men_count) + n(draft.women_count) + admins}</strong> /{" "}
            {n(draft.member_count)} tổng thành viên
            {remaining > 0 ? ` · còn thiếu ${remaining} người chưa chia nam/nữ` : ""}
          </div>
          {statError ? (
            <div style={{ fontSize: 12, fontWeight: 700, color: "#ef4444" }}>{statError}</div>
          ) : null}
        </>
      )}


      <label style={{ display: "grid", gap: 5 }}>
        <span style={lbl}>Link vào nhóm</span>
        <input
          style={input}
          value={draft.join_url}
          onChange={(e) => onChange({ join_url: e.target.value })}
          placeholder="https://zalo.me/g/…"
        />
      </label>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          style={{ ...btn("#16a34a"), opacity: statError ? 0.5 : 1 }}
          disabled={saving || !!statError}
          onClick={onSave}
        >
          <Save size={14} /> {saving ? "Đang lưu…" : draft.id ? "Lưu thay đổi" : "Tạo nhóm"}
        </button>
        <button type="button" style={btn("#64748b")} onClick={onCancel}>
          <X size={14} /> Huỷ
        </button>
      </div>
    </div>
  );
}

/* --------------------- Danh sách nhóm của 1 khu vực --------------------- */

export function AreaGroupsPanel({
  scope,
  areaLabel,
  assets,
  autoStats = false,
  backLabel = "Khu vực",
  onBack,
  onChanged,
}: {
  scope: ZaloAreaGroupScope;
  areaLabel: string;
  assets: ZaloMediaAsset[];
  /** true: chỉ nhập Tổng thành viên, nam/nữ/key tự tính (mục lớp 2). */
  autoStats?: boolean;
  backLabel?: string;
  onBack: () => void;
  onChanged: () => void;
}) {
  const [groups, setGroups] = useState<ZaloAreaGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setGroups(await listZaloAreaGroups(scope));
    } catch (e: any) {
      toast.error(e?.message || "Lỗi tải nhóm của khu vực.");
    }
    setLoading(false);
  }, [scope.platform, scope.country_id, scope.item_id, scope.province, scope.area_id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) {
      toast.error("Nhập tên nhóm.");
      return;
    }
    const stats: ZaloGroupStats = autoStats
      ? deriveGroupStats(draft.member_count)
      : {
          member_count: n(draft.member_count),
          men_count: n(draft.men_count),
          women_count: n(draft.women_count),
          gold_key: n(draft.gold_key),
          silver_key: n(draft.silver_key),
        };
    const statError = autoStats ? null : validateGroupStats(stats);
    if (statError) {
      toast.error(statError);
      return;
    }
    setSaving(true);
    try {
      if (draft.id) {
        await updateZaloAreaGroup(draft.id, {
          name,
          avatar_url: draft.avatar_url,
          ...stats,
          join_url: draft.join_url.trim(),
        });
        toast.success("Đã cập nhật nhóm.");
      } else {
        await createZaloAreaGroup(scope, {
          name,
          avatar_url: draft.avatar_url,
          ...stats,
          join_url: draft.join_url.trim(),
          sort_order: (groups.at(-1)?.sort_order ?? 0) + 1,
        });
        toast.success("Đã thêm nhóm.");
      }
      setDraft(null);
      await load();
      onChanged();
    } catch (e: any) {
      toast.error(e?.message || "Không lưu được nhóm.");
    }
    setSaving(false);
  };

  const toggle = async (g: ZaloAreaGroup) => {
    try {
      await updateZaloAreaGroup(g.id, { enabled: !g.enabled });
      setGroups((prev) => prev.map((x) => (x.id === g.id ? { ...x, enabled: !g.enabled } : x)));
    } catch (e: any) {
      toast.error(e?.message || "Không đổi được trạng thái.");
    }
  };

  const remove = async (g: ZaloAreaGroup) => {
    if (!window.confirm(`Xoá nhóm "${g.name}"?`)) return;
    try {
      await deleteZaloAreaGroup(g.id);
      if (draft?.id === g.id) setDraft(null);
      toast.success("Đã xoá nhóm.");
      await load();
      onChanged();
    } catch (e: any) {
      toast.error(e?.message || "Không xoá được nhóm.");
    }
  };

  const move = async (index: number, dir: -1 | 1) => {
    const a = groups[index];
    const b = groups[index + dir];
    if (!a || !b) return;
    try {
      await swapZaloAreaGroupOrder(a, b);
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Không đổi được thứ tự.");
    }
  };

  const uploadAvatar = async (file: File) => {
    try {
      const asset = await addZaloMedia(file, { kind: "zalo" });
      setDraft((d) => (d ? { ...d, avatar_url: asset.url } : d));
      toast.success("Đã tải ảnh lên.");
    } catch (e: any) {
      toast.error(e?.message || "Không tải được ảnh.");
    }
  };

  return (
    <div style={box}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <button type="button" style={btn("#64748b")} onClick={onBack}>
          <ArrowLeft size={13} /> {backLabel}
        </button>
        <strong style={{ fontSize: 13.5, flex: 1 }}>Nhóm của: {areaLabel}</strong>
        <span style={{ fontSize: 12, opacity: 0.7 }}>{groups.length} nhóm</span>
      </div>

      {loading ? <p style={{ fontSize: 12.5, opacity: 0.7 }}>Đang tải…</p> : null}

      {groups.map((g, index) => (
        <div
          key={g.id}
          style={{
            display: "grid",
            gridTemplateColumns: "44px minmax(0,1fr) auto",
            gap: 10,
            alignItems: "center",
            border: "1px solid rgba(120,120,140,0.2)",
            borderRadius: 12,
            padding: 10,
            opacity: g.enabled ? 1 : 0.55,
          }}
        >
          {g.avatar_url ? (
            <img
              src={g.avatar_url}
              alt={g.name}
              style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover" }}
            />
          ) : (
            <span
              style={{
                width: 44,
                height: 44,
                borderRadius: "50%",
                display: "grid",
                placeItems: "center",
                background: "rgba(120,120,140,0.2)",
                fontSize: 11,
                fontWeight: 800,
              }}
            >
              N/A
            </span>
          )}
          <div style={{ minWidth: 0 }}>
            <strong style={{ fontSize: 13, display: "block" }}>{g.name}</strong>
            <span style={{ fontSize: 12, opacity: 0.7 }}>
              {g.member_count} thành viên · {g.men_count} nam · {g.women_count} nữ · 🔑 vàng{" "}
              {g.gold_key} · 🔑 bạc {g.silver_key}
            </span>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button
              type="button"
              style={btn("#64748b")}
              disabled={index === 0}
              onClick={() => void move(index, -1)}
            >
              <ChevronUp size={13} />
            </button>
            <button
              type="button"
              style={btn("#64748b")}
              disabled={index === groups.length - 1}
              onClick={() => void move(index, 1)}
            >
              <ChevronDown size={13} />
            </button>
            <button
              type="button"
              style={btn(g.enabled ? "#16a34a" : "#94a3b8")}
              onClick={() => void toggle(g)}
            >
              {g.enabled ? "Bật" : "Tắt"}
            </button>
            <button
              type="button"
              style={btn("#0ea5e9")}
              onClick={() =>
                setDraft({
                  id: g.id,
                  name: g.name,
                  avatar_url: g.avatar_url,
                  member_count: g.member_count,
                  men_count: g.men_count,
                  women_count: g.women_count,
                  gold_key: g.gold_key,
                  silver_key: g.silver_key,
                  join_url: g.join_url,
                })
              }
            >
              <Pencil size={13} />
            </button>
            <button type="button" style={btn("#ef4444")} onClick={() => void remove(g)}>
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      ))}

      {!loading && groups.length === 0 ? (
        <p style={{ fontSize: 12.5, opacity: 0.7 }}>Khu vực này chưa có nhóm nào.</p>
      ) : null}

      {draft ? (
        <GroupForm
          draft={draft}
          assets={assets}
          saving={saving}
          autoStats={autoStats}
          onChange={(patch) => setDraft((d) => (d ? { ...d, ...patch } : d))}
          onSave={() => void save()}
          onCancel={() => setDraft(null)}
          onUpload={(f) => void uploadAvatar(f)}
        />
      ) : (
        <button type="button" style={btn("#6366f1")} onClick={() => setDraft(emptyDraft())}>
          <Plus size={14} /> Thêm nhóm
        </button>
      )}
    </div>
  );
}

/* ---------------------------- Khối tổng (lớp 2) ---------------------------- */

export function ZaloAreaGroupsManager({
  countryId,
  item,
  assets,
}: {
  countryId: CountryFlagId;
  item: ZaloSubItemL1;
  assets: ZaloMediaAsset[];
}) {
  const isLocationItem = hasLocationToken(item.name);
  const [province, setProvince] = useState<string>(isLocationItem ? "Hà Nội" : "");
  const [area, setArea] = useState<string | null>(isLocationItem ? null : "");
  const [counts, setCounts] = useState<Record<string, number>>({});

  const normProvince = useMemo(
    () => (isLocationItem ? resolveProvince(province) || province : ""),
    [isLocationItem, province],
  );

  const areas = useMemo(
    () => (isLocationItem ? getDistricts(normProvince) : [""]),
    [isLocationItem, normProvince],
  );

  const loadCounts = useCallback(async () => {
    try {
      setCounts(
        await countZaloAreaGroups({
          platform: "zalo",
          country_id: countryId,
          item_id: item.id,
          province: normProvince,
        }),
      );
    } catch (e: any) {
      toast.error(e?.message || "Lỗi đếm nhóm theo khu vực.");
    }
  }, [countryId, item.id, normProvince]);

  useEffect(() => {
    void loadCounts();
  }, [loadCounts]);

  const scope: ZaloAreaGroupScope = {
    platform: "zalo",
    country_id: countryId,
    item_id: item.id,
    province: normProvince,
    area_id: area ?? "",
  };

  if (area !== null) {
    return (
      <AreaGroupsPanel
        key={`${normProvince}|${area}`}
        scope={scope}
        areaLabel={isLocationItem ? `${area} · ${normProvince}` : "Nhóm chung của mục"}
        assets={assets}
        onBack={() => {
          if (!isLocationItem) return;
          setArea(null);
          void loadCounts();
        }}
        onChanged={() => void loadCounts()}
      />
    );
  }

  return (
    <div style={box}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <strong style={{ fontSize: 13.5, flex: 1 }}>Khu vực của mục: {item.name}</strong>
        <span style={{ fontSize: 12, opacity: 0.7 }}>{areas.length} khu vực</span>
      </div>

      <label style={{ display: "grid", gap: 5 }}>
        <span style={lbl}>Tỉnh / thành</span>
        <select
          style={input}
          value={province}
          onChange={(e) => setProvince(e.target.value)}
        >
          {ALL_PROVINCES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <span style={{ fontSize: 11.5, opacity: 0.65 }}>
          Nhóm được lưu riêng cho từng khu vực của tỉnh/thành này — user chỉ thấy nhóm đúng khu vực
          của họ.
        </span>
      </label>

      <div style={{ display: "grid", gap: 8 }}>
        {areas.map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => setArea(a)}
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0,1fr) auto auto",
              alignItems: "center",
              gap: 10,
              border: "1px solid rgba(120,120,140,0.25)",
              borderRadius: 12,
              padding: "10px 12px",
              background: "transparent",
              color: "inherit",
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <strong style={{ fontSize: 13 }}>{a}</strong>
            <span
              style={{
                fontSize: 11,
                fontWeight: 800,
                background: "rgba(120,120,140,0.22)",
                borderRadius: 999,
                padding: "2px 9px",
              }}
            >
              {counts[a] ?? 0} nhóm
            </span>
            <ChevronRight size={16} />
          </button>
        ))}
      </div>
    </div>
  );
}

export default ZaloAreaGroupsManager;
