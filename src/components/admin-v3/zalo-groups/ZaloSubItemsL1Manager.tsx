/**
 * Admin Panel → "Nhóm Zalo Mồi" → quản lý MỤC CON LỚP 1 của 3 card quốc gia
 * (Việt Nam → Đài Loan → Nhật Bản) + "Kho ảnh Zalo / LINE" dùng chung.
 *
 * Toàn bộ dữ liệu lưu trên Supabase #4 (không hard-code trong frontend).
 * Lần này CHƯA nối sang popup user và CHƯA có lớp 2.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronUp,
  ImagePlus,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import {
  getZaloCountryCards,
  saveZaloCountryCard,
  ZALO_COUNTRY_DEFAULTS,
  type ZaloCountryCard,
} from "@/lib/zalo-country-cards";
import { CountryFlag, type CountryFlagId } from "@/components/candy/zalo-country-flags";
import { hasLocationToken } from "@/lib/zalo-location-areas";
import { ZaloAreaGroupsManager } from "@/components/admin-v3/zalo-groups/ZaloAreaGroupsManager";
import { ZaloSubItemsL2Manager } from "@/components/admin-v3/zalo-groups/ZaloSubItemsL2Manager";
import {
  addZaloMedia,
  createZaloSubItem,
  deleteZaloMedia,
  deleteZaloSubItem,
  listZaloMedia,
  listZaloSubItems,
  swapZaloSubItemOrder,
  updateZaloSubItem,
  type ZaloMediaAsset,
  type ZaloMediaKind,
  type ZaloSubItemL1,
} from "@/lib/zalo-sub-items";

const COUNTRIES: { id: CountryFlagId; title: string }[] = [
  { id: "vn", title: "VIP VIỆT NAM" },
  { id: "tw", title: "VIP ĐÀI LOAN" },
  { id: "jp", title: "VIP NHẬT BẢN" },
];

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

/* ------------------------- Kho ảnh Zalo / LINE ------------------------- */

function MediaThumb({
  asset,
  active,
  onClick,
}: {
  asset: ZaloMediaAsset;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={asset.label || asset.kind}
      style={{
        width: 62,
        height: 62,
        borderRadius: 12,
        padding: 0,
        overflow: "hidden",
        cursor: onClick ? "pointer" : "default",
        border: active ? "2px solid #6366f1" : "1px solid rgba(120,120,140,0.3)",
        background: "rgba(120,120,140,0.12)",
        position: "relative",
      }}
    >
      <img
        src={asset.url}
        alt={asset.label}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
      <span
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          fontSize: 9,
          fontWeight: 800,
          background: "rgba(0,0,0,0.55)",
          color: "#fff",
          textTransform: "uppercase",
        }}
      >
        {asset.kind}
      </span>
    </button>
  );
}

function MediaLibrary({
  assets,
  busy,
  onUpload,
  onDelete,
}: {
  assets: ZaloMediaAsset[];
  busy: boolean;
  onUpload: (file: File, kind: ZaloMediaKind) => void;
  onDelete: (asset: ZaloMediaAsset) => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [kind, setKind] = useState<ZaloMediaKind>("zalo");

  return (
    <div style={shell}>
      <div>
        <strong style={{ fontSize: 14 }}>Kho ảnh Zalo / LINE</strong>
        <p style={{ margin: "4px 0 0", fontSize: 12.5, opacity: 0.7 }}>
          Tải ảnh lên một lần rồi dùng lại cho nhiều mục. Khi tạo/sửa mục lớp 1, chỉ cần chọn ảnh
          trong kho này.
        </p>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.currentTarget.value = "";
          if (f) onUpload(f, kind);
        }}
      />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as ZaloMediaKind)}
          style={{ ...input, width: "auto" }}
        >
          <option value="zalo">Ảnh Zalo</option>
          <option value="line">Ảnh LINE</option>
        </select>
        <button
          type="button"
          style={btn("#6366f1")}
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          <ImagePlus size={14} /> {busy ? "Đang tải…" : "Thêm ảnh vào kho"}
        </button>
        <span style={{ fontSize: 12, opacity: 0.65 }}>{assets.length} ảnh trong kho</span>
      </div>

      {assets.length === 0 ? (
        <p style={{ margin: 0, fontSize: 12.5, opacity: 0.7 }}>Kho ảnh đang trống.</p>
      ) : (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {assets.map((a) => (
            <div key={a.id} style={{ display: "grid", gap: 4, justifyItems: "center" }}>
              <MediaThumb asset={a} />
              <button
                type="button"
                onClick={() => onDelete(a)}
                style={{ ...btn("#ef4444"), padding: "4px 8px", fontSize: 11 }}
              >
                <Trash2 size={11} /> Xoá
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* --------------------------- Form mục lớp 1 --------------------------- */

type Draft = {
  id?: string;
  name: string;
  subtitle: string;
  image_url: string | null;
  area_limit: number;
};
const emptyDraft = (): Draft => ({ name: "", subtitle: "", image_url: null, area_limit: 0 });

function ItemForm({
  draft,
  assets,
  saving,
  onChange,
  onSave,
  onCancel,
}: {
  draft: Draft;
  assets: ZaloMediaAsset[];
  saving: boolean;
  onChange: (patch: Partial<Draft>) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div style={box}>
      <strong style={{ fontSize: 13.5 }}>{draft.id ? "Sửa mục lớp 1" : "Thêm mục lớp 1"}</strong>
      <label style={{ display: "grid", gap: 5 }}>
        <span style={lbl}>Tên mục</span>
        <input
          style={input}
          value={draft.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="VIP ZALO MIỄN PHÍ"
        />
      </label>
      <label style={{ display: "grid", gap: 5 }}>
        <span style={lbl}>Mô tả / subtitle</span>
        <input
          style={input}
          value={draft.subtitle}
          onChange={(e) => onChange({ subtitle: e.target.value })}
          placeholder="Mô tả ngắn hiển thị dưới tên mục"
        />
      </label>

      {hasLocationToken(draft.name) ? (
        <label style={{ display: "grid", gap: 5 }}>
          <span style={lbl}>Số lượng khu vực hiển thị</span>
          <input
            style={input}
            type="number"
            min={0}
            step={1}
            value={String(draft.area_limit ?? 0)}
            onChange={(e) =>
              onChange({ area_limit: Math.max(0, Math.floor(Number(e.target.value) || 0)) })
            }
            placeholder="0"
          />
          <span style={{ fontSize: 11.5, opacity: 0.7 }}>
            0 = hiển thị tất cả khu vực; số &gt; 0 = chọn ngẫu nhiên số khu vực đó.
          </span>
          <span style={{ fontSize: 11.5, opacity: 0.6 }}>
            {"{LOCATION}"} lấy theo tỉnh/thành user đã đăng ký trong tài khoản.
          </span>
        </label>
      ) : null}

      <div style={{ display: "grid", gap: 6 }}>
        <span style={lbl}>Ảnh đại diện (chọn từ kho)</span>
        {assets.length === 0 ? (
          <span style={{ fontSize: 12, opacity: 0.7 }}>
            Chưa có ảnh nào trong kho — thêm ảnh ở khu vực "Kho ảnh Zalo / LINE" phía trên.
          </span>
        ) : (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {assets.map((a) => (
              <MediaThumb
                key={a.id}
                asset={a}
                active={draft.image_url === a.url}
                onClick={() =>
                  onChange({ image_url: draft.image_url === a.url ? null : a.url })
                }
              />
            ))}
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" style={btn("#16a34a")} disabled={saving} onClick={onSave}>
          <Save size={14} /> {saving ? "Đang lưu…" : draft.id ? "Lưu thay đổi" : "Tạo mục"}
        </button>
        <button type="button" style={btn("#64748b")} onClick={onCancel}>
          <X size={14} /> Huỷ
        </button>
      </div>
    </div>
  );
}

/* ------------------------- Section 1 quốc gia ------------------------- */

function CountrySection({
  country,
  assets,
  onError,
  onCount,
}: {
  country: { id: CountryFlagId; title: string };
  assets: ZaloMediaAsset[];
  onError: (msg: string) => void;
  onCount?: (id: CountryFlagId, n: number) => void;
}) {
  const [items, setItems] = useState<ZaloSubItemL1[]>([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [openGroups, setOpenGroups] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await listZaloSubItems(country.id);
      setItems(next);
      onCount?.(country.id, next.length);
    } catch (e: any) {
      onError(e?.message || "Lỗi tải mục lớp 1");
    }
    setLoading(false);
  }, [country.id, onError, onCount]);

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
      const areaLimit = Math.max(0, Math.floor(Number(draft.area_limit) || 0));
      if (draft.id) {
        await updateZaloSubItem(draft.id, {
          name,
          subtitle: draft.subtitle,
          image_url: draft.image_url,
          area_limit: areaLimit,
        });
        toast.success("Đã cập nhật mục.");
      } else {
        const nextOrder = (items.at(-1)?.sort_order ?? 0) + 1;
        await createZaloSubItem({
          country_id: country.id,
          name,
          subtitle: draft.subtitle,
          image_url: draft.image_url,
          sort_order: nextOrder,
          area_limit: areaLimit,
        });
        toast.success("Đã thêm mục.");
      }
      setDraft(null);
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Không lưu được mục.");
    }
    setSaving(false);
  };

  const toggle = async (item: ZaloSubItemL1) => {
    try {
      await updateZaloSubItem(item.id, { enabled: !item.enabled });
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, enabled: !item.enabled } : i)),
      );
    } catch (e: any) {
      toast.error(e?.message || "Không đổi được trạng thái.");
    }
  };

  const remove = async (item: ZaloSubItemL1) => {
    if (!window.confirm(`Xoá mục "${item.name}"?`)) return;
    try {
      await deleteZaloSubItem(item.id);
      toast.success("Đã xoá mục.");
      if (draft?.id === item.id) setDraft(null);
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Không xoá được mục.");
    }
  };

  const move = async (index: number, dir: -1 | 1) => {
    const a = items[index];
    const b = items[index + dir];
    if (!a || !b) return;
    try {
      await swapZaloSubItemOrder(a, b);
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Không đổi được thứ tự.");
    }
  };

  return (
    <div style={box}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            overflow: "hidden",
            display: "grid",
            placeItems: "center",
            background: "#fff",
            flex: "0 0 auto",
          }}
        >
          <CountryFlag id={country.id} />
        </span>
        <strong style={{ fontSize: 13.5, flex: 1 }}>{country.title}</strong>
        <span style={{ fontSize: 12, opacity: 0.7 }}>{items.length} mục lớp 1</span>
      </div>

      {true ? (
        <div style={{ display: "grid", gap: 10 }}>
          {loading ? <p style={{ fontSize: 12.5, opacity: 0.7 }}>Đang tải…</p> : null}

          {items.map((item, index) => (
            <div key={item.id} style={{ display: "grid", gap: 8 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "44px minmax(0,1fr) auto",
                gap: 10,
                alignItems: "center",
                border: "1px solid rgba(120,120,140,0.2)",
                borderRadius: 12,
                padding: 10,
                opacity: item.enabled ? 1 : 0.55,
              }}
            >
              {item.image_url ? (
                <img
                  src={item.image_url}
                  alt={item.name}
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
                <strong style={{ fontSize: 13, display: "block" }}>{item.name}</strong>
                <span style={{ fontSize: 12, opacity: 0.7 }}>
                  {item.subtitle || "(chưa có mô tả)"} · thứ tự {item.sort_order}
                  {hasLocationToken(item.name)
                    ? ` · khu vực: ${item.area_limit === 0 ? "tất cả" : `${item.area_limit} ngẫu nhiên`}`
                    : ""}
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
                  disabled={index === items.length - 1}
                  onClick={() => void move(index, 1)}
                >
                  <ChevronDown size={13} />
                </button>
                <button
                  type="button"
                  style={btn(item.enabled ? "#16a34a" : "#94a3b8")}
                  onClick={() => void toggle(item)}
                >
                  {item.enabled ? "Bật" : "Tắt"}
                </button>
                <button
                  type="button"
                  style={btn("#0ea5e9")}
                  onClick={() =>
                    setDraft({
                      id: item.id,
                      name: item.name,
                      subtitle: item.subtitle,
                      image_url: item.image_url,
                      area_limit: item.area_limit,
                    })
                  }
                >
                  <Pencil size={13} />
                </button>
                <button type="button" style={btn("#ef4444")} onClick={() => void remove(item)}>
                  <Trash2 size={13} />
                </button>
                <button
                  type="button"
                  style={btn(openGroups === item.id ? "#7c3aed" : "#334155")}
                  onClick={() => setOpenGroups((cur) => (cur === item.id ? null : item.id))}
                >
                  {openGroups === item.id
                    ? "Đóng"
                    : hasLocationToken(item.name)
                      ? "Khu vực & nhóm"
                      : "Mục lớp 2 & nhóm"}
                </button>
              </div>
            </div>
            {openGroups === item.id ? (
              hasLocationToken(item.name) ? (
                <ZaloAreaGroupsManager countryId={country.id} item={item} assets={assets} />
              ) : (
                <ZaloSubItemsL2Manager countryId={country.id} item={item} assets={assets} />
              )
            ) : null}
            </div>
          ))}

          {!loading && items.length === 0 ? (
            <p style={{ fontSize: 12.5, opacity: 0.7 }}>Chưa có mục lớp 1 nào.</p>
          ) : null}

          {draft ? (
            <ItemForm
              draft={draft}
              assets={assets}
              saving={saving}
              onChange={(patch) => setDraft((d) => (d ? { ...d, ...patch } : d))}
              onSave={() => void save()}
              onCancel={() => setDraft(null)}
            />
          ) : (
            <button type="button" style={btn("#6366f1")} onClick={() => setDraft(emptyDraft())}>
              <Plus size={14} /> Thêm mục lớp 1
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------ Tổng thể ------------------------------ */

export function ZaloSubItemsL1Manager({ countryId }: { countryId: CountryFlagId }) {
  const [assets, setAssets] = useState<ZaloMediaAsset[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onError = useCallback((msg: string) => setErr(msg), []);

  const loadAssets = useCallback(async () => {
    try {
      setAssets(await listZaloMedia());
    } catch (e: any) {
      setErr(e?.message || "Lỗi tải kho ảnh");
    }
  }, []);

  useEffect(() => {
    void loadAssets();
  }, [loadAssets]);

  const upload = async (file: File, kind: ZaloMediaKind) => {
    setBusy(true);
    try {
      await addZaloMedia(file, { kind });
      toast.success("Đã thêm ảnh vào kho.");
      await loadAssets();
      setErr(null);
    } catch (e: any) {
      toast.error(e?.message || "Không tải được ảnh.");
    }
    setBusy(false);
  };

  const removeAsset = async (asset: ZaloMediaAsset) => {
    if (!window.confirm("Xoá ảnh này khỏi kho?")) return;
    try {
      await deleteZaloMedia(asset);
      toast.success("Đã xoá ảnh khỏi kho.");
      await loadAssets();
    } catch (e: any) {
      toast.error(e?.message || "Không xoá được ảnh.");
    }
  };

  const [counts, setCounts] = useState<Record<string, number>>({ vn: 0, tw: 0, jp: 0 });
  const [cards, setCards] = useState<ZaloCountryCard[]>(ZALO_COUNTRY_DEFAULTS);
  const [editing, setEditing] = useState<CountryFlagId | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editSubtitle, setEditSubtitle] = useState("");

  const loadCards = useCallback(async () => {
    try {
      setCards(await getZaloCountryCards());
    } catch {
      /* dùng mặc định */
    }
  }, []);

  useEffect(() => {
    void loadCards();
  }, [loadCards]);

  const onCount = useCallback((id: CountryFlagId, n: number) => {
    setCounts((prev) => ({ ...prev, [id]: n }));
  }, []);

  const cardOf = (id: CountryFlagId) => {
    const saved = cards.find((c) => c.id === id);
    if (saved) return saved;
    const fallback = ZALO_COUNTRY_DEFAULTS.find((c) => c.id === id);
    return fallback ?? ZALO_COUNTRY_DEFAULTS[0];
  };

  const toggleParent = async (id: CountryFlagId) => {
    const current = cardOf(id);
    try {
      await saveZaloCountryCard(id, { enabled: !current.enabled });
      setCards((prev) => prev.map((c) => (c.id === id ? { ...c, enabled: !current.enabled } : c)));
    } catch (e: any) {
      toast.error(e?.message || "Không đổi được trạng thái.");
    }
  };

  const saveParent = async () => {
    if (!editing) return;
    try {
      await saveZaloCountryCard(editing, { title: editTitle.trim(), subtitle: editSubtitle });
      setCards((prev) =>
        prev.map((c) =>
          c.id === editing ? { ...c, title: editTitle.trim() || c.title, subtitle: editSubtitle } : c,
        ),
      );
      setEditing(null);
      toast.success("Đã lưu mục cha.");
    } catch (e: any) {
      toast.error(e?.message || "Không lưu được mục cha.");
    }
  };

  const errorLine = err ? (
    <p style={{ fontSize: 13, color: "#ef4444" }}>
      {err} — hãy chạy file supabase-sql/SB4/2026-09-19_zalo_sub_items_l1.sql trong SQL Editor của
      Supabase 4.
    </p>
  ) : null;

  const active = COUNTRIES.find((c) => c.id === countryId) ?? COUNTRIES[0];
  const activeInfo = cardOf(active.id);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={shell}>
        {errorLine}

        {/* Thanh thông tin của MỤC CHA đang chọn */}
        <div style={{ ...box, opacity: activeInfo.enabled ? 1 : 0.6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                overflow: "hidden",
                display: "grid",
                placeItems: "center",
                background: "#fff",
                flex: "0 0 auto",
              }}
            >
              <CountryFlag id={active.id} />
            </span>
            <div style={{ flex: 1, minWidth: 160 }}>
              <strong style={{ fontSize: 14, display: "block" }}>{activeInfo.title}</strong>
              <span style={{ fontSize: 12, opacity: 0.7 }}>
                {activeInfo.subtitle || "(chưa có mô tả)"} · {counts[active.id] ?? 0} mục con lớp 1
              </span>
            </div>
            <button
              type="button"
              style={btn(activeInfo.enabled ? "#16a34a" : "#94a3b8")}
              onClick={() => void toggleParent(active.id)}
            >
              {activeInfo.enabled ? "Bật" : "Tắt"}
            </button>
            <button
              type="button"
              style={btn("#0ea5e9")}
              onClick={() => {
                setEditing(active.id);
                setEditTitle(activeInfo.title);
                setEditSubtitle(activeInfo.subtitle);
              }}
            >
              <Pencil size={13} /> Sửa
            </button>
          </div>

          {editing === active.id ? (
            <div style={{ display: "grid", gap: 8 }}>
              <label style={{ display: "grid", gap: 5 }}>
                <span style={lbl}>Tên hiển thị trong popup</span>
                <input
                  style={input}
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                />
              </label>
              <label style={{ display: "grid", gap: 5 }}>
                <span style={lbl}>Mô tả</span>
                <input
                  style={input}
                  value={editSubtitle}
                  onChange={(e) => setEditSubtitle(e.target.value)}
                />
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" style={btn("#16a34a")} onClick={() => void saveParent()}>
                  <Save size={14} /> Lưu
                </button>
                <button type="button" style={btn("#64748b")} onClick={() => setEditing(null)}>
                  <X size={14} /> Huỷ
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {/* Nội dung tab: chỉ mục con lớp 1 của quốc gia đang chọn */}
        <CountrySection
          key={active.id}
          country={active}
          assets={assets}
          onError={onError}
          onCount={onCount}
        />
      </div>

      <MediaLibrary assets={assets} busy={busy} onUpload={upload} onDelete={removeAsset} />
    </div>
  );
}

export default ZaloSubItemsL1Manager;
