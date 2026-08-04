/**
 * Tab "Live Móc 🦋" — Dark Mode, CSS thuần (không thư viện, không realtime).
 * Chỉ hiển thị danh sách phòng do Admin tạo — KHÔNG phát/nhúng video.
 * Số liệu (👁 ❤️ 💬) là BỘ ĐẾM CHUNG của phòng: tính từ started_at + mốc Admin nhập
 * nên mọi người đều thấy cùng một con số. Không websocket, không polling, không ghi DB.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import "@/components/candy/live/live-moc.css";
import {
  fetchLiveRooms,
  fetchLiveSettings,
  formatViewers,
  formatElapsed,
  type LiveMocRoom,
  type LiveMocSettings,
  DEFAULT_LIVE_SETTINGS,
} from "@/lib/live-moc";
import { VipCommunityPopup } from "@/components/candy/VipCommunityPopup";
import { liveCountersFor } from "@/lib/live-counter";
import { primeLiveUsers } from "@/lib/live-presence";
import { supabase } from "@/lib/supabase";

/** Đồng hồ chung 1 giây cho tất cả card (1 timer duy nhất). */
function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

type LiveHost = { id: string; name: string; avatar: string | null; roomId: string };

export function LiveMocPage() {
  const [rooms, setRooms] = useState<LiveMocRoom[]>([]);
  const [settings, setSettings] = useState<LiveMocSettings>(DEFAULT_LIVE_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<LiveMocRoom | null>(null);
  const [hosts, setHosts] = useState<LiveHost[]>([]);
  const cardRefs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [list, cfg] = await Promise.all([fetchLiveRooms(), fetchLiveSettings()]);
      if (!alive) return;
      setRooms(list);
      setSettings(cfg);
      setLoading(false);
      primeLiveUsers(list);

      // Ai đang Live → lấy avatar/tên từ DB chính (1 truy vấn duy nhất).
      const ids = list.filter((r) => r.is_online && r.live_user_id).map((r) => r.live_user_id!);
      if (ids.length === 0) return;
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, username, avatar")
        .in("id", ids);
      if (!alive || !data) return;
      const byId = new Map(
        (data as Record<string, unknown>[]).map((r) => [String(r.id), r] as const),
      );
      setHosts(
        list
          .filter((r) => r.is_online && r.live_user_id && byId.has(r.live_user_id))
          .map((r) => {
            const p = byId.get(r.live_user_id!)!;
            return {
              id: String(p.id),
              name: String(p.full_name || p.username || "Thành viên"),
              avatar: p.avatar ? String(p.avatar) : null,
              roomId: r.id,
            };
          }),
      );
    })();
    return () => {
      alive = false;
    };
  }, []);

  const hasLive = rooms.some((r) => r.is_online);
  // Cập nhật mỗi 1000ms — đủ mượt, không nặng.
  const now = useNow(hasLive);
  const stats = useMemo(() => {
    const out: Record<string, { viewers: number; likes: number; comments: number }> = {};
    for (const r of rooms) out[r.id] = liveCountersFor(r, now);
    return out;
  }, [rooms, now]);
  const onlineCount = rooms.filter((r) => r.is_online).length;

  const scrollToRoom = (roomId: string) => {
    const el = cardRefs.current[roomId];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  // Popup "Phòng Live mới" cần biết người dùng đang mở phòng nào để không làm phiền.
  useEffect(() => {
    (window as unknown as { __liveMocOpenRoom?: string | null }).__liveMocOpenRoom =
      selected?.id ?? null;
    return () => {
      (window as unknown as { __liveMocOpenRoom?: string | null }).__liveMocOpenRoom = null;
    };
  }, [selected]);

  // Bấm badge LIVE ở nơi khác → mở tab này rồi cuộn tới đúng phòng.
  useEffect(() => {
    if (loading) return;
    let focus: string | null = null;
    try {
      focus = window.sessionStorage.getItem("livemoc.focus");
      if (focus) window.sessionStorage.removeItem("livemoc.focus");
    } catch {
      /* ignore */
    }
    if (focus) {
      const id = focus;
      window.setTimeout(() => {
        scrollToRoom(id);
        // Chỉ có 1 phòng → mở luôn luồng xem Live (popup Cộng đồng VIP Zalo).
        if (rooms.length === 1) setSelected(rooms[0]!);
      }, 120);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, rooms]);


  return (
    <div className="livemoc">
      <div className="livemoc__head">
        <div>
          <h1 className="livemoc__title">Live Móc 🦋</h1>
          <p className="livemoc__sub">Danh sách phòng Live đang mở</p>
        </div>
        {!loading && rooms.length > 0 ? (
          <span className="livemoc__count">{onlineCount} phòng online</span>
        ) : null}
      </div>

      {hosts.length > 0 ? (
        <section className="lvhosts">
          <h2 className="lvhosts__title">Đang Live ({hosts.length})</h2>
          <div className="lvhosts__rail">
            {hosts.map((h) => (
              <button
                key={h.id}
                type="button"
                className="lvhost"
                onClick={() => scrollToRoom(h.roomId)}
                title={`Xem Live của ${h.name}`}
              >
                <span className="lvhost__ring">
                  {h.avatar ? (
                    <img src={h.avatar} alt={h.name} loading="lazy" decoding="async" />
                  ) : (
                    <span className="lvhost__fallback">{h.name.charAt(0).toUpperCase()}</span>
                  )}
                  <span className="lvhost__tag">
                    <i />
                    LIVE
                  </span>
                </span>
                <span className="lvhost__name">{h.name}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {loading ? (
        <div className="livemoc__list">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="lvskel" />
          ))}
        </div>
      ) : rooms.length === 0 ? (
        <div className="livemoc__empty">Hiện chưa có phòng Live nào. Vui lòng quay lại sau.</div>
      ) : (
        <div className="livemoc__list">
          {rooms.map((room) => {
            const s = stats[room.id];
            const viewers = s?.viewers ?? room.viewers;
            const likes = s?.likes ?? room.likes;
            const comments = s?.comments ?? room.comments;
            const elapsed = room.is_online ? formatElapsed(room.started_at, now) : "";
            return (
              <article
                key={room.id}
                className="lvcard"
                ref={(el) => {
                  cardRefs.current[room.id] = el;
                }}
              >
                <div className="lvcard__thumb">
                  {room.thumbnail_url ? (
                    <img
                      src={room.thumbnail_url}
                      alt={`Phòng Live ${room.title}`}
                      loading="lazy"
                      decoding="async"
                      width={900}
                      height={506}
                    />
                  ) : (
                    <div className="lvcard__thumb-fallback">🦋</div>
                  )}
                  <div className="lvcard__shade" />

                  {room.is_online ? (
                    <span className="lvbadge lvbadge--live">
                      <span className="lvcard__live-dot" />
                      LIVE
                    </span>
                  ) : (
                    <span className="lvbadge lvbadge--off">ĐÃ KẾT THÚC</span>
                  )}

                  <span className="lvbadge lvbadge--viewers">👁 {formatViewers(viewers)}</span>

                  {room.is_hot ? (
                    <span className="lvbadge lvbadge--hot">🔥 Hot hôm nay</span>
                  ) : null}
                </div>

                <div className="lvcard__body">
                  <div className="lvcard__row">
                    <h2 className="lvcard__name">{room.title}</h2>
                    <span className={`lvbadge lvbadge--${room.is_online ? "online" : "off"}`}>
                      {room.is_online ? "Đang trực tuyến" : "Đã kết thúc"}
                    </span>
                  </div>

                  {room.description ? <p className="lvcard__desc">{room.description}</p> : null}

                  <div className="lvcard__stats">
                    <span>❤️ {formatViewers(likes)}</span>
                    <span>💬 {formatViewers(comments)}</span>
                    {elapsed ? (
                      <span className="lvcard__elapsed">🟠 Đã phát {elapsed}</span>
                    ) : null}
                  </div>

                  <button type="button" className="lvcard__btn" onClick={() => setSelected(room)}>
                    XEM LIVE
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <VipCommunityPopup
        open={Boolean(selected)}
        featureLabel="xem Live"
        onClose={() => setSelected(null)}
      />
    </div>
  );
}

export default LiveMocPage;
