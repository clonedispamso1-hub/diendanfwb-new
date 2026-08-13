/**
 * Admin — Trợ lý (Mini Chat): bật/tắt, tiêu đề, nội dung, link Game,
 * link Liên hệ Admin, trang hiển thị. Lưu vào admin_site_settings.assistant_config.
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { adminSetSiteSetting } from "@/lib/admin-db";
import {
  ASSISTANT_DEFAULT,
  ASSISTANT_EVENT,
  fetchAssistantConfig,
  invalidateAssistantConfig,
  type AssistantConfig,
} from "@/lib/assistant-config";

const input: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(120,120,140,0.3)",
  background: "transparent",
  color: "inherit",
  fontSize: 14,
};

const PAGES: { key: keyof AssistantConfig["pages"]; label: string }[] = [
  { key: "home", label: "Trang chủ" },
  { key: "profile", label: "Hồ sơ" },
  { key: "live", label: "Live" },
  { key: "wallet", label: "Wallet" },
  { key: "post", label: "Bài viết" },
];

export function AssistantManager() {
  const [cfg, setCfg] = useState<AssistantConfig>(ASSISTANT_DEFAULT);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    invalidateAssistantConfig();
    setCfg(await fetchAssistantConfig());
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      await adminSetSiteSetting("assistant_config", { ...cfg });
      invalidateAssistantConfig();
      window.dispatchEvent(new CustomEvent(ASSISTANT_EVENT));
      toast.success("Đã lưu cấu hình Trợ lý.");
    } catch (e: any) {
      toast.error("Lưu thất bại: " + (e?.message || "lỗi không xác định"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 620 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>🤖 Trợ lý (Mini Chat)</h2>
        <p style={{ margin: "6px 0 0", fontSize: 13, opacity: 0.7 }}>
          Cấu hình bong bóng trợ lý nổi hiển thị trên website.
        </p>
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 600 }}>
        <input
          type="checkbox"
          checked={cfg.enabled}
          onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })}
        />
        Bật bong bóng trợ lý
      </label>

      <Field label="Tiêu đề">
        <input
          style={input}
          value={cfg.title}
          onChange={(e) => setCfg({ ...cfg, title: e.target.value })}
          placeholder="Xin chào 👋"
        />
      </Field>

      <Field label="Nội dung">
        <input
          style={input}
          value={cfg.subtitle}
          onChange={(e) => setCfg({ ...cfg, subtitle: e.target.value })}
          placeholder="Tôi có thể giúp gì?"
        />
      </Field>

      <Field label="Link Game (đường dẫn nội bộ hoặc https://…)">
        <input
          style={input}
          value={cfg.game_url}
          onChange={(e) => setCfg({ ...cfg, game_url: e.target.value })}
          placeholder="/taixiu"
        />
      </Field>

      <Field label="Link Liên hệ Admin (bỏ trống = dùng link chung của site)">
        <input
          style={input}
          value={cfg.admin_url}
          onChange={(e) => setCfg({ ...cfg, admin_url: e.target.value })}
          placeholder="https://zalo.me/..."
        />
      </Field>

      <Field label="Link Facebook Admin (hiện trong menu Liên hệ Admin)">
        <input
          style={input}
          value={cfg.facebook_url}
          onChange={(e) => setCfg({ ...cfg, facebook_url: e.target.value })}
          placeholder="https://facebook.com/..."
        />
      </Field>

      <Field label="Link Zalo (bỏ trống = dùng link chung của popup VIP)">
        <input
          style={input}
          value={cfg.zalo_url}
          onChange={(e) => setCfg({ ...cfg, zalo_url: e.target.value })}
          placeholder="https://zalo.me/..."
        />
      </Field>

      <Field label="Link Telegram">
        <input
          style={input}
          value={cfg.telegram_url}
          onChange={(e) => setCfg({ ...cfg, telegram_url: e.target.value })}
          placeholder="https://t.me/..."
        />
      </Field>

      <Field label="Hiển thị ở những trang nào">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          {PAGES.map((p) => (
            <label key={p.key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
              <input
                type="checkbox"
                checked={cfg.pages[p.key]}
                onChange={(e) => setCfg({ ...cfg, pages: { ...cfg.pages, [p.key]: e.target.checked } })}
              />
              {p.label}
            </label>
          ))}
        </div>
      </Field>

      <div>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          style={{
            padding: "11px 20px",
            borderRadius: 14,
            border: "none",
            cursor: saving ? "wait" : "pointer",
            fontWeight: 800,
            color: "#fff",
            background: "linear-gradient(135deg, #8b5cf6, #ec4899)",
          }}
        >
          {saving ? "Đang lưu…" : "Lưu cấu hình"}
        </button>
      </div>
    </div>
  );
}

function Field({ label: l, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <span style={{ fontSize: 13, fontWeight: 700, opacity: 0.8 }}>{l}</span>
      {children}
    </div>
  );
}

export default AssistantManager;
