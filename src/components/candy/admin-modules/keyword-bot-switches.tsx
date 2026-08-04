import { useEffect, useState } from "react";
import { Save, ShieldAlert, Bot, Heart, Eye, MessageSquare, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ModuleShell, StatCard } from "./module-shell";
import { logAdminAction } from "@/lib/admin-permissions";

const KW_KEY = "admin.banned_keywords.v1";
const BOT_KEY = "admin.bot_switches.v1";

type BotSwitch = {
  id: string;
  label: string;
  desc: string;
  icon: React.ComponentType<{ size?: number }>;
};

const BOTS: BotSwitch[] = [
  { id: "bot_like", label: "Bot Like", desc: "Tự động like bài viết mới", icon: Heart },
  { id: "bot_view", label: "Bot View", desc: "Tăng lượt xem bài / video", icon: Eye },
  { id: "bot_comment", label: "Bot Comment", desc: "Tự động bình luận bài viết", icon: MessageSquare },
  { id: "bot_anti_spam", label: "Bot Chống Spam", desc: "Quét & xoá spam tự động", icon: ShieldAlert },
  { id: "bot_moderation", label: "Bot Kiểm duyệt", desc: "Ẩn nội dung chứa từ khoá cấm", icon: Bot },
];

export function KeywordBotSwitches() {
  const { toast } = useToast();
  const [keywords, setKeywords] = useState("");
  const [savedCount, setSavedCount] = useState(0);
  const [switches, setSwitches] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const kw = localStorage.getItem(KW_KEY) ?? "";
    setKeywords(kw);
    setSavedCount(parseList(kw).length);
    try {
      const s = JSON.parse(localStorage.getItem(BOT_KEY) ?? "{}");
      setSwitches(s);
    } catch {
      setSwitches({});
    }
  }, []);

  function parseList(raw: string) {
    return raw
      .split(/[,\n]/)
      .map((x) => x.trim().toLowerCase())
      .filter((x) => x.length > 0);
  }

  async function saveKeywords() {
    const list = parseList(keywords);
    localStorage.setItem(KW_KEY, list.join(", "));
    setSavedCount(list.length);
    await logAdminAction("moderation", "update_banned_keywords", null, null, { count: list.length });
    toast({ title: `Đã lưu ${list.length} từ khoá cấm`, description: "Bot kiểm duyệt sẽ tự động quét." });
  }

  async function toggleBot(id: string, on: boolean) {
    const next = { ...switches, [id]: on };
    setSwitches(next);
    localStorage.setItem(BOT_KEY, JSON.stringify(next));
    await logAdminAction("bot_control", on ? "enable_bot_type" : "disable_bot_type", "bot_type", id);
    toast({ title: on ? "Đã kích hoạt Bot thành công" : "Đã tắt Bot", description: BOTS.find((b) => b.id === id)?.label ?? id });
  }

  function clearKeywords() {
    if (!confirm("Xoá toàn bộ từ khoá cấm?")) return;
    setKeywords("");
    localStorage.removeItem(KW_KEY);
    setSavedCount(0);
    toast({ title: "Đã xoá danh sách từ khoá" });
  }

  const activeBots = Object.values(switches).filter(Boolean).length;

  return (
    <ModuleShell title="Keyword & Bot Control" subtitle="Từ khoá cấm + công tắc các loại Bot">
      <div className="adm-stat-grid">
        <StatCard label="Từ khoá cấm" value={savedCount} tone={savedCount ? "good" : "neutral"} />
        <StatCard label="Bot đang bật" value={activeBots} tone={activeBots ? "good" : "neutral"} />
        <StatCard label="Tổng loại Bot" value={BOTS.length} />
      </div>

      <div
        style={{
          background: "#121212",
          border: "1px solid #deff9a",
          borderRadius: 14,
          padding: 16,
          boxShadow: "0 0 14px rgba(222,255,154,.15)",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div className="adm-section-title" style={{ marginTop: 0 }}>Từ khoá cấm</div>
        <div className="adm-label">Nhập từ khoá, phân cách bằng dấu phẩy hoặc xuống dòng</div>
        <textarea
          className="adm-textarea"
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
          placeholder="vd: spam, lừa đảo, hack, link xấu, ..."
        />
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={saveKeywords} className="adm-btn-primary" style={{ flex: 1 }}>
            <Save size={16} /> Lưu danh sách
          </button>
          <button onClick={clearKeywords} className="adm-btn-ghost" style={{ borderColor: "#ef4444", color: "#fca5a5" }}>
            <Trash2 size={14} /> Xoá tất cả
          </button>
        </div>
        <div className="adm-note">
          <ShieldAlert size={12} /> Bot kiểm duyệt sẽ ẩn bài viết / bình luận chứa các từ khoá trên.
        </div>
      </div>

      <div className="adm-section-title">Công tắc Bot</div>
      <div className="adm-list">
        {BOTS.map((b) => {
          const on = !!switches[b.id];
          const Icon = b.icon;
          return (
            <div key={b.id} className="adm-row" style={{ borderColor: on ? "#deff9a" : undefined, boxShadow: on ? "0 0 12px rgba(222,255,154,.18)" : undefined }}>
              <div className="adm-row-icon" style={{ color: on ? "#deff9a" : undefined }}>
                <Icon size={16} />
              </div>
              <div className="adm-row-main">
                <div className="adm-row-title">{b.label}</div>
                <div className="adm-row-meta">{b.desc}</div>
              </div>
              <label className="adm-switch">
                <input type="checkbox" checked={on} onChange={(e) => toggleBot(b.id, e.target.checked)} />
                <span className="slider" />
              </label>
            </div>
          );
        })}
      </div>
    </ModuleShell>
  );
}
