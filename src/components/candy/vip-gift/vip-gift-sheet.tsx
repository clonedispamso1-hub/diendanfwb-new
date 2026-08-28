import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Coins, Plus, Sparkles } from "lucide-react";
import { Portal } from "@/components/candy/portal";
import { useAuth } from "@/components/candy/auth-provider";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { safeGemAmount } from "@/lib/gem-utils";
import {
  VIP_GIFTS,
  TIER_LABEL,
  formatGem,
  gemToVnd,
  BROADCAST_EVENT,
  BROADCAST_THRESHOLD,
  GLOBAL_GIFT_CHANNEL,
  GLOBAL_GIFT_EVENT,
  type VipGift,
  type GiftTier,
  type BroadcastDetail,
} from "./vip-gift-data";
import { VipGiftEffect } from "./vip-gift-effect";

interface Props {
  open: boolean;
  onClose: () => void;
  postId: string;
  recipientId: string;
  recipientName: string;
  onSent?: (gift: VipGift) => void;
  /** Loại đối tượng nhận quà: "post" (mặc định) hoặc "video". */
  kind?: "post" | "video";
}

const TIER_ORDER: GiftTier[] = ["small", "mid", "vip", "ultimate"];

function getGiftErrorMessage(error: any) {
  const raw = `${error?.message || ""} ${error?.details || ""} ${error?.hint || ""}`;
  if (/INSUFFICIENT_BALANCE|not enough|số dư|so du/i.test(raw)) return "Số dư Gem không đủ để tặng quà này.";
  if (/Giao dịch|allow_candy_change|candy.*changed|privileged/i.test(raw)) {
    return "Giao dịch chưa được thực hiện. Vui lòng chạy SQL fix RPC tặng quà trên DB cũ rồi thử lại.";
  }
  if (/POST_NOT_FOUND|VIDEO_NOT_FOUND|not found/i.test(raw)) return "Bài viết hoặc video này không còn tồn tại.";
  if (/CANNOT_GIFT_SELF/i.test(raw)) return "Không thể tự tặng quà cho mình.";
  return error?.message || "Không thể tặng quà. Vui lòng thử lại.";
}


/**
 * Channel broadcast quà tặng toàn app — singleton.
 * Trước đây mỗi lần tặng quà tạo 1 channel mới rồi xoá sau 2s (connect /
 * disconnect liên tục). Nay chỉ mở đúng 1 channel và tái sử dụng.
 */
let giftChannel: ReturnType<typeof supabase.channel> | null = null;
async function getGiftBroadcastChannel() {
  if (giftChannel) return giftChannel;
  const ch = supabase.channel(GLOBAL_GIFT_CHANNEL);
  giftChannel = ch;
  await new Promise<void>((resolve) => {
    let timer = 0;
    const done = () => {
      if (timer) window.clearTimeout(timer);
      resolve();
    };
    ch.subscribe((status) => {
      if (status === "SUBSCRIBED") done();
    });
    timer = window.setTimeout(done, 1500);
  });
  return ch;
}

/** Đóng channel broadcast khi rời tab / unmount để không giữ websocket vô hạn. */
function closeGiftBroadcastChannel() {
  if (!giftChannel) return;
  try {
    supabase.removeChannel(giftChannel);
  } catch {
    try {
      giftChannel.unsubscribe();
    } catch {
      /* ignore */
    }
  }
  giftChannel = null;
}


export function VipGiftSheet({ open, onClose, postId, recipientId, recipientName, onSent, kind = "post" }: Props) {
  const { me, refreshMe, setGemBalance } = useAuth();
  const [selected, setSelected] = useState<VipGift | null>(null);
  const [tier, setTier] = useState<GiftTier>("small");
  const [sending, setSending] = useState(false);
  const [playEffect, setPlayEffect] = useState<VipGift | null>(null);
  const [shakeLowBalance, setShakeLowBalance] = useState(false);
  const [showTopUp, setShowTopUp] = useState(false);

  const balance = (me as any)?.gem_balance || (me as any)?.candy || 0;
  const senderName = (me as any)?.full_name || (me as any)?.public_id || "Bạn";

  useEffect(() => {
    if (!open) {
      setSelected(null);
      setShowTopUp(false);
    }
  }, [open]);

  // Dọn dẹp websocket khi unmount hoặc khi người dùng rời tab.
  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === "hidden") closeGiftBroadcastChannel();
    };
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("pagehide", closeGiftBroadcastChannel);
    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("pagehide", closeGiftBroadcastChannel);
      closeGiftBroadcastChannel();
    };
  }, []);



  // Bảo vệ tối quan trọng: nếu props bị null/undefined (post chưa load xong) thì
  // không bao giờ render sheet để tránh crash TypeError ".id of null".
  if (open && (!postId || !recipientId)) {
    if (typeof window !== "undefined") {
      console.warn("[VipGiftSheet] Bỏ qua mở sheet vì thiếu postId/recipientId", { postId, recipientId });
    }
    return null;
  }

  const giftsByTier = useMemo(() => {
    const map: Record<GiftTier, VipGift[]> = { small: [], mid: [], vip: [], ultimate: [] };
    VIP_GIFTS.forEach((g) => map[g.tier].push(g));
    return map;
  }, []);

  const send = async () => {
    if (!selected || !me?.id) return;
    if (selected.gem > balance) {
      setShakeLowBalance(true);
      setShowTopUp(true);
      window.setTimeout(() => setShakeLowBalance(false), 600);
      return;
    }
    if (recipientId === me.id) {
      alert("Không thể tự tặng quà cho mình.");
      return;
    }
    setSending(true);
    const amount = safeGemAmount(selected.gem);
    const { data, error } = await supabase.rpc("gift_gem_to_post_v3" as any, {
      p_post_id: postId,
      p_amount: Number(amount),
    } as any);
    setSending(false);
    if (error) {
      console.error("LỖI HỆ THỐNG RPC CHI TIẾT:", error);
      toast.error(`Lỗi hệ thống: ${error.message || (error as any).details || "Không xác định"}`);
      return;
    }
    if (!data || (data as any).ok === false) {
      toast.error((data as any)?.message || "Giao dịch thất bại!");
      return;
    }
    const newBalance = Number((data as any)?.new_balance ?? (data as any)?.sender_new_balance);
    if (Number.isFinite(newBalance)) setGemBalance(newBalance);
    else setGemBalance(Math.max(0, Number(balance) - Number(amount)));
    toast.success(
      `Đã tặng ${formatGem(amount)} Gem cho ${recipientName || "người nhận"}!`,
    );
    void refreshMe();
    onSent?.(selected);
    setPlayEffect(selected);

    // Broadcast toàn app cho quà lớn (local + Supabase Realtime → mọi user online)
    if (selected.gem >= BROADCAST_THRESHOLD) {
      const detail: BroadcastDetail = { senderName, recipientName, gift: selected };
      window.dispatchEvent(new CustomEvent(BROADCAST_EVENT, { detail }));
      try {
        const ch = await getGiftBroadcastChannel();
        await ch.send({ type: "broadcast", event: GLOBAL_GIFT_EVENT, payload: detail });
      } catch (err) {
        console.warn("[vip-gift] global broadcast failed", err);
      }
    }

    setSelected(null);
    onClose();
  };

  return (
    <>
      <AnimatePresence>
        {open ? (
          <Portal>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 10050,
                background: "rgba(5, 0, 18, 0.65)",
                backdropFilter: "blur(14px)",
                WebkitBackdropFilter: "blur(14px)",
              }}
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 34 }}
              role="dialog"
              aria-modal="true"
              style={{
                position: "fixed",
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 10051,
                maxHeight: "88vh",
                borderTopLeftRadius: 28,
                borderTopRightRadius: 28,
                background:
                  "linear-gradient(180deg, rgba(20,8,40,0.96) 0%, rgba(10,4,24,0.98) 100%)",
                border: "1px solid transparent",
                backgroundClip: "padding-box",
                boxShadow: "0 -20px 60px rgba(155, 60, 255, 0.35), 0 0 0 1px rgba(255,255,255,0.04)",
                color: "#fff",
                overflow: "hidden",
              }}
            >
              {/* Neon gradient border top accent */}
              <div
                aria-hidden
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  height: 3,
                  background:
                    "linear-gradient(90deg, #ff3d8c, #b072ff, #5ad1ff, #ffd24a, #ff3d8c)",
                  backgroundSize: "200% 100%",
                  animation: "vip-gradient-slide 4s linear infinite",
                }}
              />
              {/* Handle */}
              <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 0" }}>
                <span style={{ width: 44, height: 4, borderRadius: 999, background: "rgba(255,255,255,0.18)" }} />
              </div>

              {/* Header */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px 8px" }}>
                <div>
                  <div style={{ fontSize: 12, color: "#c5a8ff", letterSpacing: 1, fontWeight: 700 }}>
                    🎁 TẶNG QUÀ VIP
                  </div>
                  <div style={{ fontSize: 14, opacity: 0.75, marginTop: 2 }}>
                    cho <span style={{ color: "#ffd24a", fontWeight: 700 }}>{recipientName || "người đăng"}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Đóng"
                  style={{
                    width: 36, height: 36, borderRadius: 999, border: "none",
                    background: "rgba(255,255,255,0.08)", color: "#fff",
                    display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
                  }}
                >
                  <X size={18} />
                </button>
              </div>

              {/* Tier tabs */}
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  padding: "6px 20px 12px",
                  overflowX: "auto",
                  scrollbarWidth: "none",
                }}
              >
                {TIER_ORDER.map((t) => {
                  const active = t === tier;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTier(t)}
                      style={{
                        padding: "8px 14px",
                        borderRadius: 999,
                        fontSize: 12,
                        fontWeight: 700,
                        letterSpacing: 0.4,
                        whiteSpace: "nowrap",
                        cursor: "pointer",
                        border: active ? "1px solid transparent" : "1px solid rgba(255,255,255,0.1)",
                        background: active
                          ? "linear-gradient(135deg, #ff3d8c, #b072ff)"
                          : "rgba(255,255,255,0.05)",
                        color: "#fff",
                        boxShadow: active ? "0 6px 24px -4px #b072ffaa" : "none",
                      }}
                    >
                      {TIER_LABEL[t]}
                    </button>
                  );
                })}
              </div>

              {/* Gift grid (scroll horizontal trên mobile, grid trên rộng) */}
              <div
                style={{
                  padding: "4px 16px 16px",
                  overflowY: "auto",
                  maxHeight: "48vh",
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))",
                    gap: 10,
                  }}
                >
                  {giftsByTier[tier].map((g) => {
                    const isSel = selected?.id === g.id;
                    return (
                      <motion.button
                        key={g.id}
                        type="button"
                        onClick={() => setSelected(g)}
                        whileTap={{ scale: 0.94 }}
                        animate={isSel ? { scale: [1, 1.08, 1.05], rotate: [0, -2, 2, 0] } : { scale: 1 }}
                        transition={{ duration: 0.4 }}
                        style={{
                          position: "relative",
                          padding: "12px 6px 10px",
                          borderRadius: 18,
                          border: isSel ? `1.5px solid ${g.glow}` : "1px solid rgba(255,255,255,0.08)",
                          background: isSel
                            ? `linear-gradient(160deg, ${g.glow}22, rgba(255,255,255,0.04))`
                            : "rgba(255,255,255,0.04)",
                          cursor: "pointer",
                          overflow: "hidden",
                          boxShadow: isSel ? `0 0 24px ${g.glow}88, inset 0 0 20px ${g.glow}33` : "none",
                          color: "#fff",
                        }}
                      >
                        {/* Shine sweep */}
                        <span
                          aria-hidden
                          style={{
                            position: "absolute",
                            inset: 0,
                            background:
                              "linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.18) 50%, transparent 70%)",
                            transform: "translateX(-100%)",
                            animation: `vip-card-shine ${4 + (g.gem % 7) * 0.3}s ease-in-out infinite`,
                            pointerEvents: "none",
                          }}
                        />
                        {/* VIP gradient border */}
                        {g.tier === "vip" || g.tier === "ultimate" ? (
                          <span
                            aria-hidden
                            style={{
                              position: "absolute",
                              inset: -1,
                              borderRadius: 18,
                              padding: 1.5,
                              background: `conic-gradient(from 0deg, ${g.glow}, transparent, ${g.glow})`,
                              WebkitMask:
                                "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
                              WebkitMaskComposite: "xor",
                              maskComposite: "exclude",
                              animation: "vip-spin 6s linear infinite",
                              pointerEvents: "none",
                              opacity: 0.8,
                            }}
                          />
                        ) : null}
                        <div
                          style={{
                            fontSize: 38,
                            lineHeight: 1,
                            filter: `drop-shadow(0 0 10px ${g.glow}aa)`,
                          }}
                        >
                          {g.emoji}
                        </div>
                        <div style={{ fontSize: 11, fontWeight: 700, marginTop: 6, opacity: 0.95 }}>
                          {g.name}
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 800, color: g.glow, marginTop: 2 }}>
                          💎 {formatGem(g.gem)}
                        </div>
                        <div style={{ fontSize: 10, opacity: 0.55, marginTop: 1 }}>
                          {gemToVnd(g.gem)}
                        </div>
                        {g.tier === "ultimate" ? (
                          <div
                            style={{
                              position: "absolute",
                              top: 6,
                              right: 6,
                              fontSize: 9,
                              fontWeight: 800,
                              padding: "2px 6px",
                              borderRadius: 999,
                              background: "linear-gradient(90deg, #ff3d8c, #ffd24a)",
                              color: "#1a0030",
                              letterSpacing: 0.5,
                            }}
                          >
                            ★ MAX
                          </div>
                        ) : null}
                      </motion.button>
                    );
                  })}
                </div>
              </div>

              {/* Footer: balance + send */}
              <motion.div
                animate={shakeLowBalance ? { x: [-8, 8, -6, 6, -3, 3, 0] } : { x: 0 }}
                transition={{ duration: 0.45 }}
                style={{
                  padding: "12px 18px 20px",
                  borderTop: "1px solid rgba(255,255,255,0.06)",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  background: shakeLowBalance
                    ? "linear-gradient(180deg, rgba(255,40,60,0.18), transparent)"
                    : "transparent",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10, opacity: 0.6, letterSpacing: 0.6 }}>SỐ DƯ</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 800 }}>
                    <Coins size={14} style={{ color: "#ffd24a" }} />
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>{formatGem(balance)}</span>
                    <span style={{ fontSize: 11, opacity: 0.5 }}>GEM</span>
                    <button
                      type="button"
                      onClick={() => setShowTopUp(true)}
                      aria-label="Nạp Gem"
                      style={{
                        marginLeft: 6,
                        width: 22, height: 22, borderRadius: 999, border: "none",
                        background: "linear-gradient(135deg, #ff3d8c, #b072ff)",
                        color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
                        boxShadow: "0 4px 12px -2px #ff3d8caa",
                      }}
                    >
                      <Plus size={13} strokeWidth={3} />
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void send()}
                  disabled={!selected || sending}
                  style={{
                    flexShrink: 0,
                    padding: "12px 22px",
                    borderRadius: 999,
                    border: "none",
                    fontWeight: 800,
                    fontSize: 14,
                    letterSpacing: 0.4,
                    color: "#fff",
                    cursor: selected && !sending ? "pointer" : "not-allowed",
                    opacity: selected && !sending ? 1 : 0.45,
                    background: selected
                      ? `linear-gradient(135deg, ${selected.glow}, #b072ff)`
                      : "rgba(255,255,255,0.1)",
                    boxShadow: selected ? `0 8px 28px -6px ${selected.glow}cc` : "none",
                    display: "inline-flex", alignItems: "center", gap: 8,
                  }}
                >
                  <Sparkles size={16} />
                  {sending ? "Đang gửi..." : selected ? `Tặng ${formatGem(selected.gem)}` : "Chọn quà"}
                </button>
              </motion.div>

              {/* Top up popup */}
              <AnimatePresence>
                {showTopUp ? (
                  <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 30 }}
                    style={{
                      position: "absolute",
                      left: 16, right: 16, bottom: 96,
                      padding: 16,
                      borderRadius: 18,
                      background: "linear-gradient(135deg, rgba(255,30,60,0.18), rgba(255,60,120,0.1))",
                      border: "1px solid rgba(255,80,120,0.5)",
                      boxShadow: "0 0 32px rgba(255,40,80,0.4)",
                      color: "#fff",
                    }}
                  >
                    <div style={{ fontWeight: 800, marginBottom: 4 }}>💔 Không đủ Gem</div>
                    <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 10 }}>
                      Bạn cần thêm Gem để tặng quà này. Nạp ngay để tiếp tục thể hiện đẳng cấp VIP.
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => setShowTopUp(false)}
                        style={{
                          padding: "8px 14px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.2)",
                          background: "transparent", color: "#fff", cursor: "pointer", fontSize: 13,
                        }}
                      >
                        Để sau
                      </button>
                      <button
                        type="button"
                        onClick={() => { window.location.href = "/gem-history"; }}
                        style={{
                          padding: "8px 16px", borderRadius: 999, border: "none",
                          background: "linear-gradient(135deg, #ffd24a, #ff3d8c)",
                          color: "#1a0030", fontWeight: 800, cursor: "pointer", fontSize: 13,
                        }}
                      >
                        💎 Nạp Gem ngay
                      </button>
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </motion.div>
          </Portal>
        ) : null}
      </AnimatePresence>

      <VipGiftEffect
        gift={playEffect}
        senderName={senderName}
        recipientName={recipientName}
        onDone={() => setPlayEffect(null)}
      />
    </>
  );
}
