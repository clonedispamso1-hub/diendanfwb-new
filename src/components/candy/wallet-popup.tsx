/**
 * V6 — Popup Ví xu.
 * - Header: "👛 Ví của bạn".
 * - Toàn bộ chữ #111111 (không dùng chữ trắng).
 * - Mặc định ẩn số dư (xxxxxxxx), bấm 👁 để hiện, lưu localStorage.
 */
import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff, X } from "lucide-react";

import { Portal } from "@/components/candy/portal";
import { formatNumber } from "@/lib/format";
import { useBalanceVisibility, MASKED_BALANCE } from "@/lib/use-balance-visibility";
import { useNavigate } from "react-router-dom";

const INK = "#111111";

export function WalletPopup({ balance, onClose }: { balance: number; onClose: () => void }) {
  const { shown, toggle } = useBalanceVisibility();
  const navigate = useNavigate();

  return (
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
          background: "rgba(12,6,24,0.42)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
          display: "grid",
          placeItems: "center",
          padding: 16,
        }}
      >
        <motion.div
          role="dialog"
          aria-label="Ví của bạn"
          onClick={(e) => e.stopPropagation()}
          initial={{ opacity: 0, y: 18, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.95 }}
          transition={{ type: "spring", stiffness: 320, damping: 24 }}
          style={{
            width: "min(340px, 100%)",
            borderRadius: 24,
            padding: 20,
            color: INK,
            textAlign: "center",
            background: "#ffffff",
            border: "1px solid rgba(17,17,17,0.10)",
            boxShadow: "0 24px 70px -20px rgba(17,17,17,0.45)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <h3
              style={{
                flex: 1,
                margin: 0,
                fontSize: 17,
                fontWeight: 800,
                textAlign: "left",
                color: INK,
              }}
            >
              👛 Ví của bạn
            </h3>
            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng ví"
              style={{
                border: "1px solid rgba(17,17,17,0.10)",
                background: "#f4f4f6",
                color: INK,
                width: 30,
                height: 30,
                borderRadius: 999,
                display: "grid",
                placeItems: "center",
                cursor: "pointer",
              }}
            >
              <X size={15} />
            </button>
          </div>

          <div
            style={{
              borderRadius: 18,
              padding: "18px 14px",
              background: "#f6f5fa",
              border: "1px solid rgba(17,17,17,0.08)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              minHeight: 66,
              color: INK,
            }}
          >
            <span style={{ fontSize: 20 }} aria-hidden>
              👛
            </span>
            <AnimatePresence mode="wait" initial={false}>
              {shown ? (
                <motion.span
                  key="num"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  style={{ fontSize: 21, fontWeight: 800, letterSpacing: 0.2, color: INK }}
                >
                  {formatNumber(balance)} xu
                </motion.span>
              ) : (
                <motion.span
                  key="dots"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  style={{ fontSize: 22, fontWeight: 800, letterSpacing: 3, color: INK }}
                >
                  {MASKED_BALANCE}
                </motion.span>
              )}
            </AnimatePresence>
            <button
              type="button"
              onClick={toggle}
              aria-label={shown ? "Ẩn số dư" : "Hiện số dư"}
              style={{
                marginLeft: 4,
                border: "none",
                background: "transparent",
                color: INK,
                cursor: "pointer",
                display: "grid",
                placeItems: "center",
                padding: 4,
              }}
            >
              {shown ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          <button
            type="button"
            onClick={toggle}
            style={{
              marginTop: 14,
              width: "100%",
              padding: "11px 14px",
              borderRadius: 14,
              border: "1px solid rgba(17,17,17,0.12)",
              background: "#f4f4f6",
              color: INK,
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            {shown ? <EyeOff size={16} /> : <Eye size={16} />}
            {shown ? "Ẩn số dư" : "Hiện số dư"}
          </button>

          <button
            type="button"
            onClick={() => {
              onClose();
              navigate("/wallet/withdraw");
            }}
            style={{
              marginTop: 10,
              width: "100%",
              padding: "12px 14px",
              borderRadius: 14,
              border: "1px solid rgba(17,17,17,0.12)",
              background: "linear-gradient(135deg, #ffd7ec, #e9d8ff)",
              color: INK,
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            💳 Rút tiền
          </button>
        </motion.div>
      </motion.div>
    </Portal>
  );
}

export default WalletPopup;
