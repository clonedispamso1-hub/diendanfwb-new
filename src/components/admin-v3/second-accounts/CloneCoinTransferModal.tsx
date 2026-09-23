/**
 * CloneCoinTransferModal — Tài khoản thứ hai chuyển Xu cho người đang chat.
 * UID người nhận điền sẵn; chỉ cần nhập số Xu và xác nhận.
 * Giao dịch chạy qua RPC `admin_clone_transfer_gem` (server-side, khoá dòng,
 * chống trùng bằng request_id). Không sửa số dư phía client.
 */
import { useEffect, useRef, useState } from "react";
import { Send, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { digitsOnly, formatThousands } from "@/lib/format";
import { generateTransactionCode, type CoinBillPayload } from "@/lib/coin-transfer-bill";
import type { AccountLite } from "./InternalTools";

const sb = supabase as any;

function newRequestId() {
  try { return crypto.randomUUID(); } catch { return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`; }
}

export function CloneCoinTransferModal({
  account, peerId, peerName, onClose, onSuccess,
}: {
  account: AccountLite;
  peerId: string;
  peerName?: string | null;
  onClose: () => void;
  onSuccess: (bill: CoinBillPayload) => void | Promise<void>;
}) {
  const [amount, setAmount] = useState("");
  const [balance, setBalance] = useState<number | null>(null);
  const [peer, setPeer] = useState<{ public_id?: string | null; avatar?: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const inFlight = useRef(false);
  const requestId = useRef(newRequestId());

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [{ data: me }, { data: p }] = await Promise.all([
        sb.from("profiles").select("gem_balance").eq("id", account.id).maybeSingle(),
        sb.from("profiles").select("public_id, avatar").eq("id", peerId).maybeSingle(),
      ]);
      if (!alive) return;
      setBalance(Number(me?.gem_balance ?? 0));
      setPeer(p ?? null);
    })();
    return () => { alive = false; };
  }, [account.id, peerId]);

  const uid = String(peer?.public_id || peerId);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inFlight.current) return;
    setError(null);
    const value = Number(amount);
    if (!Number.isSafeInteger(value) || value <= 0) { setError("Vui lòng nhập số Xu hợp lệ."); return; }
    if (balance != null && value > balance) { setError("Tài khoản không đủ Xu."); return; }

    inFlight.current = true;
    setSending(true);
    try {
      const { data, error: rpcErr } = await sb.rpc("admin_clone_transfer_gem", {
        p_clone_id: account.id,
        p_receiver_id: peerId,
        p_amount: value,
        p_note: null,
        p_request_id: requestId.current,
      });
      if (rpcErr) {
        const m = String(rpcErr.message || "");
        setError(/function|does not exist|schema cache/i.test(m)
          ? "Chưa bật chức năng chuyển Xu cho tài khoản thứ hai trên hệ thống."
          : `Lỗi hệ thống: ${m || "Không xác định"}`);
        return;
      }
      const res: any = data;
      if (!res || res.ok === false) { setError(res?.message || "Giao dịch thất bại!"); return; }
      requestId.current = newRequestId();
      if (!res.duplicate) {
        const txId = res.tx_id ? String(res.tx_id) : null;
        await onSuccess({
          code: txId ? `TX-${txId.slice(0, 8).toUpperCase()}` : generateTransactionCode(),
          txId,
          senderId: account.id,
          senderName: account.full_name || account.username || "Tài khoản",
          senderAvatar: account.avatar,
          receiverId: peerId,
          receiverName: peerName || "Người dùng",
          receiverAvatar: peer?.avatar ?? null,
          amount: value,
          note: null,
          at: Date.now(),
          status: "success",
        });
      }
      onClose();
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[96] bg-black/50 grid place-items-center p-4" onClick={() => { if (!sending) onClose(); }}>
      <form className="bg-background rounded-xl border shadow-xl w-full max-w-sm p-4 space-y-3"
        onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">🪙 Chuyển Xu</div>
          <button type="button" className="admv3-btn admv3-btn-ghost admv3-btn-icon" onClick={onClose} disabled={sending}><X size={16} /></button>
        </div>
        <div className="text-xs space-y-1">
          <div>Từ: <b>@{account.username}</b> — số dư: 🪙 {balance == null ? "…" : formatThousands(balance)} Xu</div>
          <div>Người nhận: <b>{peerName || "Người dùng"}</b></div>
        </div>
        <label className="block text-xs space-y-1">
          <span>UID người nhận</span>
          <input className="admv3-input w-full" value={uid} readOnly />
        </label>
        <label className="block text-xs space-y-1">
          <span>Số Xu</span>
          <input className="admv3-input w-full" type="text" inputMode="numeric" autoFocus
            value={formatThousands(amount)} onChange={(e) => setAmount(digitsOnly(e.target.value))}
            placeholder="VD: 10,000" maxLength={16} />
        </label>
        {error ? <div className="text-xs text-destructive">{error}</div> : null}
        <div className="flex justify-end gap-2">
          <button type="button" className="admv3-btn admv3-btn-ghost" onClick={onClose} disabled={sending}>Hủy</button>
          <button type="submit" className="admv3-btn" disabled={sending || !amount}>
            <Send size={14} /> {sending ? "Đang chuyển..." : "Xác nhận"}
          </button>
        </div>
      </form>
    </div>
  );
}
