import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { X, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/candy/auth-provider";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";
import { flyGiftToPost, sparkleBurst } from "@/lib/gift-fx";

/** Một món quà trong catalog `public.gift_items` (admin quản lý trong DB). */
export interface GiftItem {
  key: string;
  name: string;
  emoji: string;
  min_amount: number;
  effect: string;
  gradient: string;
  glow: string;
}

interface GiftSystemModalProps {
  open: boolean;
  postId: string;
  receiverName: string;
  onClose: () => void;
  onSent: (result: { amount: number; giftKey: string; emoji: string; giftId: string }) => void;
}

/** Catalog dự phòng khi bảng `gift_items` chưa có dữ liệu. */
const FALLBACK_ITEMS: GiftItem[] = [
  { key: "rose", name: "Hoa Hồng", emoji: "🌹", min_amount: 100, effect: "float", gradient: "", glow: "rgba(244,63,94,0.5)" },
  { key: "tulip", name: "Hoa Tulip", emoji: "🌷", min_amount: 1_000, effect: "float", gradient: "", glow: "rgba(236,72,153,0.5)" },
  { key: "bouquet", name: "Bó Hoa", emoji: "💐", min_amount: 5_000, effect: "float", gradient: "", glow: "rgba(217,70,239,0.5)" },
  { key: "giftbox", name: "Hộp Quà", emoji: "🎁", min_amount: 10_000, effect: "float", gradient: "", glow: "rgba(59,130,246,0.5)" },
  { key: "chocolate", name: "Sô Cô La", emoji: "🍫", min_amount: 20_000, effect: "float", gradient: "", glow: "rgba(180,83,9,0.5)" },
  { key: "bear", name: "Gấu Bông", emoji: "🧸", min_amount: 50_000, effect: "float", gradient: "", glow: "rgba(249,115,22,0.5)" },
  { key: "heart", name: "Trái Tim", emoji: "❤️", min_amount: 100_000, effect: "float", gradient: "", glow: "rgba(239,68,68,0.55)" },
  { key: "ring", name: "Nhẫn", emoji: "💍", min_amount: 200_000, effect: "float", gradient: "", glow: "rgba(56,189,248,0.55)" },
  { key: "diamond", name: "Kim Cương", emoji: "💎", min_amount: 300_000, effect: "float", gradient: "", glow: "rgba(34,211,238,0.55)" },
  { key: "crown", name: "Vương Miện", emoji: "👑", min_amount: 500_000, effect: "float", gradient: "", glow: "rgba(245,158,11,0.6)" },
];

const vnd = (n: number) => n.toLocaleString("vi-VN");

/**
 * GiftSystemModal — popup Gift System V2.
 *
 * • Giá quà CỐ ĐỊNH (lấy từ `gift_items.min_amount`) — không nhập số xu,
 *   không quick amount.
 * • Chọn nhiều quà: mỗi lần click tăng số lượng (x1, x2, x3…).
 * • Popup tự tính tổng, khoá scroll nền, footer luôn dính đáy.
 */
export function GiftSystemModal({
  open,
  postId,
  receiverName,
  onClose,
  onSent,
}: GiftSystemModalProps) {
  const { me, setGemBalance, refreshMe } = useAuth();
  const [items, setItems] = useState<GiftItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [qty, setQty] = useState<Record<string, number>>({});
  const sendBtnRef = useRef<HTMLButtonElement | null>(null);

  useBodyScrollLock(open);

  const balance = Number((me as any)?.gem_balance ?? 0) || 0;

  const selectedList = useMemo(
    () =>
      items
        .map((g) => ({ gift: g, count: qty[g.key] || 0 }))
        .filter((r) => r.count > 0),
    [items, qty],
  );
  const total = useMemo(
    () => selectedList.reduce((sum, r) => sum + r.gift.min_amount * r.count, 0),
    [selectedList],
  );

  const notEnough = total > balance;

  useEffect(() => {
    if (!open) return;
    setQty({});
    let alive = true;
    setLoading(true);
    void (async () => {
      const { data, error } = await supabase
        .from("gift_items" as any)
        .select("key,name,emoji,min_amount,effect,gradient,glow,is_active,event_ends_at,sort_order")
        .eq("is_active", true)
        .order("sort_order", { ascending: true }).limit(100);
      if (!alive) return;
      setLoading(false);
      if (error) {
        setItems(FALLBACK_ITEMS);
        return;
      }
      const now = Date.now();
      const list = ((data as any[]) || [])
        .filter((g) => !g.event_ends_at || new Date(g.event_ends_at).getTime() > now)
        .map((g) => ({
          key: String(g.key),
          name: String(g.name),
          emoji: String(g.emoji || "🎁"),
          min_amount: Number(g.min_amount) || 100,
          effect: String(g.effect || "float"),
          gradient: String(g.gradient || ""),
          glow: String(g.glow || "rgba(244,63,94,0.5)"),
        }));
      setItems(list.length > 0 ? list : FALLBACK_ITEMS);
    })();
    return () => {
      alive = false;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  const bump = (g: GiftItem, e: React.MouseEvent) => {
    setQty((prev) => ({ ...prev, [g.key]: (prev[g.key] || 0) + 1 }));
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    sparkleBurst({ x: r.left + r.width / 2, y: r.top + r.height / 2 }, 5);
  };

  const reset = (key: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setQty((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const send = async () => {
    if (!me) {
      toast.error("Bạn cần đăng nhập để tặng quà.");
      return;
    }
    if (selectedList.length === 0) {
      toast.error("Hãy chọn ít nhất một món quà.");
      return;
    }
    if (total > balance) {
      toast.error("❌ Bạn không đủ xu để gửi quà.");
      return;
    }

    setSending(true);
    let sentTotal = 0;
    let lastBalance: number | null = null;
    let firstGiftId = "";
    let firstEmoji = "";
    let failMessage = "";

    for (const row of selectedList) {
      for (let i = 0; i < row.count; i++) {
        const { data, error } = await supabase.rpc("send_post_gift" as any, {
          p_post_id: postId,
          p_gift_key: row.gift.key,
          p_amount: row.gift.min_amount,
        });
        const res: any = data;
        if (error || !res || res.ok === false) {
          failMessage = error?.message || res?.message || "Không gửi được quà.";
          break;
        }
        sentTotal += row.gift.min_amount;
        if (Number.isFinite(Number(res.new_balance))) lastBalance = Number(res.new_balance);
        if (!firstGiftId) {
          firstGiftId = String(res.gift_id ?? "");
          firstEmoji = row.gift.emoji;
        }
        onSent({
          amount: row.gift.min_amount,
          giftKey: row.gift.key,
          emoji: row.gift.emoji,
          giftId: String(res.gift_id ?? ""),
        });
      }
      if (failMessage) break;
    }
    setSending(false);

    if (lastBalance != null) setGemBalance(lastBalance);
    void refreshMe();

    if (sentTotal > 0) {
      const rect = sendBtnRef.current?.getBoundingClientRect();
      const from = rect
        ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
        : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      selectedList.slice(0, 4).forEach((row, i) =>
        window.setTimeout(() => flyGiftToPost(row.gift.emoji, from, postId), i * 130),
      );
      toast.success(`${firstEmoji || "🎁"} Đã tặng ${vnd(sentTotal)} xu cho ${receiverName}.`);
      onClose();
    }
    if (failMessage) toast.error(failMessage);
  };

  return createPortal(
    <div className="gs-overlay" role="dialog" aria-modal="true" aria-label="Tặng quà" onClick={onClose}>
      <motion.div
        className="gs-modal"
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, y: 18, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 320, damping: 26 }}
      >
        <header className="gs-head">
          <div>
            <h3 className="gs-title">🎁 Tặng quà</h3>
            <p className="gs-sub">Gửi tới {receiverName}</p>
          </div>
          <button type="button" className="gs-close" onClick={onClose} aria-label="Đóng">
            <X size={18} />
          </button>
        </header>

        <div className="gs-balance">
          <span>Số dư của bạn</span>
          <strong>{vnd(balance)} xu</strong>
        </div>

        <div className="gs-body" data-scroll-lock-ignore>
          {loading ? (
            <div className="gs-loading">
              <Loader2 size={20} className="gs-spin" /> Đang tải quà…
            </div>
          ) : items.length === 0 ? (
            <div className="gs-loading">Chưa có quà nào khả dụng.</div>
          ) : (
            <div className="gs-grid">
              {items.map((g) => {
                const count = qty[g.key] || 0;
                return (
                  <motion.button
                    key={g.key}
                    type="button"
                    className={`gs-item ${count > 0 ? "is-active" : ""}`}
                    style={{ ["--gs-glow" as any]: g.glow }}
                    onClick={(e) => bump(g, e)}
                    whileTap={{ scale: 0.92 }}
                  >
                    <motion.span
                      className="gs-item-emoji"
                      aria-hidden
                      key={`${g.key}-${count}`}
                      initial={count > 0 ? { scale: 0.7, opacity: 0.4 } : false}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 420, damping: 16 }}
                    >
                      {g.emoji}
                    </motion.span>
                    <span className="gs-item-name">{g.name}</span>
                    <span className="gs-item-min">{vnd(g.min_amount)} xu</span>
                    <AnimatePresence>
                      {count > 0 ? (
                        <motion.span
                          className="gs-item-qty"
                          initial={{ scale: 0.4, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0.4, opacity: 0 }}
                          onClick={(e) => reset(g.key, e)}
                          title="Bỏ chọn"
                        >
                          x{count}
                        </motion.span>
                      ) : null}
                    </AnimatePresence>
                  </motion.button>
                );
              })}
            </div>
          )}

          {selectedList.length > 0 ? (
            <ul className="gs-cart">
              {selectedList.map((r) => (
                <li key={r.gift.key}>
                  <span className="gs-cart-name">
                    {r.gift.emoji} {r.gift.name} <b>x{r.count}</b>
                  </span>
                  <span className="gs-cart-amount">{vnd(r.gift.min_amount * r.count)} xu</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        {notEnough ? (
          <div className="gs-total" style={{ color: "#f87171", fontSize: 13 }}>
            <span>Số dư không đủ</span>
            <strong>Thiếu {vnd(total - balance)} xu</strong>
          </div>
        ) : null}

        <div className="gs-total">
          <span>Tổng</span>
          <motion.strong key={total} initial={{ scale: 0.9 }} animate={{ scale: 1 }}>
            {vnd(total)} xu
          </motion.strong>
        </div>

        <footer className="gs-foot">
          <button type="button" className="gs-btn gs-btn--ghost" onClick={onClose}>
            Huỷ
          </button>
          <button
            ref={sendBtnRef}
            type="button"
            className="gs-btn gs-btn--send"
            onClick={() => { if (notEnough) { toast.error("❌ Bạn không đủ xu để gửi quà."); return; } void send(); }}
            disabled={sending || total <= 0 || notEnough}
          >
            {sending ? <Loader2 size={16} className="gs-spin" /> : "🎁"}
            <span>Gửi quà</span>
          </button>
        </footer>
      </motion.div>
    </div>,
    document.body,
  );
}
