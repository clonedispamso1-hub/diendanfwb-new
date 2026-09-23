/**
 * Admin Panel → "Nhóm Zalo Mồi" → 3 mục quản lý card quốc gia của popup "VIP Zalo".
 * Mỗi quốc gia 1 section riêng: tên card, ô sửa subtitle, nút Bật/Tắt.
 * Lưu trên Supabase #4 (bảng zalo_country_cards) → popup user đọc trực tiếp.
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Save } from "lucide-react";
import {
  getZaloCountryCards,
  saveZaloCountryCard,
  ZALO_COUNTRY_DEFAULTS,
  type ZaloCountryCard,
} from "@/lib/zalo-country-cards";
import { CountryFlag } from "@/components/candy/zalo-country-flags";

const card: React.CSSProperties = {
  border: "1px solid rgba(120,120,140,0.25)",
  borderRadius: 14,
  padding: 14,
  display: "grid",
  gap: 12,
};
const btn = (bg: string): React.CSSProperties => ({
  border: 0,
  borderRadius: 10,
  padding: "9px 14px",
  background: bg,
  color: "#fff",
  fontWeight: 700,
  fontSize: 13,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
});
const input: React.CSSProperties = {
  width: "100%",
  border: "1px solid rgba(120,120,140,0.35)",
  borderRadius: 10,
  padding: "9px 11px",
  fontSize: 13,
  background: "transparent",
  color: "inherit",
};

function CountryRow({
  item,
  onSaved,
}: {
  item: ZaloCountryCard;
  onSaved: (next: ZaloCountryCard) => void;
}) {
  const [subtitle, setSubtitle] = useState(item.subtitle);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSubtitle(item.subtitle);
  }, [item.subtitle]);

  const saveSubtitle = async () => {
    setBusy(true);
    try {
      await saveZaloCountryCard(item.id, { subtitle });
      onSaved({ ...item, subtitle });
      toast.success(`Đã lưu mô tả cho ${item.title}.`);
    } catch (e: any) {
      toast.error(e?.message || "Không lưu được mô tả.");
    }
    setBusy(false);
  };

  const toggle = async () => {
    const next = !item.enabled;
    setBusy(true);
    try {
      await saveZaloCountryCard(item.id, { enabled: next });
      onSaved({ ...item, enabled: next });
      toast.success(next ? `Đã bật ${item.title}.` : `Đã tắt ${item.title}.`);
    } catch (e: any) {
      toast.error(e?.message || "Không lưu được trạng thái.");
    }
    setBusy(false);
  };

  return (
    <div
      style={{
        border: "1px solid rgba(120,120,140,0.22)",
        borderRadius: 12,
        padding: 12,
        display: "grid",
        gap: 10,
        opacity: item.enabled ? 1 : 0.6,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          style={{
            width: 34,
            height: 34,
            borderRadius: "50%",
            overflow: "hidden",
            display: "grid",
            placeItems: "center",
            background: "#fff",
            flex: "0 0 auto",
          }}
        >
          <CountryFlag id={item.id} />
        </span>
        <strong style={{ fontSize: 13.5 }}>{item.title}</strong>
      </div>

      <label style={{ display: "grid", gap: 6, fontSize: 12, opacity: 0.8 }}>
        Mô tả (subtitle) hiển thị dưới tên card
        <input
          style={input}
          value={subtitle}
          disabled={busy}
          onChange={(e) => setSubtitle(e.target.value)}
          placeholder="Nhập mô tả…"
        />
      </label>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          style={btn("#0ea5e9")}
          disabled={busy || subtitle === item.subtitle}
          onClick={() => void saveSubtitle()}
        >
          <Save size={14} /> Lưu mô tả
        </button>
        <button
          type="button"
          style={btn(item.enabled ? "#16a34a" : "#64748b")}
          disabled={busy}
          onClick={() => void toggle()}
        >
          {item.enabled ? "Đang BẬT — bấm để Tắt" : "Đang TẮT — bấm để Bật"}
        </button>
      </div>
      <span style={{ fontSize: 12, opacity: 0.65 }}>
        {item.enabled
          ? "Card đang hiển thị trong popup VIP Zalo."
          : "Card đang bị ẩn khỏi popup VIP Zalo."}
      </span>
    </div>
  );
}

export function ZaloCountryCardsManager() {
  const [cards, setCards] = useState<ZaloCountryCard[]>(ZALO_COUNTRY_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setCards(await getZaloCountryCards());
      setErr(null);
    } catch (e: any) {
      setErr(e?.message || "Lỗi tải cấu hình");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onSaved = (next: ZaloCountryCard) =>
    setCards((prev) => prev.map((c) => (c.id === next.id ? next : c)));

  return (
    <div style={card}>
      <div>
        <strong style={{ fontSize: 14 }}>Card quốc gia trong popup VIP Zalo</strong>
        <p style={{ margin: "4px 0 0", fontSize: 12.5, opacity: 0.7 }}>
          Bật/Tắt và sửa mô tả cho từng card quốc gia. Popup khi user bấm icon Zalo nổi sẽ hiển thị
          đúng theo cấu hình này.
        </p>
      </div>

      {loading ? <p style={{ fontSize: 13, opacity: 0.7 }}>Đang tải…</p> : null}
      {err ? (
        <p style={{ fontSize: 13, color: "#ef4444" }}>
          {err} — hãy chạy file supabase-sql/SB4/2026-09-18b_zalo_country_cards.sql trong SQL Editor
          của Supabase 4.
        </p>
      ) : null}

      <div style={{ display: "grid", gap: 10 }}>
        {cards.map((item) => (
          <CountryRow key={item.id} item={item} onSaved={onSaved} />
        ))}
      </div>
    </div>
  );
}

export default ZaloCountryCardsManager;
