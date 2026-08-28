import { useState } from "react";
import { Send, X } from "lucide-react";
import { useAuth } from "@/components/candy/auth-provider";
import { supabase } from "@/lib/supabase";
import { formatCandy } from "@/lib/format";
import { safeGemAmount } from "@/lib/gem-utils";
import { useNotification } from "@/components/candy/notification-provider";
import { resolveUserName } from "@/lib/user-name";
import { notifyTransferReceived } from "@/lib/notify-transfer";

export function CandyTransfer() {
  const { me, refreshMe, setGemBalance } = useAuth();
  const { notify } = useNotification();
  const [recipientName, setRecipientName] = useState("");
  const [amount, setAmount] = useState("");
  const [sending, setSending] = useState(false);

  // PHẦN 1: chặn tự chuyển ⭐ cho chính mình ngay khi user nhập.
  const trimmedInput = recipientName.trim();
  const myPublicId = ((me as any)?.public_id || "").toString();
  const myFullName = (resolveUserName(me as any, "")).toString();
  const isSelfTarget =
    !!trimmedInput &&
    (
      (myPublicId && trimmedInput.toUpperCase() === myPublicId.toUpperCase()) ||
      (myFullName && trimmedInput.toLowerCase() === myFullName.toLowerCase())
    );

  const handleTransfer = async () => {
    if (!me?.id) return;
    const trimmedName = recipientName.trim();
    const transferAmount = parseInt(amount);

    if (isSelfTarget) return alert("Bạn không thể tự chuyển ⭐ cho chính mình.");
    if (!trimmedName) return alert("Nhập Mã ID hoặc Tên hiển thị người nhận.");

    if (isNaN(transferAmount) || transferAmount < 1) return alert("Nhập số Coin hợp lệ.");
    if (transferAmount > (me.gem_balance || 0)) return alert("Bạn không đủ Coin.");

    setSending(true);
    try {
      // Tra cứu theo public_id (Mã ID hiển thị) hoặc full_name (tên hiển thị).
      // KHÔNG còn dùng `username` (đó là tên đăng nhập — phải giữ riêng tư).
      const idCandidate = trimmedName.toUpperCase();
      let recipient: { id: string; full_name: string | null; public_id?: string | null } | null = null;

      // 1) Thử public_id trước (nếu migration đã chạy)
      const byId = await supabase
        .from("profiles")
        .select("id, full_name, public_id")
        .eq("public_id", idCandidate)
        .maybeSingle();
      if (!byId.error && byId.data) recipient = byId.data as any;

      // 2) Nếu không thấy, tra theo full_name (case-insensitive)
      if (!recipient) {
        const byName = await supabase
          .from("profiles")
          .select("id, full_name")
          .ilike("full_name", trimmedName)
          .maybeSingle();
        if (byName.data) recipient = byName.data as any;
      }

      if (!recipient) {
        alert("Không tìm thấy người chơi này.");
        setSending(false);
        return;
      }

      if (recipient.id === me.id) {
        alert("Không thể chuyển Coin cho chính mình.");
        setSending(false);
        return;
      }

      // Ưu tiên RPC chuyên dụng — bypass trigger qua flag, an toàn cho user thường.
      const { data: rpcData, error: rpcErr } = await supabase.rpc("secure_transfer_gem" as any, {
        p_receiver_id: recipient.id,
        p_amount: Number(safeGemAmount(transferAmount)),
        p_note: null,
      });
      if (rpcErr) {
        console.error("LỖI HỆ THỐNG RPC CHI TIẾT:", rpcErr);
        alert(`Lỗi hệ thống: ${rpcErr.message || (rpcErr as any).details || "Không xác định"}`);
        setSending(false);
        return;
      }
      const res: any = rpcData;
      if (!res || res.ok === false) {
        const msg = res?.message || "";
        if (msg.includes("COOLDOWN")) {
          const m = msg.match(/COOLDOWN:\s*(\d+)/);
          alert(`Vui lòng đợi ${m?.[1] ?? "vài"} giây trước khi chuyển tiếp.`);
        } else {
          alert(msg || "Giao dịch thất bại!");
        }
        setSending(false);
        return;
      }

      const safeAmount = safeGemAmount(transferAmount);

      // Notification SB3 — CHỈ tạo sau khi RPC tài chính SB1 báo thành công.
      void notifyTransferReceived({
        receiverId: recipient.id,
        senderId: me.id,
        senderName: (me as any).full_name || (me as any).display_name || (me as any).username,
        amount: Number(safeAmount),
        currency: "xu",
        transferId: res?.transaction_id ?? res?.tx_id ?? null,
      });

      const newBalance = Number(res?.new_balance ?? res?.sender_new_balance);
      if (Number.isFinite(newBalance)) setGemBalance(newBalance);
      else setGemBalance(Math.max(0, Number(me.gem_balance || 0) - Number(safeAmount)));

      // Popup pink toast đã bị gỡ bỏ theo yêu cầu.


      setRecipientName("");
      setAmount("");
      void refreshMe();
    } catch (err) {
      alert("Lỗi khi chuyển Coin.");
    } finally {
      setSending(false);
    }
  };

  return (
    <section
      className="panel stack-sm"
      style={{ padding: 12, maxWidth: 360, margin: "0 auto", borderRadius: 14, display: "grid", gap: 8 }}
    >
      <h3 className="section-title" style={{ fontSize: 14, margin: 0 }}>Chuyển Coin</h3>
      <label className="field-label" style={{ display: "grid", gap: 4, fontSize: 12 }}>
        <span>Mã ID hoặc Tên hiển thị người nhận</span>
        <input
          className="app-input"
          style={{ height: 36, fontSize: 13, padding: "6px 10px" }}
          value={recipientName}
          onChange={(e) => setRecipientName(e.target.value)}
          placeholder="VD: AB23X9 hoặc Bảo Đây 999"
        />
      </label>
      {isSelfTarget ? (
        <p style={{ margin: 0, fontSize: 12, color: "hsl(0 70% 45%)" }}>
          Bạn không thể tự chuyển ⭐ cho chính mình.
        </p>
      ) : null}
      <label className="field-label" style={{ display: "grid", gap: 4, fontSize: 12 }}>
        <span>Số Coin muốn chuyển</span>
        <input
          className="app-input"
          style={{ height: 36, fontSize: 13, padding: "6px 10px" }}
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="VD: 100"
          min={1}
        />
      </label>
      <button
        className="primary-cta compact"
        style={{ height: 38, fontSize: 13, padding: "0 14px" }}
        onClick={() => void handleTransfer()}
        disabled={sending || isSelfTarget}
      >
        <Send size={14} /> {sending ? "Đang chuyển..." : "Chuyển Coin"}
      </button>

    </section>
  );
}
