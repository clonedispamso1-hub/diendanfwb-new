import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { fetchChatRedPacket, openChatRedPacket, type ChatRedPacket } from "@/lib/chat-red-packet";
import { Portal } from "@/components/candy/portal";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";

function formatVN(n: number): string {
  return (n || 0).toLocaleString("vi-VN");
}

const THANKS_LINES = [
  "❤️ Cảm ơn anh nha.",
  "🥰 Em cảm ơn nhiều.",
  "🌸 Dễ thương quá.",
  "😊 Cảm ơn nha.",
];

interface Props {
  packetId: string;
  meId: string;
  senderName: string;
  onSendThanks?: (text: string) => void;
  onReplyGift?: () => void;
}

export function ChatRedPacketCard({ packetId, meId, senderName, onSendThanks, onReplyGift }: Props) {
  const [packet, setPacket] = useState<ChatRedPacket | null>(null);
  const [loading, setLoading] = useState(true);
  const [openOpen, setOpenOpen] = useState(false);
  const [opening, setOpening] = useState(false);
  const [autoAnimate, setAutoAnimate] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void fetchChatRedPacket(packetId).then((p) => {
      if (alive) { setPacket(p); setLoading(false); }
    });
    return () => { alive = false; };
  }, [packetId]);

  // Realtime — cập nhật khi status đổi (người nhận mở → người gửi thấy).
  useEffect(() => {
    if (!packetId) return;
    const ch = supabase
      .channel(`hongbao-${packetId}`)
      .on(
        "postgres_changes" as any,
        { event: "UPDATE", schema: "public", table: "chat_red_packets", filter: `id=eq.${packetId}` },
        (payload: any) => setPacket((prev) => ({ ...(prev as any), ...(payload.new as any) })),
      )
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [packetId]);

  const isReceiver = packet?.receiver_id === meId;
  const isSender = packet?.sender_id === meId;
  const isOpened = packet?.status === "opened";

  if (loading || !packet) {
    return (
      <div className="hongbao-card is-loading" aria-busy>
        <div className="hongbao-card-top">
          <div className="hongbao-icon">🧧</div>
          <div style={{ minWidth: 0 }}>
            <div className="hongbao-title">Bao Lì Xì</div>
            <div className="hongbao-wish">Đang tải...</div>
          </div>
        </div>
        <div className="hongbao-cta"><span className="hongbao-cta-open">Đang tải…</span></div>
      </div>
    );
  }

  const handleClick = async () => {
    if (opening) return;
    // Sender or already opened → just show details modal.
    if (isSender || isOpened) {
      setAutoAnimate(false);
      setOpenOpen(true);
      return;
    }
    if (!isReceiver) return;
    // Người nhận: KHÔNG mở tiền ngay. Hiện phong bao lớn, chờ bấm "MỞ LÌ XÌ".
    setAutoAnimate(false);
    setOpenOpen(true);
  };


  return (
    <>
      <div
        className={`hongbao-card${isOpened ? " is-opened" : ""}${opening ? " is-pressing" : ""}`}
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            void handleClick();
          }
        }}
        aria-label={isOpened ? "Bao lì xì đã mở" : "Nhấn để mở bao lì xì"}
      >
        <div className="hongbao-card-top">
          <div className="hongbao-icon" aria-hidden>🧧</div>
          <div className="hongbao-card-text">
            <div className="hongbao-title">Bao Lì Xì</div>
            <div className="hongbao-wish">{packet.wish || "Chúc bạn may mắn"}</div>
          </div>
        </div>
        <div className="hongbao-cta">
          {isOpened ? (
            <>
              <span className="hongbao-cta-opened">
                {isReceiver ? "Đã nhận" : "Đã được mở"}
              </span>
              <span className="hongbao-cta-amount">
                {isReceiver ? `+${formatVN(packet.amount)} Xu` : `${formatVN(packet.amount)} Xu`}
              </span>
            </>
          ) : (
            <>
              <span className="hongbao-cta-open">
                {opening ? "Đang mở…" : "Nhấn để mở"}
              </span>
              <span className="hongbao-cta-from">Từ: {isSender ? "Bạn" : senderName}</span>
            </>
          )}
        </div>
      </div>

      {openOpen ? (
        <HongbaoOpenModal
          packet={packet}
          meId={meId}
          senderName={senderName}
          autoAnimate={autoAnimate}
          onClose={() => setOpenOpen(false)}
          onOpened={(next) => setPacket(next)}
          onSendThanks={onSendThanks}
          onReplyGift={onReplyGift}
        />
      ) : null}
    </>
  );
}

interface OpenProps {
  packet: ChatRedPacket;
  meId: string;
  senderName: string;
  autoAnimate?: boolean;
  onClose: () => void;
  onOpened: (next: ChatRedPacket) => void;
  onSendThanks?: (text: string) => void;
  onReplyGift?: () => void;
}

function useCountUp(target: number | null, run: boolean, duration = 900) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!run || target == null) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, run, duration]);
  return value;
}

function HongbaoOpenModal({ packet, meId, senderName, autoAnimate, onClose, onOpened, onSendThanks, onReplyGift }: OpenProps) {
  const isReceiver = packet.receiver_id === meId;
  const alreadyOpened = packet.status === "opened";
  const initialPhase: "idle" | "opening" | "done" = autoAnimate
    ? "opening"
    : alreadyOpened
      ? "done"
      : "idle";
  const [phase, setPhase] = useState<"idle" | "opening" | "done">(initialPhase);
  const [openedAmount, setOpenedAmount] = useState<number | null>(alreadyOpened ? packet.amount : null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [closing, setClosing] = useState(false);

  const coins = useMemo(() => Array.from({ length: 8 }, (_, i) => i), []);
  const counted = useCountUp(openedAmount, phase === "done");

  const requestClose = () => {
    setClosing(true);
    window.setTimeout(onClose, 180);
  };

  // Confetti + âm thanh khi hiện số tiền.
  useEffect(() => {
    if (phase !== "done" || openedAmount == null) return;
    let cancelled = false;
    void (async () => {
      try {
        const mod = await import("canvas-confetti");
        if (cancelled) return;
        const fire = mod.default;
        fire({ particleCount: 90, spread: 70, startVelocity: 42, origin: { y: 0.45 }, zIndex: 2000, colors: ["#ffd76a", "#ff5a4d", "#fff1c9", "#f5a623"] });
        window.setTimeout(() => fire({ particleCount: 50, spread: 100, startVelocity: 30, origin: { y: 0.4 }, zIndex: 2000, colors: ["#ffd76a", "#ffffff", "#ff8a3d"] }), 240);
      } catch { /* confetti optional */ }
    })();
    return () => { cancelled = true; };
  }, [phase, openedAmount]);

  // Nếu card đã gọi RPC thành công, animate shake rồi hiển thị kết quả.
  useEffect(() => {
    if (!autoAnimate) return;
    const t = setTimeout(() => {
      setOpenedAmount(packet.amount);
      setPhase("done");
    }, 600);
    return () => clearTimeout(t);
  }, [autoAnimate, packet.amount]);

  const handleOpen = async () => {
    if (busy || phase !== "idle") return;
    setBusy(true);
    setError(null);
    setPhase("opening");
    try {
      const res = await openChatRedPacket(packet.id);
      if (!res?.ok) {
        setError(res?.message || "Không mở được bao lì xì");
        setPhase("idle");
        return;
      }
      // Đợi animation rung + mở ~1s trước khi hiện tiền
      setTimeout(() => {
        setOpenedAmount(res.amount ?? packet.amount);
        setPhase("done");
        onOpened({ ...packet, status: "opened", amount: res.amount ?? packet.amount, opened_at: new Date().toISOString() });
      }, 1000);
    } catch (e: any) {
      setError(e?.message || "Có lỗi xảy ra");
      setPhase("idle");
    } finally {
      setBusy(false);
    }
  };

  const fromLabel = packet.sender_id === meId ? "Bạn" : senderName;

  useBodyScrollLock(true);

  return (
    <Portal>
    <div
      className={`hongbao-open-backdrop hongbao-open-backdrop--v2${closing ? " is-closing" : ""}`}
      onClick={requestClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`hongbao-open-modal hongbao-open-modal--v2${closing ? " is-closing" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="hongbao-open-close" aria-label="Đóng" onClick={requestClose}>✕</button>
        <span className="hongbao-open-halo" aria-hidden />

        {phase === "done" && openedAmount != null ? (
          <div className="hongbao-open-result">
            {coins.map((i) => (
              <span
                key={i}
                className="hongbao-coin"
                style={{
                  left: `${20 + (i * 8)}%`,
                  top: "40%",
                  animationDelay: `${i * 60}ms`,
                  ["--dx" as any]: `${(i % 2 === 0 ? -1 : 1) * (15 + i * 5)}px`,
                }}
              >
                {i % 2 === 0 ? "🪙" : "✨"}
              </span>
            ))}
            <div className="hongbao-open-congrats">🎉 Chúc mừng!</div>
            <div className="hongbao-open-sub">{isReceiver ? "Bạn nhận được" : "Đã tặng"}</div>
            <div className="hongbao-open-amount">{formatVN(counted)}</div>
            <div className="hongbao-open-unit">XU</div>

            {isReceiver ? (
              <div className="hongbao-actions-row">
                <button
                  className="hongbao-action-btn"
                  onClick={() => {
                    const pick = THANKS_LINES[Math.floor(Math.random() * THANKS_LINES.length)];
                    onSendThanks?.(pick);
                    requestClose();
                  }}
                >
                  ❤️ Cảm ơn
                </button>
                <button
                  className="hongbao-action-btn is-primary"
                  onClick={() => { onReplyGift?.(); requestClose(); }}
                >
                  🧧 Lì xì lại
                </button>
              </div>
            ) : (
              <div className="hongbao-open-note">Người nhận đã mở bao lì xì này.</div>
            )}
          </div>
        ) : (
          <div className="hongbao-envelope-stage">
            <div className={`hongbao-envelope${phase === "opening" ? " is-opening" : ""}`} aria-hidden>
              <span className="hongbao-envelope__flap" />
              <span className="hongbao-envelope__seal">福</span>
              <span className="hongbao-envelope__emoji">🧧</span>
            </div>
            <div className="hongbao-open-sender">{fromLabel}</div>
            <div className="hongbao-open-wish">{packet.wish || "Chúc bạn may mắn"}</div>

            {isReceiver ? (
              <button
                className="hongbao-open-cta"
                onClick={handleOpen}
                disabled={busy || phase === "opening"}
              >
                {phase === "opening" ? "ĐANG MỞ..." : "MỞ LÌ XÌ"}
              </button>
            ) : (
              <div className="hongbao-open-note">Chờ người nhận mở bao lì xì...</div>
            )}
            {error ? <div className="hongbao-open-error">{error}</div> : null}
          </div>
        )}
      </div>
    </div>
    </Portal>
  );
}

