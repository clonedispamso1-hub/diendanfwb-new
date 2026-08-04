import { useState } from "react";
import { Loader2, Check, Clock, RotateCcw, XCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getGiftByKey } from "./gift-catalog";

export type MessageGiftRow = {
  id: string;
  message_id: string;
  sender_id: string;
  receiver_id: string;
  gift_key: string;
  gift_name: string;
  gift_emoji: string;
  amount: number;
  status: "pending" | "claimed" | "refunded" | "expired";
  created_at: string;
  claimed_at: string | null;
  refunded_at: string | null;
  expires_at: string;
};

type Props = {
  gift: MessageGiftRow;
  isSelf: boolean; // đây có phải là bubble của người gửi không (isSelf = current user gửi)
  meId: string;
};

/** Bubble hiển thị quà trong khung chat, có nút Nhận nếu là người nhận. */
export function GiftBubble({ gift, isSelf, meId }: Props) {
  const meta = getGiftByKey(gift.gift_key);
  const gradient = meta?.gradient ?? "from-pink-400 to-rose-500";
  const glow = meta?.glow ?? "rgba(244,63,94,0.5)";

  const [claiming, setClaiming] = useState(false);
  const [localStatus, setLocalStatus] = useState(gift.status);
  const status = localStatus;

  const canClaim =
    !isSelf && gift.receiver_id === meId && status === "pending"
    && new Date(gift.expires_at).getTime() > Date.now();

  const handleClaim = async () => {
    if (claiming || !canClaim) return;
    setClaiming(true);
    const { error } = await supabase.rpc("claim_message_gift" as any, { p_gift_id: gift.id });
    setClaiming(false);
    if (!error) setLocalStatus("claimed");
  };

  const StatusPill = () => {
    if (status === "claimed") {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] text-emerald-100/90">
          <Check size={11} /> Đã nhận
        </span>
      );
    }
    if (status === "refunded") {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] text-amber-100/90">
          <RotateCcw size={11} /> Đã hoàn tiền
        </span>
      );
    }
    if (status === "expired") {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] text-white/70">
          <XCircle size={11} /> Hết hạn
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-white/85">
        <Clock size={11} /> Chờ nhận
      </span>
    );
  };

  return (
    <div
      className={`relative rounded-2xl px-3 py-2.5 text-white bg-gradient-to-br ${gradient} min-w-[180px] max-w-[240px]`}
      style={{ boxShadow: `0 10px 28px -10px ${glow}` }}
    >
      <div className="flex items-center gap-2">
        <div className="text-3xl leading-none drop-shadow">{gift.gift_emoji}</div>
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wider text-white/80">
            {isSelf ? "Bạn đã tặng" : "Bạn nhận được"}
          </div>
          <div className="text-sm font-semibold truncate">{gift.gift_name}</div>
          <div className="text-[11px] text-white/90 font-medium">
            {gift.amount.toLocaleString("vi-VN")} ⭐
          </div>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <StatusPill />
        {canClaim ? (
          <button
            type="button"
            onClick={handleClaim}
            disabled={claiming}
            className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-white text-gray-900 hover:bg-white/90 disabled:opacity-60 inline-flex items-center gap-1"
          >
            {claiming ? <Loader2 size={11} className="animate-spin" /> : null}
            Nhận quà
          </button>
        ) : null}
      </div>
    </div>
  );
}
