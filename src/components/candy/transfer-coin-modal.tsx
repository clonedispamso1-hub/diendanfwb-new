import { avatarSrc } from "@/lib/image-cdn";
/**
 * V5.5 — Popup CHUYỂN XU (theo Mã thành viên / UID).
 * - Tra cứu người nhận realtime qua RPC lookup_member_by_uid.
 * - Chuyển xu atomic qua RPC transfer_balance (FOR UPDATE, 1 transaction).
 * - Người nhận phải bấm "Nhận" trong Thông báo mới được cộng xu.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Portal } from "@/components/candy/portal";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/candy/auth-provider";

type Recipient = { id: string; full_name: string | null; avatar: string | null; public_id: string | null };

const fmt = (n: number) => Math.max(0, Math.floor(n)).toLocaleString("vi-VN");

export function TransferCoinModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { me, setGemBalance, refreshMe } = useAuth();
  const balance = Number((me as any)?.gem_balance ?? 0);

  const [uid, setUid] = useState("");
  const [amountText, setAmountText] = useState("");
  const [looking, setLooking] = useState(false);
  const [recipient, setRecipient] = useState<Recipient | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [feePercent, setFeePercent] = useState(0);
  const [minAmount, setMinAmount] = useState(1);
  const [sending, setSending] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      const { data } = await (supabase as any)
        .from("admin_site_settings")
        .select("value")
        .eq("key", "coin_transfer_config")
        .maybeSingle();
      const v = data?.value ?? {};
      setFeePercent(Number(v.fee_percent ?? 0) || 0);
      setMinAmount(Number(v.min_amount ?? 1) || 1);
    })();
  }, [open]);

  useEffect(() => {
    if (!open) {
      setUid(""); setAmountText(""); setRecipient(null); setNotFound(false);
    }
  }, [open]);

  const lookup = useCallback(async (code: string) => {
    const term = code.trim();
    if (term.length < 3) { setRecipient(null); setNotFound(false); return; }
    setLooking(true);
    try {
      const { data, error } = await (supabase as any).rpc("lookup_member_by_uid", { p_uid: term });
      const row = Array.isArray(data) ? data[0] : data;
      if (error || !row) { setRecipient(null); setNotFound(true); }
      else { setRecipient(row as Recipient); setNotFound(false); }
    } finally {
      setLooking(false);
    }
  }, []);

  useEffect(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => void lookup(uid), 350);
    return () => { if (timerRef.current) window.clearTimeout(timerRef.current); };
  }, [uid, lookup]);

  const amount = useMemo(() => {
    const n = parseInt(amountText.replace(/[^\d]/g, ""), 10);
    return Number.isFinite(n) ? n : 0;
  }, [amountText]);
  const fee = Math.floor((amount * feePercent) / 100);
  const net = Math.max(0, amount - fee);

  const isSelf = !!recipient && recipient.id === me?.id;
  const canSend = !!recipient && !isSelf && amount >= minAmount && amount <= balance && !sending;

  const submit = async () => {
    if (!canSend || !recipient) return;
    setSending(true);
    try {
      const { data, error } = await (supabase as any).rpc("transfer_balance", {
        p_receiver_uid: recipient.public_id || uid.trim(),
        p_amount: amount,
        p_note: null,
      });
      const res: any = data;
      if (error || !res?.ok) {
        toast.error(res?.message || error?.message || "Chuyển xu thất bại.");
        return;
      }
      if (Number.isFinite(Number(res.new_balance))) setGemBalance(Number(res.new_balance));
      void refreshMe();
      toast.success(`Đã chuyển ${fmt(res.net_amount ?? net)} xu cho ${recipient.full_name || recipient.public_id}`);
      onClose();
    } finally {
      setSending(false);
    }
  };

  if (!open) return null;

  return (
    <Portal>
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose}
          style={{
            position: "fixed", inset: 0, zIndex: 2147483200,
            background: "rgba(15,15,30,0.45)", display: "grid", placeItems: "center", padding: 16,
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 320, damping: 26 }}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(420px, 100%)", background: "#fff", borderRadius: 20,
              boxShadow: "0 30px 70px -24px rgba(15,15,30,0.5)", overflow: "hidden",
              maxHeight: "88vh", display: "flex", flexDirection: "column",
            }}
          >
            <div style={{
              display: "flex", alignItems: "center", gap: 10, padding: "14px 16px",
              background: "linear-gradient(135deg,#8b5cf6,#ec4899)", color: "#fff",
            }}>
              <span style={{ fontSize: 18 }}>💸</span>
              <strong style={{ flex: 1, fontSize: 16 }}>Chuyển xu</strong>
              <button type="button" onClick={onClose} aria-label="Đóng"
                style={{ background: "rgba(255,255,255,0.18)", border: 0, borderRadius: 999, color: "#fff", width: 30, height: 30, display: "grid", placeItems: "center", cursor: "pointer" }}>
                <X size={16} />
              </button>
            </div>

            <div style={{ padding: 16, overflowY: "auto", color: "#222" }}>
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                background: "#f6f5fa", borderRadius: 16, padding: "12px 14px", marginBottom: 14,
              }}>
                <span style={{ fontSize: 13, color: "#555" }}>Số dư hiện tại</span>
                <strong style={{ fontSize: 17, color: "#222" }}>{fmt(balance)} xu</strong>
              </div>

              <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#333", marginBottom: 6 }}>
                Nhập mã thành viên
              </label>
              <div style={{ position: "relative", marginBottom: 10 }}>
                <input
                  value={uid}
                  onChange={(e) => setUid(e.target.value.toUpperCase())}
                  placeholder="VD: UDHIA928"
                  maxLength={32}
                  style={{
                    width: "100%", height: 46, borderRadius: 14, border: "1px solid #e3e1ec",
                    padding: "0 40px 0 14px", fontSize: 15, fontWeight: 700, letterSpacing: 1,
                    color: "#222", background: "#fff", outline: "none",
                  }}
                />
                <span style={{ position: "absolute", right: 12, top: 14, color: "#888" }}>
                  {looking ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
                </span>
              </div>

              {recipient ? (
                <div style={{
                  display: "flex", alignItems: "center", gap: 12, padding: 12, borderRadius: 16,
                  border: "1px solid rgba(139,92,246,0.25)", background: "rgba(139,92,246,0.07)", marginBottom: 14,
                }}>
                  <div style={{ width: 44, height: 44, borderRadius: 999, overflow: "hidden", background: "#eee", display: "grid", placeItems: "center" }}>
                    {recipient.avatar
                      ? <img loading="lazy" decoding="async" src={avatarSrc(recipient.avatar, 64)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : <span style={{ fontWeight: 800, color: "#7c3aed" }}>{(recipient.full_name || "?").slice(0, 1)}</span>}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: 14, color: "#222" }}>{recipient.full_name || "Thành viên"}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#7c3aed", letterSpacing: 1 }}>{recipient.public_id}</div>
                  </div>
                </div>
              ) : notFound ? (
                <p style={{ margin: "0 0 14px", fontSize: 13, fontWeight: 600, color: "#d92d5c" }}>
                  Không tìm thấy thành viên
                </p>
              ) : null}
              {isSelf ? (
                <p style={{ margin: "0 0 14px", fontSize: 13, fontWeight: 600, color: "#d92d5c" }}>
                  Không thể tự chuyển xu cho chính mình.
                </p>
              ) : null}

              <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#333", marginBottom: 6 }}>
                Số xu
              </label>
              <input
                inputMode="numeric"
                value={amountText ? fmt(amount) : ""}
                onChange={(e) => setAmountText(e.target.value)}
                placeholder="0"
                style={{
                  width: "100%", height: 52, borderRadius: 14, border: "1px solid #e3e1ec",
                  padding: "0 14px", fontSize: 20, fontWeight: 800, color: "#222", outline: "none", marginBottom: 12,
                }}
              />

              <div style={{ borderRadius: 16, background: "#f6f5fa", padding: "12px 14px", marginBottom: 16 }}>
                <Row label={`Phí giao dịch (${feePercent}%)`} value={`${fmt(fee)} xu`} />
                <Row label="Người nhận thực nhận" value={`${fmt(net)} xu`} strong />
              </div>

              {amount > balance ? (
                <p style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 600, color: "#d92d5c" }}>Số dư không đủ.</p>
              ) : null}

              <button
                type="button"
                disabled={!canSend}
                onClick={() => void submit()}
                style={{
                  width: "100%", height: 50, borderRadius: 16, border: 0, cursor: canSend ? "pointer" : "not-allowed",
                  fontSize: 15, fontWeight: 800, color: "#fff",
                  background: canSend ? "linear-gradient(135deg,#8b5cf6,#ec4899)" : "#c9c6d4",
                  boxShadow: canSend ? "0 14px 30px -14px rgba(168,85,247,0.8)" : "none",
                }}
              >
                {sending ? "Đang chuyển…" : "XÁC NHẬN"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      </AnimatePresence>
    </Portal>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0" }}>
      <span style={{ fontSize: 13, color: "#555" }}>{label}</span>
      <span style={{ fontSize: strong ? 15 : 13.5, fontWeight: strong ? 800 : 600, color: strong ? "#7c3aed" : "#333" }}>{value}</span>
    </div>
  );
}

export default TransferCoinModal;
