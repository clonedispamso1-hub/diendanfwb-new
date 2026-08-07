/**
 * FeaturePopupManager — Admin Panel → "Quản lý Popup".
 * Chỉnh nội dung của toàn bộ popup dùng chung (Popup Engine).
 * Không tạo popup mới bằng code: thêm popup_key ở đây là đủ.
 */
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Save, Eye, Plus } from "lucide-react";
import {
  loadPopupSettings,
  saveFeaturePopups,
  DEFAULT_LINKS,
  DEFAULT_VIP_BENEFITS,
  type PopupLinks,
  POPUP_ICONS,
  POPUP_EFFECTS,
  POPUP_THEMES,
  type FeaturePopupConfig,
} from "@/lib/feature-popups";
import { openPopup } from "@/components/candy/popup-engine";

const field =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200 placeholder:text-slate-400";
const label =
  "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500";

export function FeaturePopupManager() {
  const [items, setItems] = useState<FeaturePopupConfig[]>([]);
  const [links, setLinks] = useState<PopupLinks>({ ...DEFAULT_LINKS });
  const [activeKey, setActiveKey] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { items: list, links: lk } = await loadPopupSettings();
      setItems(list);
      setLinks(lk);
      setActiveKey(list[0]?.key ?? "");
      setLoading(false);
    })();
  }, []);

  const draft = useMemo(
    () => items.find((i) => i.key === activeKey) ?? null,
    [items, activeKey],
  );

  const patch = (p: Partial<FeaturePopupConfig>) =>
    setItems((prev) =>
      prev.map((i) => (i.key === activeKey ? { ...i, ...p } : i)),
    );

  const save = async () => {
    setSaving(true);
    try {
      await saveFeaturePopups(items, links);
      toast.success("Đã lưu cấu hình popup");
    } catch (e) {
      toast.error("Lưu thất bại", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const addPopup = () => {
    const key = window.prompt("popup_key mới (ví dụ: hd_image)")?.trim();
    if (!key) return;
    if (items.some((i) => i.key === key)) {
      toast.error("popup_key đã tồn tại");
      return;
    }
    const next: FeaturePopupConfig = {
      key,
      label: key,
      title: "Tiêu đề popup",
      icon: "📢",
      imageUrl: "",
      content: "Nội dung popup...",
      leftText: "Đóng",
      rightText: "Liên hệ Admin",
      rightUrl: "",
      effect: "fade",
      theme: "gradient",
      enabled: true,
      condition: "",
      benefits: [...DEFAULT_VIP_BENEFITS],
      buttonColor: "",
    };
    setItems((prev) => [...prev, next]);
    setActiveKey(key);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Đang tải popup...
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      {/* Danh sách popup */}
      <div className="rounded-2xl border border-slate-200 bg-white p-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">Danh sách popup</h3>
          <button
            onClick={addPopup}
            className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2 py-1 text-xs font-semibold text-white"
          >
            <Plus className="h-3 w-3" /> Thêm
          </button>
        </div>
        <div className="grid gap-1">
          {items.map((i) => (
            <button
              key={i.key}
              onClick={() => setActiveKey(i.key)}
              className={`flex items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition ${
                i.key === activeKey
                  ? "bg-sky-50 font-semibold text-sky-900 ring-1 ring-sky-200"
                  : "text-slate-700 hover:bg-slate-50"
              }`}
            >
              <span>{i.icon}</span>
              <span className="flex-1 truncate">{i.label}</span>
              <span
                className={`h-2 w-2 rounded-full ${i.enabled ? "bg-emerald-500" : "bg-slate-300"}`}
              />
            </button>
          ))}
        </div>
      </div>

      {/* Trình chỉnh sửa */}
      {draft ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {draft.label}
              </h3>
              <code className="text-xs text-slate-500">
                openPopup("{draft.key}")
              </code>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() =>
                  openPopup(draft.key, {
                    overrides: { ...draft, enabled: true },
                  })
                }
                className="inline-flex items-center gap-1 rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700"
              >
                <Eye className="h-4 w-4" /> Xem trước
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="inline-flex items-center gap-1 rounded-xl bg-sky-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Lưu
              </button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <span className={label}>Tên trong Admin</span>
              <input
                className={field}
                value={draft.label}
                onChange={(e) => patch({ label: e.target.value })}
              />
            </div>

            <div className="sm:col-span-2">
              <span className={label}>Tiêu đề</span>
              <input
                className={field}
                value={draft.title}
                onChange={(e) => patch({ title: e.target.value })}
              />
            </div>

            <div className="sm:col-span-2">
              <span className={label}>Icon</span>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {POPUP_ICONS.map((ic) => (
                  <button
                    key={ic}
                    onClick={() => patch({ icon: ic })}
                    className={`h-9 w-9 rounded-xl text-lg transition ${
                      draft.icon === ic
                        ? "bg-sky-100 ring-2 ring-sky-400"
                        : "bg-slate-100 hover:bg-slate-200"
                    }`}
                  >
                    {ic}
                  </button>
                ))}
              </div>
              <input
                className={field}
                value={draft.icon}
                onChange={(e) => patch({ icon: e.target.value })}
                placeholder="Hoặc dán emoji / ký tự riêng"
              />
            </div>

            <div className="sm:col-span-2">
              <span className={label}>Ảnh minh họa (PNG/JPG/WEBP)</span>
              <input
                className={field}
                value={draft.imageUrl}
                onChange={(e) => patch({ imageUrl: e.target.value })}
                placeholder="https://..."
              />
            </div>

            <div className="sm:col-span-2">
              <span className={label}>Nội dung</span>
              <textarea
                className={`${field} min-h-[92px]`}
                value={draft.content}
                onChange={(e) => patch({ content: e.target.value })}
              />
            </div>

            <div>
              <span className={label}>Nút trái</span>
              <input
                className={field}
                value={draft.leftText}
                onChange={(e) => patch({ leftText: e.target.value })}
              />
            </div>
            <div>
              <span className={label}>Nút phải</span>
              <input
                className={field}
                value={draft.rightText}
                onChange={(e) => patch({ rightText: e.target.value })}
              />
            </div>

            <div className="sm:col-span-2">
              <span className={label}>Link nút phải</span>
              <input
                className={field}
                value={draft.rightUrl}
                onChange={(e) => patch({ rightUrl: e.target.value })}
                placeholder="https://facebook.com/... | https://zalo.me/..."
              />
            </div>

            <div>
              <span className={label}>Hiệu ứng</span>
              <select
                className={field}
                value={draft.effect}
                onChange={(e) => patch({ effect: e.target.value as any })}
              >
                {POPUP_EFFECTS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <span className={label}>Màu</span>
              <select
                className={field}
                value={draft.theme}
                onChange={(e) => patch({ theme: e.target.value as any })}
              >
                {POPUP_THEMES.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <span className={label}>Danh sách quyền lợi (mỗi dòng 1 mục)</span>
              <textarea
                className={`${field} min-h-[110px]`}
                value={(draft.benefits ?? []).join("\n")}
                onChange={(e) =>
                  patch({
                    benefits: e.target.value
                      .split("\n")
                      .map((v) => v.trim())
                      .filter(Boolean),
                  })
                }
                placeholder={"Kết bạn Zalo\nXem số Zalo\nVào nhóm VIP"}
              />
            </div>

            <div className="sm:col-span-2">
              <span className={label}>Màu nút chính</span>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  className="h-10 w-12 cursor-pointer rounded-lg border border-slate-300"
                  value={/^#[0-9a-fA-F]{6}$/.test(draft.buttonColor ?? "") ? draft.buttonColor : "#2563eb"}
                  onChange={(e) => patch({ buttonColor: e.target.value })}
                />
                <input
                  className={field}
                  value={draft.buttonColor ?? ""}
                  onChange={(e) => patch({ buttonColor: e.target.value })}
                  placeholder="#2563eb hoặc linear-gradient(...) — để trống = theo màu popup"
                />
              </div>
            </div>

            <div className="sm:col-span-2">
              <span className={label}>Điều kiện hiển thị</span>
              <input
                className={field}
                value={draft.condition}
                onChange={(e) => patch({ condition: e.target.value })}
                placeholder="Chưa vào VIP / Chưa Follow Fanpage / Hết lượt miễn phí..."
              />
            </div>

            <label className="sm:col-span-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={draft.enabled}
                onChange={(e) => patch({ enabled: e.target.checked })}
                className="h-4 w-4"
              />
              Bật popup này
            </label>
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-white p-4 lg:col-span-2">
        <h3 className="mb-1 text-base font-bold text-slate-900">Liên kết dùng chung</h3>
        <p className="mb-3 text-xs text-slate-500">
          Dùng cho toàn bộ popup VIP. Dán link vào ô “Link nút phải” của popup nếu
          muốn nút mở đúng liên kết này.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {([
            ["facebook", "Link Facebook"],
            ["zalo", "Link Zalo"],
            ["telegram", "Link Telegram"],
            ["fanpage", "Link Fanpage"],
            ["zaloGroup", "Link Nhóm Zalo"],
          ] as [keyof PopupLinks, string][]).map(([k, lb]) => (
            <div key={k}>
              <span className={label}>{lb}</span>
              <input
                className={field}
                value={links[k] ?? ""}
                onChange={(e) => setLinks((prev) => ({ ...prev, [k]: e.target.value }))}
                placeholder="https://..."
              />
            </div>
          ))}
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="mt-3 inline-flex items-center gap-1 rounded-xl bg-sky-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Lưu liên kết
        </button>
      </div>
    </div>
  );
}

export default FeaturePopupManager;
