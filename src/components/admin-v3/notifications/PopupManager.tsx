/**
 * PopupManager — quản lý 6 mẫu popup + trang bảo trì.
 * Đơn giản: chọn mẫu → chỉnh vài trường → Sử dụng / Tắt.
 * Dữ liệu thật từ bảng admin_popups & admin_site_settings.
 */
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Save, Check, Power, Wrench, Eye } from "lucide-react";
import {
  listPopups,
  createPopup,
  updatePopup,
  setPopupEnabled,
  getMaintenance,
  saveMaintenance,
  MAINTENANCE_DEFAULT,
  type PopupItem,
  type MaintenanceSettings,
} from "@/lib/popup-api";
import { POPUP_TEMPLATES, getTemplate, type TemplateKey } from "@/lib/popup-templates";
import { PopupCard, POPUP_CARD_CSS } from "@/components/candy/popup-card";

type Draft = PopupItem;

function blankDraft(key: TemplateKey, order: number): Draft {
  const tpl = getTemplate(key);
  return {
    id: "",
    template: key,
    title: tpl.defaults.title,
    content: tpl.defaults.content,
    imageUrl: "",
    buttonText: tpl.defaults.buttonText,
    fontSize: 16,
    textColor: "",
    facebook: "",
    zalo: "",
    website: "",
    enabled: false,
    order,
  };
}

const field =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200 placeholder:text-slate-400";
const label = "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500";

export function PopupManager() {
  const [tab, setTab] = useState<"popups" | "maintenance">(() => {
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search).get("tab");
      if (p === "maintenance") return "maintenance";
    }
    return "popups";
  });
  const [rows, setRows] = useState<PopupItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<TemplateKey>("announcement");
  const [draft, setDraft] = useState<Draft>(() => blankDraft("announcement", 1));
  const [saving, setSaving] = useState(false);

  const [mt, setMt] = useState<MaintenanceSettings>(MAINTENANCE_DEFAULT);
  const [mtSaving, setMtSaving] = useState(false);

  const byTemplate = useMemo(() => {
    const map = new Map<TemplateKey, PopupItem>();
    for (const r of rows) if (!map.has(r.template)) map.set(r.template, r);
    return map;
  }, [rows]);

  useEffect(() => {
    (async () => {
      try {
        const [list, m] = await Promise.all([listPopups(), getMaintenance()]);
        setRows(list);
        setMt(m);
      } catch (e) {
        toast.error("Không tải được dữ liệu popup", {
          description: (e as Error).message,
        });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    const existing = byTemplate.get(selected);
    const idx = POPUP_TEMPLATES.findIndex((t) => t.key === selected);
    setDraft(existing ? { ...existing } : blankDraft(selected, idx + 1));
  }, [selected, byTemplate]);

  const patch = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));

  const persist = async (next: Draft) => {
    const saved = next.id
      ? await updatePopup(next.id, next)
      : await createPopup(next);
    setRows((prev) => {
      const rest = prev.filter((r) => r.id !== saved.id && r.template !== saved.template);
      return [...rest, saved].sort((a, b) => a.order - b.order);
    });
    return saved;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const saved = await persist(draft);
      setDraft({ ...saved });
      toast.success("Đã lưu popup");
    } catch (e) {
      toast.error("Lưu thất bại", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (enabled: boolean) => {
    setSaving(true);
    try {
      if (!draft.id) {
        const saved = await persist({ ...draft, enabled });
        setDraft({ ...saved });
      } else {
        await setPopupEnabled(draft.id, enabled);
        setDraft((d) => ({ ...d, enabled }));
        setRows((prev) =>
          prev.map((r) => (r.id === draft.id ? { ...r, enabled } : r)),
        );
      }
      toast.success(enabled ? "Đã bật popup" : "Đã tắt popup");
    } catch (e) {
      toast.error("Không đổi được trạng thái", {
        description: (e as Error).message,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveMaintenance = async (next: MaintenanceSettings) => {
    setMtSaving(true);
    try {
      await saveMaintenance(next);
      setMt(next);
      toast.success(
        next.enabled ? "Đã bật chế độ bảo trì" : "Đã lưu trang bảo trì",
      );
    } catch (e) {
      toast.error("Lưu thất bại", { description: (e as Error).message });
    } finally {
      setMtSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center text-slate-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Đang tải…
      </div>
    );
  }

  const activeCount = rows.filter((r) => r.enabled).length;

  return (
    <div className="space-y-6">
      <style>{POPUP_CARD_CSS}</style>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setTab("popups")}
          className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
            tab === "popups"
              ? "bg-sky-600 text-white shadow-lg shadow-sky-600/30"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          Mẫu popup ({activeCount} đang bật)
        </button>
        <button
          onClick={() => setTab("maintenance")}
          className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
            tab === "maintenance"
              ? "bg-amber-600 text-white shadow-lg shadow-amber-600/30"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          🛠 Popup Bảo trì {mt.enabled ? "• ĐANG BẬT" : ""}
        </button>
      </div>

      {tab === "popups" ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {POPUP_TEMPLATES.map((t) => {
              const row = byTemplate.get(t.key);
              const isSel = selected === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setSelected(t.key)}
                  className={`relative overflow-hidden rounded-2xl p-4 text-left transition ${
                    isSel
                      ? "ring-2 ring-sky-500 ring-offset-2"
                      : "hover:-translate-y-0.5"
                  }`}
                  style={{ background: t.background }}
                >
                  <span className="text-2xl">{t.emoji}</span>
                  <div
                    className="mt-2 text-sm font-bold leading-tight"
                    style={{ color: t.textColor }}
                  >
                    {t.name}
                  </div>
                  <div className="text-xs" style={{ color: t.mutedColor }}>
                    {t.hint}
                  </div>
                  <span
                    className={`mt-3 inline-block rounded-full px-2.5 py-1 text-[11px] font-bold ${
                      row?.enabled
                        ? "bg-emerald-400 text-emerald-950"
                        : "bg-white/25 text-white"
                    }`}
                  >
                    {row?.enabled ? "ĐANG BẬT" : "Đang tắt"}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="mb-4 text-base font-bold text-slate-900">
                {getTemplate(selected).emoji} Chỉnh nội dung
              </h3>

              <div className="grid gap-4">
                <div>
                  <span className={label}>Tiêu đề</span>
                  <input
                    className={field}
                    value={draft.title}
                    onChange={(e) => patch({ title: e.target.value })}
                    placeholder="Tiêu đề popup"
                  />
                </div>
                <div>
                  <span className={label}>Nội dung</span>
                  <textarea
                    className={`${field} min-h-[96px] resize-y`}
                    value={draft.content}
                    onChange={(e) => patch({ content: e.target.value })}
                    placeholder="Nội dung hiển thị"
                  />
                </div>
                <div>
                  <span className={label}>Ảnh hoặc GIF (URL)</span>
                  <input
                    className={field}
                    value={draft.imageUrl}
                    onChange={(e) => patch({ imageUrl: e.target.value })}
                    placeholder="https://…/anh.gif"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <span className={label}>Kích thước chữ ({draft.fontSize}px)</span>
                    <input
                      type="range"
                      min={12}
                      max={26}
                      value={draft.fontSize}
                      onChange={(e) => patch({ fontSize: Number(e.target.value) })}
                      className="w-full accent-sky-600"
                    />
                  </div>
                  <div>
                    <span className={label}>Màu chữ</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={draft.textColor || getTemplate(selected).textColor}
                        onChange={(e) => patch({ textColor: e.target.value })}
                        className="h-10 w-14 cursor-pointer rounded-lg border border-slate-300 bg-white p-1"
                      />
                      <button
                        type="button"
                        onClick={() => patch({ textColor: "" })}
                        className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                      >
                        Mặc định
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <span className={label}>Link Facebook</span>
                    <input
                      className={field}
                      value={draft.facebook}
                      onChange={(e) => patch({ facebook: e.target.value })}
                      placeholder="https://facebook.com/…"
                    />
                  </div>
                  <div>
                    <span className={label}>Link Zalo</span>
                    <input
                      className={field}
                      value={draft.zalo}
                      onChange={(e) => patch({ zalo: e.target.value })}
                      placeholder="https://zalo.me/…"
                    />
                  </div>
                  <div>
                    <span className={label}>Link Website</span>
                    <input
                      className={field}
                      value={draft.website}
                      onChange={(e) => patch({ website: e.target.value })}
                      placeholder="https://…"
                    />
                  </div>
                  <div>
                    <span className={label}>Nút bấm</span>
                    <input
                      className={field}
                      value={draft.buttonText}
                      onChange={(e) => patch({ buttonText: e.target.value })}
                      placeholder="Tham gia ngay"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-60"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Lưu
                </button>
                <button
                  onClick={() => handleToggle(true)}
                  disabled={saving || draft.enabled}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-500 disabled:opacity-50"
                >
                  <Check className="h-4 w-4" /> Sử dụng
                </button>
                <button
                  onClick={() => handleToggle(false)}
                  disabled={saving || !draft.enabled}
                  className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-rose-500 disabled:opacity-50"
                >
                  <Power className="h-4 w-4" /> Tắt
                </button>
              </div>
              <p className="mt-3 text-xs text-slate-500">
                Popup hiển thị liên tục cho đến khi người dùng tắt. Nếu họ tick “Không
                hiển thị lại trong 24 giờ”, popup sẽ ẩn 24 giờ rồi hiện lại. Bật nhiều
                popup thì sẽ hiện lần lượt theo thứ tự bên trên.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-900 p-5">
              <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-300">
                <Eye className="h-4 w-4" /> Xem trước
              </div>
              <div className="flex justify-center">
                <PopupCard popup={draft} showDsa total={1} index={0} />
              </div>
            </div>
          </div>
        </>
      ) : (
        <MaintenanceEditor
          value={mt}
          saving={mtSaving}
          onSave={handleSaveMaintenance}
        />
      )}
    </div>
  );
}

function MaintenanceEditor({
  value,
  saving,
  onSave,
}: {
  value: MaintenanceSettings;
  saving: boolean;
  onSave: (v: MaintenanceSettings) => void;
}) {
  const [v, setV] = useState<MaintenanceSettings>(value);
  useEffect(() => setV(value), [value]);
  const patch = (p: Partial<MaintenanceSettings>) => setV((s) => ({ ...s, ...p }));

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Wrench className="h-5 w-5 text-amber-600" />
          <h3 className="text-base font-bold text-slate-900">Trang bảo trì</h3>
          <span
            className={`ml-auto rounded-full px-3 py-1 text-xs font-bold ${
              v.enabled
                ? "bg-amber-100 text-amber-800"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            {v.enabled ? "ĐANG BẬT" : "Đang tắt"}
          </span>
        </div>

        <div className="grid gap-4">
          <div>
            <span className={label}>Tiêu đề</span>
            <input
              className={field}
              value={v.title}
              onChange={(e) => patch({ title: e.target.value })}
            />
          </div>
          <div>
            <span className={label}>Nội dung</span>
            <textarea
              className={`${field} min-h-[96px] resize-y`}
              value={v.description}
              onChange={(e) => patch({ description: e.target.value })}
            />
          </div>
          <div>
            <span className={label}>Ảnh hoặc GIF (URL)</span>
            <input
              className={field}
              value={v.image_url}
              onChange={(e) => patch({ image_url: e.target.value })}
              placeholder="https://…/bao-tri.gif"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <span className={label}>Kích thước chữ ({v.font_size}px)</span>
              <input
                type="range"
                min={12}
                max={26}
                value={v.font_size}
                onChange={(e) => patch({ font_size: Number(e.target.value) })}
                className="w-full accent-amber-600"
              />
            </div>
            <div>
              <span className={label}>Màu chữ</span>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={v.text_color || "#f8fafc"}
                  onChange={(e) => patch({ text_color: e.target.value })}
                  className="h-10 w-14 cursor-pointer rounded-lg border border-slate-300 bg-white p-1"
                />
                <button
                  type="button"
                  onClick={() => patch({ text_color: "" })}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Mặc định
                </button>
              </div>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <span className={label}>Link Facebook</span>
              <input
                className={field}
                value={v.facebook}
                onChange={(e) => patch({ facebook: e.target.value })}
              />
            </div>
            <div>
              <span className={label}>Link Zalo</span>
              <input
                className={field}
                value={v.zalo}
                onChange={(e) => patch({ zalo: e.target.value })}
              />
            </div>
            <div>
              <span className={label}>Nút liên hệ</span>
              <input
                className={field}
                value={v.contact_text}
                onChange={(e) => patch({ contact_text: e.target.value })}
                placeholder="Liên hệ Admin"
              />
            </div>
            <div>
              <span className={label}>Link nút liên hệ</span>
              <input
                className={field}
                value={v.contact_url}
                onChange={(e) => patch({ contact_url: e.target.value })}
                placeholder="https://m.me/…"
              />
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            onClick={() => onSave(v)}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Lưu
          </button>
          <button
            onClick={() => onSave({ ...v, enabled: true })}
            disabled={saving || v.enabled}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-500 disabled:opacity-50"
          >
            <Check className="h-4 w-4" /> Sử dụng
          </button>
          <button
            onClick={() => onSave({ ...v, enabled: false })}
            disabled={saving || !v.enabled}
            className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-rose-500 disabled:opacity-50"
          >
            <Power className="h-4 w-4" /> Tắt
          </button>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Khi bật, toàn bộ website sẽ chuyển sang trang bảo trì. Admin vẫn truy cập
          bình thường.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-900 p-5">
        <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-300">
          <Eye className="h-4 w-4" /> Xem trước
        </div>
        <div
          className="overflow-hidden rounded-2xl border border-slate-700 p-6 text-center"
          style={{
            background: "linear-gradient(160deg,#1e293b 0%,#243b6b 100%)",
            color: v.text_color || "#f8fafc",
          }}
        >
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-sky-500 to-cyan-400 text-white">
            <Wrench className="h-7 w-7" />
          </div>
          {v.image_url && (
            <img loading="lazy" decoding="async"
              src={v.image_url}
              alt=""
              className="mx-auto mb-4 max-h-40 w-full rounded-xl object-cover"
            />
          )}
          <div
            className="font-extrabold"
            style={{ fontSize: Math.round(v.font_size * 1.6) }}
          >
            {v.title}
          </div>
          <p className="mt-2 opacity-90" style={{ fontSize: v.font_size }}>
            {v.description}
          </p>
          {v.contact_text && (
            <span className="mt-4 inline-block rounded-full bg-sky-100 px-5 py-2 text-sm font-bold text-slate-900">
              {v.contact_text}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default PopupManager;
