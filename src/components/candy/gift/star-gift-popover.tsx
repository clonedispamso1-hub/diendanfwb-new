import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Star, X, Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useRealtime, pickNew } from "@/lib/realtime-registry";
import { useAuth } from "@/components/candy/auth-provider";

type Props = {
  open: boolean;
  onClose: () => void;
  receiverId: string;
  receiverName?: string;
  /** Nút ⭐ để làm anchor + origin bay sao. */
  anchorRef: React.RefObject<HTMLElement | null>;
  /** Avatar người nhận để làm target bay sao + glow. */
  receiverAvatarRef: React.RefObject<HTMLElement | null>;
  onSent?: (amount: number) => void;
};

const QUICK_AMOUNTS = [1_000, 5_000, 10_000, 50_000, 100_000];

type FlightState = {
  id: number;
  amount: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
  targetRect: DOMRect;
};

export function StarGiftPopover({
  open,
  onClose,
  receiverId,
  receiverName,
  anchorRef,
  receiverAvatarRef,
  onSent,
}: Props) {
  const { me } = useAuth();
  const [balance, setBalance] = useState<number>(Number(me?.gem_balance ?? 0));
  const [sending, setSending] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [customVal, setCustomVal] = useState("");
  const [flights, setFlights] = useState<FlightState[]>([]);
  const flightIdRef = useRef(0);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

  // Sync balance khi mở
  useEffect(() => {
    if (open) {
      setBalance(Number(me?.gem_balance ?? 0));
      setError(null);
      setCustomOpen(false);
      setCustomVal("");
    }
  }, [open, me?.gem_balance]);

  // Realtime balance — dùng chung 1 channel `profile-self:<id>` qua registry.
  useRealtime(
    open && me?.id ? `profile-self:${me.id}` : null,
    me?.id ? [{ table: "profiles", event: "UPDATE", filter: `id=eq.${me.id}` }] : [],
    (payload) => {
      const next = (pickNew(payload) as any)?.gem_balance;
      if (typeof next === "number") setBalance(next);
    },
  );

  // Position popover neo dưới anchor
  useEffect(() => {
    if (!open) return;
    const compute = () => {
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const top = Math.min(window.innerHeight - 40, r.bottom + 8);
      const right = Math.max(8, window.innerWidth - r.right);
      setPos({ top, right });
    };
    compute();
    window.addEventListener("resize", compute);
    window.addEventListener("scroll", compute, true);
    return () => {
      window.removeEventListener("resize", compute);
      window.removeEventListener("scroll", compute, true);
    };
  }, [open, anchorRef]);

  // Đóng khi bấm ngoài / Esc
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const doSend = async (amount: number) => {
    if (!me?.id || sending) return;
    setError(null);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Số ⭐ không hợp lệ.");
      return;
    }
    if (balance < amount) {
      setError("Bạn không đủ ⭐.");
      return;
    }
    {
      const { ensureAllowed } = await import("@/lib/restriction-guard");
      if (!(await ensureAllowed("gift"))) return;
    }
    setSending(amount);

    // Chuẩn bị tọa độ bay sao TRƯỚC khi await để rect còn chuẩn
    const fromEl = anchorRef.current;
    const toEl = receiverAvatarRef.current;
    const fromRect = fromEl?.getBoundingClientRect();
    const toRect = toEl?.getBoundingClientRect();

    const { error: rpcErr } = await supabase.rpc("send_message_gift" as any, {
      p_receiver_id: receiverId,
      p_gift_key: "star",
      p_gift_name: "Ngôi sao",
      p_gift_emoji: "⭐",
      p_amount: amount,
    });

    setSending(null);

    if (rpcErr) {
      const msg = rpcErr.message || "";
      if (msg.includes("Insufficient")) setError("Không đủ ⭐ trong ví.");
      else if (msg.includes("yourself")) setError("Không thể tặng chính mình.");
      else setError("Không gửi được. Thử lại nhé.");
      return;
    }

    // Optimistic trừ số dư + animation
    setBalance((b) => Math.max(0, b - amount));
    if (fromRect && toRect) {
      const id = ++flightIdRef.current;
      setFlights((prev) => [
        ...prev,
        {
          id,
          amount,
          from: { x: fromRect.left + fromRect.width / 2, y: fromRect.top + fromRect.height / 2 },
          to: { x: toRect.left + toRect.width / 2, y: toRect.top + toRect.height / 2 },
          targetRect: toRect,
        },
      ]);
      // Dọn dẹp sau khi hoạt ảnh xong
      window.setTimeout(() => {
        setFlights((prev) => prev.filter((f) => f.id !== id));
      }, 2200);
    }

    onSent?.(amount);
    onClose();
  };

  const stars = useMemo(() => Array.from({ length: 26 }, (_, i) => i), []);

  return (
    <>
      {/* Popover */}
      <AnimatePresence>
        {open && pos ? (
          <>
            {/* Backdrop trong suốt để bắt click-outside — không phủ tối */}
            <div
              className="fixed inset-0 z-[900]"
              onClick={onClose}
              aria-hidden
            />
            <motion.div
              key="star-popover"
              initial={{ opacity: 0, y: -6, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.96 }}
              transition={{ duration: 0.18, ease: [0.22, 0.61, 0.36, 1] }}
              className="star-popover"
              style={{ top: pos.top, right: pos.right }}
              role="dialog"
              aria-label="Tặng sao tương tác"
            >
              <div className="star-popover__head">
                <div className="star-popover__title">
                  <Sparkles size={14} className="star-popover__title-ico" />
                  Tặng ⭐ tương tác
                </div>
                <button
                  type="button"
                  className="star-popover__close"
                  onClick={onClose}
                  aria-label="Đóng"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="star-popover__balance">
                <Star size={13} className="star-popover__balance-ico" />
                <span className="star-popover__balance-label">Số dư</span>
                <span className="star-popover__balance-val">
                  {balance.toLocaleString("vi-VN")} ⭐
                </span>
              </div>

              {receiverName ? (
                <div className="star-popover__to">
                  Gửi tới <b>{receiverName}</b>
                </div>
              ) : null}

              <div className="star-popover__grid">
                {QUICK_AMOUNTS.map((amt) => {
                  const disabled = sending !== null || balance < amt;
                  const active = sending === amt;
                  return (
                    <button
                      key={amt}
                      type="button"
                      disabled={disabled}
                      onClick={() => doSend(amt)}
                      className={`star-chip ${active ? "is-loading" : ""}`}
                    >
                      {active ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <>
                          <span className="star-chip__ico">⭐</span>
                          <span className="star-chip__amt">
                            {amt.toLocaleString("vi-VN")}
                          </span>
                        </>
                      )}
                    </button>
                  );
                })}
                <button
                  type="button"
                  className={`star-chip star-chip--custom ${customOpen ? "is-active" : ""}`}
                  onClick={() => setCustomOpen((v) => !v)}
                  disabled={sending !== null}
                >
                  <span className="star-chip__ico">✨</span>
                  <span className="star-chip__amt">Tuỳ chỉnh</span>
                </button>
              </div>

              <AnimatePresence initial={false}>
                {customOpen ? (
                  <motion.div
                    key="custom"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.18 }}
                    className="star-popover__custom-wrap"
                  >
                    <div className="star-popover__custom">
                      <input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        placeholder="Nhập số ⭐"
                        value={customVal}
                        onChange={(e) => setCustomVal(e.target.value)}
                        className="star-popover__input"
                      />
                      <button
                        type="button"
                        className="star-popover__send"
                        disabled={sending !== null || !customVal}
                        onClick={() => doSend(parseInt(customVal, 10) || 0)}
                      >
                        {sending !== null ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          "Gửi"
                        )}
                      </button>
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>

              {error ? (
                <div className="star-popover__error">{error}</div>
              ) : (
                <div className="star-popover__hint">
                  Trừ trực tiếp vào ví, gửi qua Gift Escrow như thường.
                </div>
              )}
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>

      {/* Flight overlay (portal) */}
      {typeof document !== "undefined"
        ? createPortal(
            <div className="star-flight-layer" aria-hidden>
              <AnimatePresence>
                {flights.map((f) => (
                  <FlightBurst key={f.id} flight={f} stars={stars} />
                ))}
              </AnimatePresence>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function FlightBurst({
  flight,
  stars,
}: {
  flight: FlightState;
  stars: number[];
}) {
  const { from, to, amount, targetRect } = flight;
  const dx = to.x - from.x;
  const dy = to.y - from.y;

  return (
    <>
      {/* Ngôi sao bay */}
      {stars.map((i) => {
        const delay = (i / stars.length) * 0.35;
        const spread = 60;
        const jitterX = (Math.random() - 0.5) * spread;
        const jitterY = (Math.random() - 0.5) * spread;
        const scale = 0.6 + Math.random() * 0.7;
        return (
          <motion.span
            key={i}
            className="star-flight"
            initial={{ x: from.x, y: from.y, opacity: 0, scale: 0.4 }}
            animate={{
              x: [from.x, from.x + dx * 0.45 + jitterX, to.x],
              y: [from.y, from.y + dy * 0.45 + jitterY, to.y],
              opacity: [0, 1, 1, 0],
              scale: [0.4, scale, scale, 0.9],
            }}
            transition={{
              duration: 1.0,
              delay,
              times: [0, 0.25, 0.85, 1],
              ease: [0.22, 0.61, 0.36, 1],
            }}
          >
            ⭐
          </motion.span>
        );
      })}

      {/* Glow avatar người nhận */}
      <motion.span
        className="star-flight-glow"
        style={{
          left: targetRect.left,
          top: targetRect.top,
          width: targetRect.width,
          height: targetRect.height,
        }}
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: [0, 0.9, 0.9, 0], scale: [0.6, 1.2, 1.3, 1.4] }}
        transition={{ duration: 1.4, delay: 0.55, ease: "easeOut" }}
      />

      {/* Badge +X ⭐ */}
      <motion.div
        className="star-flight-badge"
        style={{ left: to.x, top: to.y }}
        initial={{ opacity: 0, y: 10, scale: 0.6 }}
        animate={{
          opacity: [0, 1, 1, 0],
          y: [10, -6, -18, -34],
          scale: [0.6, 1, 1, 0.9],
        }}
        transition={{ duration: 1.4, delay: 0.7, times: [0, 0.25, 0.7, 1] }}
      >
        +{amount.toLocaleString("vi-VN")} ⭐
      </motion.div>
    </>
  );
}
