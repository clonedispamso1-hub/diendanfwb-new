import { useEffect, useState } from "react";
import { X, Star, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useRealtime, pickNew } from "@/lib/realtime-registry";
import { useAuth } from "@/components/candy/auth-provider";
import { GIFT_CATALOG, type GiftItem } from "./gift-catalog";

type Props = {
  open: boolean;
  onClose: () => void;
  receiverId: string;
  receiverName?: string;
  onSent?: () => void;
};

/** Panel tặng quà kiểu TikTok/Zalo Premium. */
export function GiftPanel({ open, onClose, receiverId, receiverName, onSent }: Props) {
  const { me } = useAuth();
  const [selected, setSelected] = useState<GiftItem | null>(null);
  const [sending, setSending] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState<number>(Number(me?.gem_balance ?? 0));

  useEffect(() => {
    if (open) {
      setBalance(Number(me?.gem_balance ?? 0));
      setSelected(GIFT_CATALOG[0]);
      setError(null);
    }
  }, [open, me?.gem_balance]);

  // Sync balance realtime khi profile thay đổi — dùng chung channel qua registry
  // (không tạo channel trùng với star-gift-popover / các nơi khác nghe cùng row).
  useRealtime(
    open && me?.id ? `profile-self:${me.id}` : null,
    me?.id ? [{ table: "profiles", event: "UPDATE", filter: `id=eq.${me.id}` }] : [],
    (payload) => {
      const next = (pickNew(payload) as any)?.gem_balance;
      if (typeof next === "number") setBalance(next);
    },
  );

  if (!open) return null;

  const handleSend = async () => {
    if (!selected || !me?.id || sending) return;
    setError(null);
    if (balance < selected.amount) {
      setError("Bạn không đủ ⭐ để tặng món này.");
      return;
    }
    {
      const { ensureAllowed } = await import("@/lib/restriction-guard");
      if (!(await ensureAllowed("gift"))) return;
    }
    setSending(true);
    const { error } = await supabase.rpc("send_message_gift" as any, {
      p_receiver_id: receiverId,
      p_gift_key: selected.key,
      p_gift_name: selected.name,
      p_gift_emoji: selected.emoji,
      p_amount: selected.amount,
    });
    setSending(false);
    if (error) {
      const msg = error.message || "";
      if (msg.includes("Insufficient")) setError("Không đủ ⭐ trong ví.");
      else if (msg.includes("yourself")) setError("Không thể tặng chính mình.");
      else setError("Không gửi được quà. Thử lại nhé.");
      return;
    }
    // Trừ optimistic
    setBalance((b) => Math.max(0, b - selected.amount));
    setFlash(selected.key + "-" + Date.now());
    setTimeout(() => setFlash(null), 700);
    onSent?.();
  };

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-end justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-3xl bg-gradient-to-b from-[#1a0b2e] via-[#2b1055] to-[#0a0a1f] px-4 pb-6 pt-4 text-white shadow-2xl animate-slide-in-right"
        style={{ animation: "gift-slide-up 0.3s ease-out" }}
        onClick={(e) => e.stopPropagation()}
      >
        <style>{`
          @keyframes gift-slide-up {
            from { transform: translateY(100%); }
            to { transform: translateY(0); }
          }
          @keyframes gift-pop {
            0% { transform: scale(1); }
            30% { transform: scale(1.25) rotate(-8deg); }
            60% { transform: scale(0.95) rotate(4deg); }
            100% { transform: scale(1) rotate(0); }
          }
          @keyframes gift-shine {
            0% { background-position: -200% 0; }
            100% { background-position: 200% 0; }
          }
        `}</style>

        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-xs uppercase tracking-widest text-purple-300/70">Tặng quà</div>
            <div className="text-base font-semibold">
              {receiverName ? `Cho ${receiverName}` : "Chọn món quà"}
            </div>
          </div>
          <button
            className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20"
            onClick={onClose}
            aria-label="Đóng"
          >
            <X size={16} />
          </button>
        </div>

        {/* Balance */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 mb-4">
          <Star size={16} className="text-yellow-300 fill-yellow-300" />
          <span className="text-sm text-white/70">Số dư</span>
          <span className="ml-auto text-sm font-semibold text-yellow-200">
            {balance.toLocaleString("vi-VN")} ⭐
          </span>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-4 gap-2 mb-4">
          {GIFT_CATALOG.map((g) => {
            const active = selected?.key === g.key;
            const isFlash = flash?.startsWith(g.key + "-");
            return (
              <button
                key={g.key}
                type="button"
                onClick={() => setSelected(g)}
                className={`relative flex flex-col items-center gap-1 rounded-2xl p-2 pt-3 transition-all border ${
                  active
                    ? "bg-gradient-to-b " + g.gradient + " border-white/40 shadow-lg scale-[1.04]"
                    : "bg-white/5 border-white/10 hover:bg-white/10"
                }`}
                style={active ? { boxShadow: `0 8px 24px -6px ${g.glow}` } : undefined}
              >
                <span
                  className="text-3xl leading-none"
                  style={isFlash ? { animation: "gift-pop 0.6s ease-out" } : undefined}
                >
                  {g.emoji}
                </span>
                <span className={`text-[10px] font-medium ${active ? "text-white" : "text-white/70"}`}>
                  {g.name}
                </span>
                <span className={`text-[10px] font-semibold ${active ? "text-white" : "text-yellow-200"}`}>
                  {g.amount.toLocaleString("vi-VN")}⭐
                </span>
              </button>
            );
          })}
        </div>

        {error ? (
          <div className="mb-2 text-center text-xs text-rose-300">{error}</div>
        ) : null}

        {/* Action */}
        <button
          type="button"
          disabled={!selected || sending || (!!selected && balance < selected.amount)}
          onClick={handleSend}
          className={`w-full h-12 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 transition-all
            ${selected ? "bg-gradient-to-r " + selected.gradient + " text-white" : "bg-white/10 text-white/50"}
            disabled:opacity-60`}
          style={
            selected
              ? {
                  boxShadow: `0 10px 30px -8px ${selected.glow}`,
                  backgroundImage:
                    `linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent), ` +
                    `linear-gradient(to right, var(--tw-gradient-stops))`,
                  backgroundSize: "200% 100%, 100% 100%",
                  animation: "gift-shine 2.5s linear infinite",
                }
              : undefined
          }
        >
          {sending ? (
            <>
              <Loader2 size={16} className="animate-spin" /> Đang gửi...
            </>
          ) : selected ? (
            <>Tặng {selected.emoji} {selected.name} · {selected.amount.toLocaleString("vi-VN")}⭐</>
          ) : (
            "Chọn một món quà"
          )}
        </button>

        <div className="text-center text-[10px] text-white/40 mt-3">
          Có thể tặng liên tục nhiều lần • Quà chưa nhận sẽ hoàn sau 7 ngày
        </div>
      </div>
    </div>
  );
}
