import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { X, Save, Trash2, Loader2, Sparkles, Wand2, RefreshCw, Eye, EyeOff, Users } from "lucide-react";
import { Portal } from "@/components/candy/portal";
import { toast } from "sonner";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";
import { useAuth } from "@/components/candy/auth-provider";
import { getValidAvatarUrl, handleAvatarError } from "@/lib/avatar-utils";
import {
  adminListSeedAccounts,
  bulkCreateSeedAccounts,
  updateSeedAccount,
  deleteSeedAccount,
  type SeedAccount,
} from "@/lib/seed-accounts";
import {
  generateSeedBatch,
  generateAvatar,
  generateBio,
  generateDisplayName,
  generateUsername,
  generateAge,
  generateDistanceKm,
  type SeedDraft,
} from "@/lib/seed-generator";

/**
 * SeedManagerSheet — admin-only bottom sheet, redesigned as a Smart
 * AI-Assisted Bulk Generator.
 *
 * Workflow:
 *   1. Admin types a quantity (any positive integer).
 *   2. Click "Generate" → N editable draft forms appear.
 *   3. Nothing is saved yet. Admin can edit every field.
 *   4. Click "Save All" → a single bulk INSERT into `public.seed_accounts`.
 *
 * Seed Accounts remain DATABASE-ONLY (no Supabase Auth, no auth.users, no
 * profiles rows). All existing seed_accounts columns are reused; no schema
 * change is required.
 */

interface Props {
  open: boolean;
  onClose: () => void;
  onChanged?: () => void;
}

type Tab = "generator" | "existing";

export function SeedManagerSheet({ open, onClose, onChanged }: Props) {
  useBodyScrollLock(open);
  const { me } = useAuth();
  const [tab, setTab] = useState<Tab>("generator");

  // Generator state
  const [quantity, setQuantity] = useState<number>(10);
  const [drafts, setDrafts] = useState<SeedDraft[]>([]);
  const [saving, setSaving] = useState(false);

  // Existing seed accounts state
  const [rows, setRows] = useState<SeedAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [migrationMissing, setMigrationMissing] = useState(false);
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  const currentProvince = (me?.province || "").trim() || null;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await adminListSeedAccounts(500);
      setRows(list);
      setMigrationMissing(false);
    } catch (e: any) {
      if (/relation .*seed_accounts.* does not exist|Could not find the table/i.test(e?.message || "")) {
        setMigrationMissing(true);
      } else {
        toast.error("Không tải được danh sách seed: " + (e?.message || ""));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && tab === "existing") void load();
  }, [open, tab, load]);

  if (!open) return null;

  // ---------- Generator handlers ----------
  const handleGenerate = () => {
    const n = Math.max(1, Math.min(1000, Math.floor(quantity || 0)));
    const batch = generateSeedBatch(n, { province: currentProvince, isActive: true });
    setDrafts(batch);
  };

  const patchDraft = (id: string, patch: Partial<SeedDraft>) =>
    setDrafts((prev) => prev.map((d) => (d.draft_id === id ? { ...d, ...patch } : d)));

  const removeDraft = (id: string) =>
    setDrafts((prev) => prev.filter((d) => d.draft_id !== id));

  const regenerateDraft = (id: string) =>
    setDrafts((prev) =>
      prev.map((d) =>
        d.draft_id === id
          ? {
              ...d,
              display_name: generateDisplayName(),
              username: generateUsername(new Set(prev.map((p) => p.username))),
              avatar: generateAvatar(),
              bio: generateBio(),
              age: generateAge(),
              distance_km: generateDistanceKm(),
            }
          : d,
      ),
    );

  const handleSaveAll = async () => {
    if (!drafts.length) return;
    setSaving(true);
    try {
      const payload = drafts.map((d) => ({
        display_name: d.display_name,
        username: d.username,
        avatar: d.avatar,
        bio: d.bio,
        gender: d.gender,
        age: d.age,
        distance_km: d.distance_km,
        province: d.province,
        is_online: d.is_online,
        is_active: d.is_active,
      }));
      const n = await bulkCreateSeedAccounts(payload);
      toast.success(`Đã lưu ${n} Seed Account`);
      setDrafts([]);
      onChanged?.();
      // Refresh list if user visits the "Đã lưu" tab
      if (tab === "existing") await load();
    } catch (e: any) {
      toast.error("Lỗi lưu: " + (e?.message || ""));
    } finally {
      setSaving(false);
    }
  };

  // ---------- Existing handlers ----------
  const updateRow = (id: string, patch: Partial<SeedAccount>) =>
    setRows((s) => s.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const saveRow = async (row: SeedAccount) => {
    setRowBusy(row.id);
    try {
      await updateSeedAccount(row.id, {
        display_name: row.display_name,
        username: row.username,
        avatar: row.avatar,
        bio: row.bio,
        gender: row.gender,
        age: row.age,
        distance_km: row.distance_km,
        is_online: row.is_online,
        is_active: row.is_active,
        province: row.province,
      });
      toast.success("Đã lưu");
      onChanged?.();
    } catch (e: any) {
      toast.error("Lỗi lưu: " + (e?.message || ""));
    } finally {
      setRowBusy(null);
    }
  };

  const removeRow = async (id: string) => {
    if (!confirm("Xoá seed account này?")) return;
    try {
      await deleteSeedAccount(id);
      setRows((s) => s.filter((r) => r.id !== id));
      onChanged?.();
    } catch (e: any) {
      toast.error("Không xoá được: " + (e?.message || ""));
    }
  };

  return (
    <Portal>
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, zIndex: 9995,
          background: "rgba(0,0,0,0.5)", backdropFilter: "blur(10px) saturate(150%)",
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          data-scroll-lock-ignore
          style={{
            position: "absolute", left: 0, right: 0, bottom: 0, top: "5vh",
            background: "hsl(var(--background))",
            borderTopLeftRadius: 24, borderTopRightRadius: 24,
            display: "flex", flexDirection: "column", overflow: "hidden",
            boxShadow: "0 -20px 60px -20px rgba(0,0,0,0.55)",
          }}
        >
          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "14px 16px", borderBottom: "1px solid hsl(var(--border) / 0.4)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 12,
                background: "linear-gradient(135deg,#a855f7,#ec4899)",
                display: "grid", placeItems: "center", color: "white",
              }}>
                <Sparkles size={18} />
              </div>
              <div style={{ display: "grid" }}>
                <strong style={{ fontSize: 15, fontWeight: 700 }}>Smart Seed Generator</strong>
                <span style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>
                  Tạo hàng loạt · Preview · Lưu tất cả
                </span>
              </div>
            </div>
            <button
              type="button" onClick={onClose} aria-label="Đóng"
              style={{
                background: "hsl(var(--muted))", border: 0, width: 34, height: 34,
                display: "grid", placeItems: "center", borderRadius: 999, cursor: "pointer",
              }}
            >
              <X size={16} />
            </button>
          </div>

          {/* Tabs */}
          <div style={{
            display: "flex", gap: 6, padding: "10px 16px 0",
            borderBottom: "1px solid hsl(var(--border) / 0.4)",
          }}>
            {([
              ["generator", "Tạo mới"],
              ["existing", "Đã lưu"],
            ] as [Tab, string][]).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                style={{
                  padding: "8px 14px", borderRadius: "10px 10px 0 0",
                  border: 0, background: tab === k ? "hsl(var(--card))" : "transparent",
                  color: tab === k ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))",
                  fontWeight: 700, fontSize: 13, cursor: "pointer",
                  borderBottom: tab === k ? "2px solid hsl(var(--primary))" : "2px solid transparent",
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {migrationMissing ? (
            <div style={{
              padding: "10px 16px", background: "hsl(var(--destructive) / 0.1)",
              color: "hsl(var(--destructive))", fontSize: 12.5, fontWeight: 600,
            }}>
              ⚠ Bảng <code>seed_accounts</code> chưa tồn tại. Chạy migration:
              <code> docs/sql/2026-07-02_seed_accounts_db_only.sql</code>
            </div>
          ) : null}

          {/* Body */}
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
            {tab === "generator" ? (
              <GeneratorPanel
                quantity={quantity}
                setQuantity={setQuantity}
                drafts={drafts}
                onGenerate={handleGenerate}
                onSaveAll={handleSaveAll}
                onClearAll={() => setDrafts([])}
                onPatch={patchDraft}
                onRemove={removeDraft}
                onRegen={regenerateDraft}
                saving={saving}
                province={currentProvince}
              />
            ) : (
              <ExistingPanel
                rows={rows}
                loading={loading}
                rowBusy={rowBusy}
                onUpdate={updateRow}
                onSave={saveRow}
                onRemove={removeRow}
                onReload={load}
              />
            )}
          </div>
        </div>
      </div>
    </Portal>
  );
}

// =====================================================================
// Generator panel
// =====================================================================
function GeneratorPanel({
  quantity, setQuantity, drafts, onGenerate, onSaveAll, onClearAll,
  onPatch, onRemove, onRegen, saving, province,
}: {
  quantity: number;
  setQuantity: (n: number) => void;
  drafts: SeedDraft[];
  onGenerate: () => void;
  onSaveAll: () => void;
  onClearAll: () => void;
  onPatch: (id: string, patch: Partial<SeedDraft>) => void;
  onRemove: (id: string) => void;
  onRegen: (id: string) => void;
  saving: boolean;
  province: string | null;
}) {
  return (
    <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Controls */}
      <div style={{
        display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center",
        padding: 12, borderRadius: 16, background: "hsl(var(--muted) / 0.4)",
        border: "1px solid hsl(var(--border) / 0.6)",
      }}>
        <input
          type="number"
          min={1} max={1000}
          value={quantity}
          onChange={(e) => setQuantity(parseInt(e.target.value || "0", 10) || 0)}
          placeholder="How many Seed Accounts?"
          style={{
            flex: "1 1 220px", minWidth: 180,
            border: "1px solid hsl(var(--border))",
            background: "hsl(var(--background))",
            color: "hsl(var(--foreground))",
            borderRadius: 10, padding: "10px 12px",
            fontSize: 14, fontWeight: 600, outline: "none",
          }}
        />
        <button
          type="button"
          onClick={onGenerate}
          style={{
            border: 0, cursor: "pointer",
            background: "linear-gradient(135deg,#a855f7,#ec4899)",
            color: "white", padding: "10px 16px", borderRadius: 10,
            fontSize: 13.5, fontWeight: 700,
            display: "inline-flex", alignItems: "center", gap: 6,
          }}
        >
          <Wand2 size={15} /> Generate
        </button>
        {drafts.length > 0 ? (
          <>
            <button
              type="button"
              onClick={onSaveAll}
              disabled={saving}
              style={{
                border: 0, cursor: saving ? "not-allowed" : "pointer",
                background: "hsl(var(--foreground))",
                color: "hsl(var(--background))",
                padding: "10px 16px", borderRadius: 10,
                fontSize: 13.5, fontWeight: 700, opacity: saving ? 0.6 : 1,
                display: "inline-flex", alignItems: "center", gap: 6,
              }}
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {saving ? "Đang lưu…" : `Save All (${drafts.length})`}
            </button>
            <button
              type="button" onClick={onClearAll}
              style={{
                border: "1px solid hsl(var(--border))", background: "transparent",
                color: "hsl(var(--muted-foreground))", padding: "8px 12px", borderRadius: 10,
                fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                display: "inline-flex", alignItems: "center", gap: 4,
              }}
            >
              <X size={13} /> Bỏ tất cả
            </button>
          </>
        ) : null}
        <div style={{ flexBasis: "100%", fontSize: 11.5, color: "hsl(var(--muted-foreground))" }}>
          Khu vực áp dụng: <strong>{province || "chưa xác định"}</strong> · Chưa có gì được lưu vào DB cho tới khi bấm Save All.
        </div>
      </div>

      {/* Drafts */}
      {drafts.length === 0 ? (
        <div style={{
          padding: 40, textAlign: "center", color: "hsl(var(--muted-foreground))",
          fontSize: 13.5, border: "1px dashed hsl(var(--border))", borderRadius: 16,
        }}>
          Nhập số lượng và bấm <strong>Generate</strong> để bắt đầu.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {drafts.map((d) => (
            <DraftCard
              key={d.draft_id}
              draft={d}
              onPatch={onPatch}
              onRemove={onRemove}
              onRegen={onRegen}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Memoised draft card — hundreds of these must scroll smoothly.
const DraftCard = memo(function DraftCard({
  draft, onPatch, onRemove, onRegen,
}: {
  draft: SeedDraft;
  onPatch: (id: string, patch: Partial<SeedDraft>) => void;
  onRemove: (id: string) => void;
  onRegen: (id: string) => void;
}) {
  const id = draft.draft_id;
  return (
    <div style={{
      border: "1px solid hsl(var(--border) / 0.6)", borderRadius: 16,
      padding: 12, display: "grid", gap: 8, background: "hsl(var(--card))",
    }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <img decoding="async"
          src={getValidAvatarUrl(draft.avatar)}
          onError={handleAvatarError}
          alt=""
          loading="lazy"
          style={{ width: 52, height: 52, borderRadius: 999, objectFit: "cover" }}
        />
        <div style={{ flex: 1, display: "grid", gap: 4 }}>
          <input
            value={draft.display_name}
            onChange={(e) => onPatch(id, { display_name: e.target.value })}
            placeholder="Display name"
            style={inputStyle}
          />
          <input
            value={draft.username}
            onChange={(e) => onPatch(id, { username: e.target.value })}
            placeholder="username"
            style={{ ...inputStyle, fontSize: 12, color: "hsl(var(--muted-foreground))" }}
          />
        </div>
      </div>
      <input
        value={draft.avatar}
        onChange={(e) => onPatch(id, { avatar: e.target.value })}
        placeholder="Avatar URL"
        style={inputStyle}
      />
      <input
        value={draft.bio}
        onChange={(e) => onPatch(id, { bio: e.target.value.slice(0, 40) })}
        placeholder="Bio (max 10 ký tự)"
        maxLength={40}
        style={inputStyle}
      />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        <select
          value={draft.gender}
          onChange={(e) => onPatch(id, { gender: e.target.value as SeedDraft["gender"] })}
          style={inputStyle}
        >
          <option value="female">Nữ</option>
          <option value="male">Nam</option>
          <option value="other">Khác</option>
        </select>
        <input
          type="number" min={18} max={99}
          value={draft.age}
          onChange={(e) => onPatch(id, { age: Math.max(18, parseInt(e.target.value || "0", 10) || 18) })}
          placeholder="Tuổi"
          style={inputStyle}
        />
        <input
          type="number" min={0} max={999} step={0.1}
          value={draft.distance_km}
          onChange={(e) => onPatch(id, { distance_km: parseFloat(e.target.value || "0") || 0 })}
          placeholder="km"
          style={inputStyle}
        />
      </div>
      <input
        value={draft.province || ""}
        onChange={(e) => onPatch(id, { province: e.target.value || null })}
        placeholder="Khu vực"
        style={inputStyle}
      />
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <ToggleBtn
          active={draft.is_online}
          onClick={() => onPatch(id, { is_online: !draft.is_online })}
          label={draft.is_online ? "🟢 Online" : "⚫ Offline"}
        />
        <ToggleBtn
          active={draft.is_active}
          onClick={() => onPatch(id, { is_active: !draft.is_active })}
          label={draft.is_active ? "Đang hiện" : "Đã ẩn"}
        />
        <button
          type="button"
          onClick={() => onRegen(id)}
          style={ghostBtn}
        >
          <RefreshCw size={12} /> Random lại
        </button>
        <button
          type="button"
          onClick={() => onRemove(id)}
          style={{ ...ghostBtn, marginLeft: "auto",
            color: "hsl(var(--destructive))",
            borderColor: "hsl(var(--destructive) / 0.4)" }}
        >
          <Trash2 size={12} /> Xoá
        </button>
      </div>
    </div>
  );
});

// =====================================================================
// Existing seeds panel — edit / hide / delete already-saved seeds
// =====================================================================
function ExistingPanel({
  rows, loading, rowBusy, onUpdate, onSave, onRemove, onReload,
}: {
  rows: SeedAccount[];
  loading: boolean;
  rowBusy: string | null;
  onUpdate: (id: string, patch: Partial<SeedAccount>) => void;
  onSave: (row: SeedAccount) => void;
  onRemove: (id: string) => void;
  onReload: () => void;
}) {
  const count = useMemo(() => rows.length, [rows]);
  return (
    <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "6px 4px",
      }}>
        <strong style={{ fontSize: 13, display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Users size={14} /> Đã lưu ({count})
        </strong>
        <button type="button" onClick={onReload} style={ghostBtn}>
          <RefreshCw size={12} /> Làm mới
        </button>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: "center" }}>
          <Loader2 size={22} className="animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "hsl(var(--muted-foreground))" }}>
          Chưa có seed account nào. Chuyển sang tab "Tạo mới" để bắt đầu.
        </div>
      ) : (
        rows.map((r) => (
          <div key={r.id} style={{
            border: "1px solid hsl(var(--border) / 0.6)", borderRadius: 16,
            padding: 12, display: "grid", gap: 8,
            background: !r.is_active ? "hsl(var(--muted) / 0.4)" : "hsl(var(--card))",
          }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <img decoding="async"
                src={getValidAvatarUrl(r.avatar)} onError={handleAvatarError}
                alt="" loading="lazy"
                style={{ width: 48, height: 48, borderRadius: 999, objectFit: "cover" }}
              />
              <div style={{ flex: 1, display: "grid", gap: 4 }}>
                <input
                  value={r.display_name || ""}
                  onChange={(e) => onUpdate(r.id, { display_name: e.target.value })}
                  style={inputStyle}
                />
                <input
                  value={r.username || ""}
                  onChange={(e) => onUpdate(r.id, { username: e.target.value })}
                  style={{ ...inputStyle, fontSize: 12, color: "hsl(var(--muted-foreground))" }}
                />
              </div>
            </div>
            <input
              value={r.avatar || ""}
              onChange={(e) => onUpdate(r.id, { avatar: e.target.value })}
              placeholder="Avatar URL" style={inputStyle}
            />
            <input
              value={r.bio || ""}
              onChange={(e) => onUpdate(r.id, { bio: e.target.value })}
              placeholder="Bio" style={inputStyle}
            />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              <select
                value={r.gender || "female"}
                onChange={(e) => onUpdate(r.id, { gender: e.target.value })}
                style={inputStyle}
              >
                <option value="female">Nữ</option>
                <option value="male">Nam</option>
                <option value="other">Khác</option>
              </select>
              <input
                type="number" min={18} max={99}
                value={r.age ?? 0}
                onChange={(e) => onUpdate(r.id, { age: parseInt(e.target.value || "0", 10) })}
                style={inputStyle}
              />
              <input
                type="number" min={0} max={999} step={0.1}
                value={r.distance_km ?? 0}
                onChange={(e) => onUpdate(r.id, { distance_km: parseFloat(e.target.value || "0") })}
                style={inputStyle}
              />
            </div>
            <input
              value={r.province || ""}
              onChange={(e) => onUpdate(r.id, { province: e.target.value })}
              placeholder="Khu vực" style={inputStyle}
            />
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <ToggleBtn active={!!r.is_online}
                onClick={() => onUpdate(r.id, { is_online: !r.is_online })}
                label={r.is_online ? "🟢 Online" : "⚫ Offline"} />
              <ToggleBtn active={!!r.is_active}
                onClick={() => onUpdate(r.id, { is_active: !r.is_active })}
                label={r.is_active
                  ? (<><Eye size={12} /> Đang hiện</>)
                  : (<><EyeOff size={12} /> Đang ẩn</>)} />
              <button
                type="button" onClick={() => onSave(r)} disabled={rowBusy === r.id}
                style={{
                  marginLeft: "auto", border: 0,
                  background: "hsl(var(--foreground))",
                  color: "hsl(var(--background))",
                  padding: "8px 12px", borderRadius: 999,
                  fontSize: 12.5, fontWeight: 700, cursor: "pointer",
                  display: "inline-flex", alignItems: "center", gap: 4,
                }}
              >
                <Save size={13} /> {rowBusy === r.id ? "Đang lưu…" : "Lưu"}
              </button>
              <button
                type="button" onClick={() => onRemove(r.id)}
                style={{
                  border: 0, background: "hsl(var(--destructive) / 0.15)",
                  color: "hsl(var(--destructive))", padding: "8px 10px",
                  borderRadius: 999, cursor: "pointer",
                }}
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Shared styles
// ---------------------------------------------------------------------
const inputStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid hsl(var(--border))",
  background: "hsl(var(--background))",
  color: "hsl(var(--foreground))",
  borderRadius: 10, padding: "8px 10px",
  fontSize: 13, fontFamily: "inherit", outline: "none",
};

const ghostBtn: React.CSSProperties = {
  border: "1px solid hsl(var(--border))",
  background: "transparent", color: "hsl(var(--muted-foreground))",
  padding: "6px 10px", borderRadius: 999, fontSize: 12, fontWeight: 600,
  cursor: "pointer",
  display: "inline-flex", alignItems: "center", gap: 4,
};

function ToggleBtn({
  active, onClick, label, disabled,
}: { active: boolean; onClick: () => void; label: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button" onClick={onClick} disabled={disabled}
      style={{
        border: `1px solid ${active ? "hsl(var(--primary))" : "hsl(var(--border))"}`,
        background: active ? "hsl(var(--primary) / 0.12)" : "transparent",
        color: active ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))",
        padding: "6px 10px", borderRadius: 999, fontSize: 12, fontWeight: 600,
        cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
        display: "inline-flex", alignItems: "center", gap: 4,
      }}
    >
      {label}
    </button>
  );
}
