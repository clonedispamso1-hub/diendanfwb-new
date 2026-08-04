/**
 * Popup "Phòng Live mới" 🔴 — hiện khi Admin tạo / bật một phòng Live Móc 🦋.
 *
 * Nguồn sự kiện: Supabase Realtime (DB #2, bảng live_moc_rooms) — 1 kênh duy nhất,
 * không polling, không websocket riêng. Chỉ hiện với người đã đăng nhập,
 * mỗi phòng đúng 1 lần, và bỏ qua nếu người dùng đang xem chính phòng đó.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { db2, isSecondaryConfigured } from "@/integrations/supabase/secondary-client";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/candy/auth-provider";
import { openLiveRoom } from "@/lib/live-presence";

const SEEN_KEY = "livemoc.notified_rooms";
const AUTO_CLOSE_MS = 10_000;

type Notice = { roomId: string; name: string };

function readSeen(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(SEEN_KEY) || "[]");
    return Array.isArray(raw) ? raw.map(String) : [];
  } catch {
    return [];
  }
}

function markSeen(roomId: string) {
  try {
    const next = [...readSeen().filter((id) => id !== roomId), roomId].slice(-100);
    localStorage.setItem(SEEN_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

function isRoomLive(row: Record<string, unknown> | null | undefined): boolean {
  if (!row) return false;
  if (!row.is_online || !row.visible) return false;
  const ends = row.ends_at ? new Date(String(row.ends_at)).getTime() : NaN;
  if (Number.isFinite(ends) && Date.now() > ends) return false;
  return true;
}

export function LiveNewRoomPopup() {
  const { session, me, ready } = useAuth();
  const loggedIn = Boolean(ready && session && me?.id);
  const [notice, setNotice] = useState<Notice | null>(null);
  const timer = useRef<number | null>(null);

  const close = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    setNotice((cur) => {
      if (cur) markSeen(cur.roomId);
      return null;
    });
  }, []);

  const show = useCallback(async (row: Record<string, unknown>) => {
    const roomId = String(row.id ?? "");
    if (!roomId) return;
    if (readSeen().includes(roomId)) return;
    // Đang ở trong đúng phòng live đó → không làm phiền.
    if ((window as unknown as { __liveMocOpenRoom?: string }).__liveMocOpenRoom === roomId) return;

    let name = String(row.title || "Một thành viên");
    const userId = row.live_user_id ? String(row.live_user_id) : "";
    if (userId) {
      const { data } = await supabase
        .from("profiles")
        .select("full_name, username")
        .eq("id", userId)
        .maybeSingle();
      const p = data as Record<string, unknown> | null;
      if (p) name = String(p.full_name || p.username || name);
    }
    setNotice({ roomId, name });
  }, []);

  // Đăng ký Realtime 1 lần khi đã đăng nhập.
  useEffect(() => {
    if (!loggedIn || !isSecondaryConfigured) return;
    const channel = db2()
      .channel("live-moc-rooms-notify")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "live_moc_rooms" },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          if (isRoomLive(row)) void show(row);
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "live_moc_rooms" },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          const old = payload.old as Record<string, unknown>;
          // Chỉ báo khi chuyển từ OFF → ON (không lặp lại khi sửa thông tin khác).
          if (isRoomLive(row) && !isRoomLive(old)) void show(row);
        },
      )
      .subscribe();

    return () => {
      void db2().removeChannel(channel);
    };
  }, [loggedIn, show]);

  // Tự đóng sau 10 giây.
  useEffect(() => {
    if (!notice) return;
    timer.current = window.setTimeout(() => close(), AUTO_CLOSE_MS);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [notice, close]);

  if (typeof document === "undefined") return null;

  const watch = () => {
    if (notice) {
      markSeen(notice.roomId);
      openLiveRoom(notice.roomId);
    }
    if (timer.current) window.clearTimeout(timer.current);
    setNotice(null);
  };

  return createPortal(
    <AnimatePresence>
      {notice ? (
        <motion.div
          className="lvnew"
          role="alert"
          initial={{ opacity: 0, x: 40, y: -24 }}
          animate={{ opacity: 1, x: 0, y: 0 }}
          exit={{ opacity: 0, x: 40, y: -24 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        >
          <div className="lvnew__row">
            <span className="lvnew__icon">
              <i className="lvnew__dot" />
              🦋
            </span>
            <div className="lvnew__body">
              <p className="lvnew__title">🔴 Phòng Live mới</p>
              <p className="lvnew__text">
                <strong>{notice.name}</strong> vừa mở phòng Live. Mời bạn vào xem ngay!
              </p>
            </div>
          </div>
          <div className="lvnew__acts">
            <button type="button" className="lvnew__btn lvnew__btn--go" onClick={watch}>
              Xem Live
            </button>
            <button type="button" className="lvnew__btn lvnew__btn--off" onClick={close}>
              Đóng
            </button>
          </div>

          <style>{`
            .lvnew{position:fixed;top:14px;right:14px;z-index:100002;width:min(340px,calc(100vw - 28px));
              border-radius:16px;padding:14px;background:#12162a;color:#fff;
              border:1px solid rgba(255,255,255,.1);box-shadow:0 20px 48px rgba(0,0,0,.5);}
            .lvnew, .lvnew *{color:#fff;}
            .lvnew__row{display:flex;gap:11px;align-items:flex-start;}
            .lvnew__icon{position:relative;width:42px;height:42px;flex:0 0 42px;border-radius:50%;
              display:flex;align-items:center;justify-content:center;font-size:20px;
              background:linear-gradient(135deg,#ff2d6f,#7a5cff);}
            .lvnew__dot{position:absolute;top:-2px;right:-2px;width:10px;height:10px;border-radius:50%;
              background:#ff2d55;box-shadow:0 0 0 2px #12162a;animation:lvnewBlink 1.1s ease-in-out infinite;}
            @keyframes lvnewBlink{0%,100%{opacity:1;transform:scale(1);}50%{opacity:.35;transform:scale(.8);}}
            .lvnew__title{margin:0 0 3px;font-size:14.5px;font-weight:800;}
            .lvnew__text{margin:0;font-size:13.5px;line-height:1.45;color:rgba(255,255,255,.9);}
            .lvnew__acts{display:flex;gap:8px;margin-top:12px;}
            .lvnew__btn{flex:1;padding:9px 10px;border:0;border-radius:10px;font-size:13.5px;
              font-weight:700;cursor:pointer;}
            .lvnew__btn--go{background:linear-gradient(135deg,#ff2d6f,#ff5f9e);}
            .lvnew__btn--off{background:rgba(255,255,255,.12);}
          `}</style>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

export default LiveNewRoomPopup;
