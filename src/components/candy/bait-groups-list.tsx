/**
 * Tab "Nhóm" trong phần Tin nhắn — danh sách Nhóm Mồi (chỉ trưng bày).
 * Bấm vào bất kỳ nhóm nào → mở popup VIP (khoá hoàn toàn việc vào chat).
 *
 * Hiệu ứng "đang cháy": số member nhích ±1, số tin nhắn tăng dần, dòng preview
 * shimmer — chạy hoàn toàn bằng React state ở client, KHÔNG đụng DB.
 */
import { fetchBaitGroups } from "@/lib/bait-groups-cache";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Users } from "lucide-react";
import { VipRequiredPopup } from "@/components/candy/vip-required-popup";
import { BaitGroupInfoPopup } from "@/components/candy/bait-group-info-popup";
import { takeBaitFocus, BAIT_FOCUS_EVENT } from "@/lib/bait-group-token";
import { shortCount, applyLocation, type BaitGroup } from "@/lib/supabase-v4";

/** Badge "999+" nổi ở góc — dùng chung cho tab Nhóm và từng thư mục. */
export function HotBadge999({ className = "" }: { className?: string }) {
  return (
    <span
      className={`pointer-events-none z-10 inline-flex select-none items-center justify-center rounded-full bg-red-500 px-1.5 py-[1px] text-[10px] font-extrabold leading-none text-white shadow-md ring-2 ring-background bait-badge-pulse ${className}`}
    >
      999+
    </span>
  );
}

const CSS = `
@keyframes bait-shimmer{0%{background-position:-160% 0}100%{background-position:260% 0}}
.bait-shimmer{position:relative;overflow:hidden}
.bait-shimmer::after{content:"";position:absolute;inset:0;
  background:linear-gradient(90deg,transparent,rgba(56,189,248,.35),transparent);
  background-size:60% 100%;background-repeat:no-repeat;
  animation:bait-shimmer 1.8s linear infinite}
@keyframes bait-badge{0%,100%{transform:scale(1)}50%{transform:scale(1.12)}}
.bait-badge-pulse{animation:bait-badge 1.6s ease-in-out infinite}
@keyframes bait-focus-blink{
  0%,100%{box-shadow:0 0 0 3px rgba(250,204,21,.95),0 0 18px rgba(250,204,21,.55);background-color:rgba(250,204,21,.14)}
  50%{box-shadow:0 0 0 3px rgba(250,204,21,.25),0 0 6px rgba(250,204,21,.2);background-color:rgba(250,204,21,.04)}
}
.bait-focus{border-radius:1rem;animation:bait-focus-blink 1s ease-in-out infinite}
@media (prefers-reduced-motion:reduce){.bait-shimmer::after,.bait-badge-pulse,.bait-focus{animation:none}
  .bait-focus{box-shadow:0 0 0 3px rgba(250,204,21,.9)}}
`;

export function BaitGroupsList({
  province,
  hideBadges = false,
}: {
  province?: string | null;
  hideBadges?: boolean;
}) {
  const [groups, setGroups] = useState<BaitGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [lockOpen, setLockOpen] = useState(false);
  /** Nhóm mồi nằm chung 1 danh sách duy nhất — không còn chia thư mục. */

  /** Nhóm được điều hướng tới từ Card Nhóm ở Newsfeed. */
  const [focusId, setFocusId] = useState<string | null>(null);
  /** Nhóm đang mở popup thông tin (mọi thành viên đều thấy popup này trước). */
  const [infoGroup, setInfoGroup] = useState<BaitGroup | null>(null);
  /** Delta ảo theo id nhóm: { m: member, c: tin nhắn }. */
  const [ticks, setTicks] = useState<Record<string, { m: number; c: number }>>({});
  /** Danh sách id vừa "nhảy" lên đầu — mới nhất đứng trước. */
  const [bumped, setBumped] = useState<string[]>([]);
  const groupIdsRef = useRef<string[]>([]);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const { groups: g } = await fetchBaitGroups().catch(() => ({ folders: [], groups: [] }));
      if (!alive) return;
      setGroups(g);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);


  /** 1 danh sách duy nhất: ẩn nhóm gán tỉnh khác tỉnh của user, ưu tiên nhóm vừa "nhảy". */
  const items = useMemo(() => {
    const myProvince = (province || "").trim().toLowerCase();
    const visible = groups.filter((g) => {
      const gp = (g.province || "").trim().toLowerCase();
      return gp ? gp === myProvince : true;
    });
    const rank = (id: string) => {
      const i = bumped.indexOf(id);
      return i === -1 ? Number.MAX_SAFE_INTEGER : i;
    };
    return [...visible].sort((a, b) => rank(a.id) - rank(b.id));
  }, [groups, province, bumped]);

  groupIdsRef.current = items.map((i) => i.id);


  // Chạy số ảo realtime (client-side thuần).
  useEffect(() => {
    const timer = setInterval(() => {
      const ids = groupIdsRef.current;
      if (!ids.length) return;
      setTicks((prev) => {
        const next = { ...prev };
        for (const id of ids) {
          if (Math.random() > 0.55) continue; // chỉ một vài nhóm "động" mỗi nhịp
          const cur = next[id] ?? { m: 0, c: 0 };
          next[id] = {
            m: Math.max(-9, Math.min(9, cur.m + (Math.random() < 0.5 ? -1 : 1))),
            c: cur.c + 1 + Math.floor(Math.random() * 2),
          };
        }
        return next;
      });
    }, 2500);
    return () => clearInterval(timer);
  }, []);

  // Ngẫu nhiên 5–8 giây: đưa 1 nhóm bất kỳ lên vị trí đầu tiên.
  // Chỉ chạy khi component này được mount (tức tab "Nhóm" đang mở).
  useEffect(() => {
    let id: number | undefined;
    const schedule = () => {
      id = window.setTimeout(() => {
        const ids = groupIdsRef.current;
        if (ids.length > 1) {
          const pick = ids[Math.floor(Math.random() * ids.length)]!;
          setBumped((prev) => [pick, ...prev.filter((x) => x !== pick)].slice(0, 20));
        }
        schedule();
      }, 5000 + Math.floor(Math.random() * 3000));
    };
    schedule();
    return () => {
      if (id !== undefined) window.clearTimeout(id);
    };
  }, []);

  // Nhận deep link từ "Card Nhóm" (bài viết / bình luận / tin nhắn):
  // focus đúng nhóm và mở luôn nhóm đó, không dừng ở danh sách chung.
  /** Đếm lần yêu cầu focus (event) để chạy lại effect khi list đã mount. */
  const [focusNonce, setFocusNonce] = useState(0);
  useEffect(() => {
    const bump = () => setFocusNonce((n) => n + 1);
    window.addEventListener(BAIT_FOCUS_EVENT, bump);
    return () => window.removeEventListener(BAIT_FOCUS_EVENT, bump);
  }, []);

  useEffect(() => {
    if (loading) return;
    const target = takeBaitFocus();
    if (!target) return;
    const g = groups.find((x) => x.id === target);
    if (!g) return;
    setFocusId(target);
    setInfoGroup(g);
    const scrollTimer = window.setTimeout(() => {
      document
        .querySelector(`[data-bait-group="${target}"]`)
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 120);
    // Nhấp nháy khung vàng ~8s rồi trở lại bình thường.
    const clearTimer = window.setTimeout(() => setFocusId(null), 8000);
    return () => {
      window.clearTimeout(scrollTimer);
      window.clearTimeout(clearTimer);
    };
  }, [loading, groups, focusNonce]);

  if (loading) return null;
  if (items.length === 0) return null;


  return (
    <>
      <style>{CSS}</style>

      {hideBadges ? null : (
        <div className="flex justify-end pt-2">
          <HotBadge999 />
        </div>
      )}

      <div className="stack-sm">
          {items.map((g) => {
            const t = ticks[g.id] ?? { m: 0, c: 0 };
            return (
            <motion.button
              key={g.id}
              data-bait-group={g.id}
              layout
              transition={{ type: "spring", stiffness: 420, damping: 34 }}
              type="button"
              className={`chat-list-row active:scale-[0.98] transition-all duration-150 ${
                focusId === g.id ? "bait-focus" : ""
              }`}
              onClick={() => setInfoGroup(g)}
            >
              <span className="chat-list-avatar-wrap">
                {g.avatar_url ? (
                  <img className="chat-list-avatar" src={g.avatar_url} alt="" loading="lazy" />
                ) : (
                  <span
                    className="chat-list-avatar grid place-items-center"
                    style={{ background: "linear-gradient(135deg,#7c3aed,#ec4899)", color: "white" }}
                    aria-hidden
                  >
                    <Users size={18} />
                  </span>
                )}
              </span>
              <div className="chat-list-body">
                <div className="chat-list-row1">
                  <span className="chat-list-name inline-flex items-center gap-1.5">
                    {applyLocation(g.name, province)}
                    <span className="text-[10px] font-semibold rounded-full px-1.5 py-0.5 bg-violet-500/15 text-violet-700 border border-violet-300/40">
                      NHÓM
                    </span>
                  </span>
                  <span className="text-[11px] font-extrabold rounded-full px-2 py-0.5 bg-sky-400/20 text-sky-600 border border-sky-300/50 transition-all">
                    {shortCount(Math.max(0, g.message_count + t.c))}
                  </span>
                </div>
                <div className="chat-list-row2 flex items-center gap-2">
                  <span className="bait-shimmer rounded-md">
                    <span className="chat-list-preview blur-sm select-none pointer-events-none">
                      {g.preview_text || "Tin nhắn mới trong nhóm…"}
                    </span>
                  </span>
                  <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                    {shortCount(Math.max(0, g.member_count + t.m))} thành viên
                  </span>
                </div>
              </div>
            </motion.button>
            );
          })}
      </div>

      {/* Bước 1: mọi thành viên đều thấy popup thông tin nhóm. */}
      {infoGroup ? (
        <BaitGroupInfoPopup
          group={infoGroup}
          province={province}
          onClose={() => setInfoGroup(null)}
          onJoin={() => {
            setInfoGroup(null);
            setLockOpen(true);
          }}
        />
      ) : null}

      {/* Bước 2: bấm "Tham Gia Ngay" → yêu cầu đăng ký VIP. */}
      <VipRequiredPopup
        open={lockOpen}
        onClose={() => setLockOpen(false)}
        featureName="Nhóm cộng đồng"
      />
    </>
  );
}

export default BaitGroupsList;
