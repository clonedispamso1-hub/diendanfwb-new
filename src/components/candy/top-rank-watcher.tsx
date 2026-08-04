/**
 * TopRankWatcher — hiển thị popup 1 lần khi user "lọt Top" trong ngày.
 *
 * Quy tắc:
 *   • Theo dõi 2 bảng: Top Follow hôm nay và Top Ngôi sao đang lên (tuần).
 *   • Popup CHỈ hiện khi rank cải thiện: currentRank <= TOP_LIMIT
 *     và (chưa có rank cũ trong ngày || currentRank < rank cũ).
 *   • Same-rank / tụt hạng → không hiện lại.
 *   • Ghi nhớ trong localStorage theo (userId, board, YYYY-MM-DD).
 *
 * Không đụng DB — thuần client. Không insert notification.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trophy, Star, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/candy/auth-provider";

type Board = "follow" | "rising";
const TOP_LIMIT = 10;

const BOARD_LABEL: Record<Board, string> = {
  follow: "Follow hôm nay",
  rising: "Ngôi sao đang lên",
};

const BOARD_TAIL: Record<Board, string> = {
  follow: "Hãy giữ vững phong độ.",
  rising: "Tiếp tục cố gắng nhé.",
};

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function storageKey(userId: string, board: Board) {
  return `toprank:${userId}:${board}:${todayKey()}`;
}

async function fetchRank(board: Board, userId: string): Promise<number | null> {
  try {
    const rpc = board === "follow" ? "leaderboard_follow" : "leaderboard_active_stars_week";
    const args = board === "follow" ? ({ _period: "today" } as any) : ({} as any);
    const { data, error } = await supabase.rpc(rpc as any, args);
    if (error || !Array.isArray(data)) return null;
    const idx = (data as any[]).findIndex((r: any) => r?.user_id === userId);
    return idx < 0 ? null : idx + 1;
  } catch {
    return null;
  }
}

interface Popup {
  id: string;
  board: Board;
  rank: number;
}

export function TopRankWatcher() {
  const { me } = useAuth();
  const [popup, setPopup] = useState<Popup | null>(null);
  const lastCheckedRef = useRef<number>(0);

  const check = useCallback(async () => {
    if (!me?.id) return;
    const now = Date.now();
    if (now - lastCheckedRef.current < 5000) return;
    lastCheckedRef.current = now;

    for (const board of ["follow", "rising"] as Board[]) {
      const rank = await fetchRank(board, me.id);
      if (rank == null || rank > TOP_LIMIT) continue;
      const key = storageKey(me.id, board);
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
      const prev = raw ? parseInt(raw, 10) : NaN;
      const prevRank = Number.isFinite(prev) ? prev : null;
      if (prevRank !== null && rank >= prevRank) continue; // không cải thiện
      try { window.localStorage.setItem(key, String(rank)); } catch { /* noop */ }
      setPopup({ id: `${board}-${rank}-${now}`, board, rank });
      break; // 1 popup tại 1 thời điểm; lần poll sau sẽ xử lý board còn lại
    }
  }, [me?.id]);

  useEffect(() => {
    if (!me?.id) return;
    void check();
    const onVis = () => { if (document.visibilityState === "visible") void check(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [me?.id, check]);

  const close = () => setPopup(null);

  return (
    <AnimatePresence>
      {popup && (
        <motion.div
          key={popup.id}
          initial={{ opacity: 0, y: -40, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.95 }}
          transition={{ type: "spring", damping: 20, stiffness: 320 }}
          style={{
            position: "fixed",
            top: 24,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 16px",
            borderRadius: 16,
            background: "linear-gradient(135deg, #fef3c7, #fde68a)",
            color: "#78350f",
            boxShadow: "0 12px 32px rgba(120, 53, 15, 0.25)",
            border: "1px solid rgba(120,53,15,0.15)",
            maxWidth: "92vw",
            minWidth: 280,
          }}
          role="status"
          aria-live="polite"
        >
          <motion.div
            initial={{ rotate: -20, scale: 0.7 }}
            animate={{ rotate: [0, -12, 12, 0], scale: 1 }}
            transition={{ duration: 0.9, repeat: 0 }}
            style={{
              width: 40, height: 40, borderRadius: 12,
              background: "rgba(255,255,255,0.6)",
              display: "grid", placeItems: "center", flexShrink: 0,
            }}
          >
            {popup.board === "follow"
              ? <Trophy size={22} strokeWidth={2.4} />
              : <Star size={22} strokeWidth={2.4} />}
          </motion.div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 14, lineHeight: 1.3 }}>
              Bạn đang Top {popup.rank} {BOARD_LABEL[popup.board]}.
            </p>
            <p style={{ margin: "2px 0 0", fontSize: 12, opacity: 0.85 }}>
              {BOARD_TAIL[popup.board]}
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Đóng"
            style={{
              background: "transparent", border: 0, padding: 4, cursor: "pointer",
              color: "#78350f", opacity: 0.7,
            }}
          >
            <X size={16} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
