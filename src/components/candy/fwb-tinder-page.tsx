import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform } from "framer-motion";
import { X, Heart, MapPin, MessageCircle, Venus, Mars } from "lucide-react";
import confetti from "canvas-confetti";
import { useAuth } from "@/components/candy/auth-provider";
import { FwbDetailModal, fakeToDetail } from "@/components/candy/fwb-detail-modal";
import { FwbAgePhoneGate, isAgePhoneVerified } from "@/components/candy/fwb-age-phone-gate";
import UniversalBadge from "@/components/candy/universal-badge";
import { toast } from "sonner";
import {
  loadNearbyFwbCandidates,
  sendConnectionRequest,
  FWB_DEMO_ACCEPT_RATIO,
  randomDemoDelayMs,
  type FwbCandidate,
} from "@/lib/fwb-matches";

interface Props {
  onOpenChat?: (id: string) => void;
}

type Phase = "idle" | "searching" | "searchingNext" | "sending" | "waiting" | "matched" | "declined";

/** Pool nội dung loading — random không lặp lại liên tiếp. */
const SEARCH_LINES = (city: string): string[] => [
  `🔍 Đang tìm người phù hợp...`,
  `📍 Đang tìm tại khu vực ${city}...`,
  `❤️ Ghép nối sở thích tương đồng...`,
  `✨ Tìm người đang hoạt động gần đây...`,
  `🌙 Đang mở rộng phạm vi tìm kiếm...`,
  `💫 Phân tích độ tương thích...`,
  `🎯 Lọc hồ sơ chất lượng cao...`,
];

let _lastSearchIdx = -1;
function pickSearchLine(city: string): string {
  const pool = SEARCH_LINES(city);
  let i = Math.floor(Math.random() * pool.length);
  if (i === _lastSearchIdx) i = (i + 1) % pool.length;
  _lastSearchIdx = i;
  return pool[i];
}

export function FwbTinderPage({ onOpenChat }: Props) {
  const { me } = useAuth();
  const [profiles, setProfiles] = useState<FwbCandidate[]>([]);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [detail, setDetail] = useState<FwbCandidate | null>(null);
  const [needsOnb, setNeedsOnb] = useState(false);
  const [loading, setLoading] = useState(true);
  const [matchedWith, setMatchedWith] = useState<FwbCandidate | null>(null);
  const [searchLine, setSearchLine] = useState<string>("");
  const [likeBurst, setLikeBurst] = useState(false);
  const viewerProvince = me?.province || (me as any)?.location || null;

  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-14, 14]);
  const likeOpacity = useTransform(x, [40, 140], [0, 1]);
  const nopeOpacity = useTransform(x, [-140, -40], [1, 0]);

  useEffect(() => {
    if (!me) return;
    // Nick clone (is_seed_account) bỏ qua bước onboarding — truy cập thẳng.
    if ((me as any).is_seed_account === true) {
      setNeedsOnb(false);
      return;
    }
    setNeedsOnb(!isAgePhoneVerified(me as any));
  }, [me?.id, (me as any)?.phone, (me as any)?.age, (me as any)?.is_seed_account]);

  const load = useCallback(async () => {
    if (!me) return;
    setLoading(true);
    setPhase("searching");
    // Hiển thị animation "Đang tìm người ở khu vực ..." vài giây
    const rows = await loadNearbyFwbCandidates({
      meId: me.id,
      province: viewerProvince,
      meGender: (me as any).gender || null,
      limit: 30,
    });

    await new Promise((r) => setTimeout(r, 1500));
    setProfiles(rows);
    setIndex(0);
    setPhase("idle");
    setLoading(false);
  }, [me?.id, viewerProvince, (me as any)?.gender]);

  useEffect(() => { if (!needsOnb) void load(); }, [needsOnb, load]);

  const advance = () => {
    setIndex((i) => profiles.length > 0 ? (i + 1) % profiles.length : 0);
    x.set(0);
  };

  const onPass = () => {
    if (phase !== "idle") return;
    setSearchLine(pickSearchLine(me?.province || "khu vực của bạn"));
    setPhase("searchingNext");
    const delay = 2000 + Math.floor(Math.random() * 2000);
    // Đổi nội dung loading giữa chừng để cảm giác đang thực sự tìm
    const tMid = window.setTimeout(() => {
      setSearchLine(pickSearchLine(me?.province || "khu vực của bạn"));
    }, Math.floor(delay / 2));
    const t = window.setTimeout(() => {
      advance();
      setPhase("idle");
    }, delay);
    timersRef.current.push(tMid, t);
  };

  // Confetti khi match
  const fireConfetti = useCallback(() => {
    try {
      confetti({ particleCount: 90, spread: 70, startVelocity: 40, origin: { y: 0.4 } });
      window.setTimeout(() => {
        confetti({ particleCount: 60, angle: 60, spread: 55, origin: { x: 0 } });
        confetti({ particleCount: 60, angle: 120, spread: 55, origin: { x: 1 } });
      }, 200);
    } catch { /* ignore */ }
  }, []);

  // Hủy timer khi unmount
  const timersRef = useRef<number[]>([]);
  useEffect(() => () => { timersRef.current.forEach(window.clearTimeout); }, []);

  const onLike = async () => {
    if (phase !== "idle") return;
    const current = profiles[index];
    if (!current || !me) return;

    // Heart burst animation
    setLikeBurst(true);
    window.setTimeout(() => setLikeBurst(false), 700);

    // 1) Animation "Đang gửi yêu cầu kết nối..."
    setPhase("sending");
    const sendPromise = sendConnectionRequest({ fromUser: me.id, candidate: current });
    await new Promise((r) => setTimeout(r, 2000 + Math.random() * 1500));
    const res = await sendPromise;

    // 2) Đã match ngay (đối phương đã gửi request trước đó)
    if (res.matchedNow) {
      fireConfetti();
      setMatchedWith(current);
      setPhase("matched");
      return;
    }

    // 3) Chuyển "Đang chờ phản hồi"
    setPhase("waiting");

    // Hồ sơ hệ thống: random 5–15s rồi tự accept / decline
    if (res.isDemo) {
      const delay = randomDemoDelayMs();
      const t = window.setTimeout(() => {
        const accepted = Math.random() < FWB_DEMO_ACCEPT_RATIO;
        if (accepted) {
          fireConfetti();
          setMatchedWith(current);
          setPhase("matched");
        } else {
          setPhase("declined");
        }
      }, delay);
      timersRef.current.push(t);
      return;
    }

    // User thật: ở waiting ~2s rồi chuyển sang idle (request đã ở DB pending)
    await new Promise((r) => setTimeout(r, 2000));
    setPhase("idle");
    advance();
  };

  const onDragEnd = (_: any, info: { offset: { x: number } }) => {
    if (phase !== "idle") { x.set(0); return; }
    if (info.offset.x > 120) onLike();
    else if (info.offset.x < -120) onPass();
    else x.set(0);
  };


  if (needsOnb) {
    return <FwbAgePhoneGate onDone={() => setNeedsOnb(false)} />;
  }

  const current = profiles[index];
  const cityLabel = viewerProvince || "khu vực của bạn";

  // ===== Searching screen (mở tab lần đầu / tải lại) =====
  if (phase === "searching") {
    return (
      <div className="fwb-dating-root">
        <div className="fwb-search-screen">
          <div className="fwb-search-pulse">
            <div className="grid" aria-hidden />
            <div className="sweep" aria-hidden />
            <div className="ring r1" />
            <div className="ring r2" />
            <div className="ring r3" />
            <div className="core">📍</div>
          </div>
          <div className="fwb-search-title">📍 Tìm quanh đây</div>
          <div className="fwb-search-sub">Đang tìm người phù hợp gần bạn...</div>
        </div>
      </div>
    );
  }

  // ===== Searching next profile screen (sau khi bỏ qua) =====
  if (phase === "searchingNext") {
    return (
      <div className="fwb-dating-root">
        <div className="fwb-search-screen">
          <div className="fwb-search-pulse">
            <div className="grid" aria-hidden />
            <div className="sweep" aria-hidden />
            <div className="ring r1" />
            <div className="ring r2" />
            <div className="ring r3" />
            <div className="core">🔍</div>
          </div>
          <div className="fwb-search-title">Đang tìm đối tượng phù hợp</div>
          <AnimatePresence mode="wait">
            <motion.div
              key={searchLine}
              className="fwb-search-sub"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.35 }}
            >
              {searchLine || `📍 Đang tìm người ở khu vực ${cityLabel}...`}
            </motion.div>
          </AnimatePresence>
          <div className="fwb-search-skeleton" aria-hidden>
            <div className="sk-avatar" />
            <div className="sk-line w70" />
            <div className="sk-line w40" />
          </div>
        </div>
      </div>
    );
  }

  // ===== Matched screen =====
  if (phase === "matched" && matchedWith) {
    return (
      <div className="fwb-dating-root">
        <div className="fwb-matched-screen">
          <div className="fwb-matched-hearts" aria-hidden>
            <motion.span
              initial={{ scale: 0, y: 40, opacity: 0 }}
              animate={{ scale: [0, 1.4, 1], y: [40, -10, 0], opacity: 1 }}
              transition={{ duration: 0.7, ease: "easeOut" }}
              style={{ fontSize: 84, filter: "drop-shadow(0 8px 30px rgba(236,72,153,.55))" }}
            >💖</motion.span>
            <motion.span
              initial={{ scale: 0, y: 30, opacity: 0 }}
              animate={{ scale: [0, 1, 0.9], y: [30, -40, -70], opacity: [0, 1, 0] }}
              transition={{ duration: 1.6, delay: 0.2, repeat: Infinity }}
              style={{ position: "absolute", left: "30%", fontSize: 28 }}
            >💖</motion.span>
            <motion.span
              initial={{ scale: 0, y: 30, opacity: 0 }}
              animate={{ scale: [0, 1, 0.9], y: [30, -50, -90], opacity: [0, 1, 0] }}
              transition={{ duration: 1.8, delay: 0.5, repeat: Infinity }}
              style={{ position: "absolute", right: "28%", fontSize: 24 }}
            >💖</motion.span>
          </div>
          <div className="fwb-matched-title">💖 {matchedWith.display_name} đã kết nối với bạn!</div>
          <div className="fwb-matched-sub">Hãy gửi lời chào đầu tiên ngay nhé.</div>
          <div className="fwb-matched-actions">
            <button
              className="btn-primary"
              onClick={() => { onOpenChat?.(matchedWith.id); setMatchedWith(null); setPhase("idle"); advance(); }}
            >
              <MessageCircle size={18} /> Nhắn tin ngay
            </button>
            <button
              className="btn-ghost"
              onClick={() => { setMatchedWith(null); setPhase("idle"); advance(); }}
            >Tiếp tục tìm</button>
          </div>
        </div>
      </div>
    );
  }

  // ===== Declined screen =====
  if (phase === "declined") {
    return (
      <div className="fwb-dating-root">
        <div className="fwb-matched-screen">
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 220, damping: 18 }}
            style={{ fontSize: 64 }}
          >😔</motion.div>
          <div className="fwb-matched-title">Người này chưa sẵn sàng kết nối</div>
          <div className="fwb-matched-sub">Đừng buồn nhé — còn rất nhiều người đang chờ bạn.</div>
          <div className="fwb-matched-actions">
            <button
              className="btn-primary"
              onClick={() => { setPhase("idle"); advance(); }}
            >Thử người khác</button>
          </div>
        </div>
      </div>
    );
  }


  return (
    <div className="fwb-dating-root">
      <div className="fwb-dating-stage">
        <AnimatePresence mode="wait">
          {current && phase === "idle" ? (
            <motion.div
              key={current.id}
              className="fwb-dating-card"
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              style={{ x, rotate }}
              onDragEnd={onDragEnd}
              initial={{ scale: 0.96, opacity: 0, y: 12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ x: x.get() > 0 ? 360 : -360, opacity: 0, transition: { duration: 0.22 } }}
            >
              <div className="fwb-dating-photo-wrap">
                <img loading="lazy" decoding="async" className="fwb-dating-photo-bg" src={current.avatar_url || current.avatar || "/placeholder.svg"} alt="" aria-hidden />
                <img loading="lazy" decoding="async"
                  className="fwb-dating-photo"
                  src={current.avatar_url || current.avatar || "/placeholder.svg"}
                  alt={current.display_name || ""}
                  onClick={() => setDetail(current)}
                  style={{ cursor: "zoom-in" }}
                />
                <motion.span className="fwb-dating-badge like" style={{ opacity: likeOpacity }}>KẾT NỐI</motion.span>
                <motion.span className="fwb-dating-badge nope" style={{ opacity: nopeOpacity }}>BỎ QUA</motion.span>
                <span className="fwb-dating-online">🟢 Đang hoạt động</span>
                {current.kind === "demo" ? (
                  <span className="fwb-dating-demo">Hồ sơ hệ thống</span>
                ) : null}
              </div>

              <div className="fwb-dating-info">
                {(() => {
                  const isMale = current.gender === "male" || current.gender === "M" || current.gender === "nam";
                  const fallbackBio = current.kind === "demo"
                    ? (current.id.charCodeAt(0) % 2 === 0 ? "Cần Kết Nối" : "Nhắn Tin Ngay")
                    : null;
                  return (
                    <>
                      <div className="fwb-dating-name">
                        <span>{current.display_name || current.full_name}</span>
                        {current.age ? <span className="age">, {current.age}</span> : null}
                        {current.vip_level && current.vip_level > 0 ? (
                          <span style={{ marginLeft: 6, display: "inline-flex", verticalAlign: "middle" }}>
                            <UniversalBadge profile={current as any} />
                          </span>
                        ) : null}
                        <span className={`fwb-dating-gender ${isMale ? "m" : "f"}`}>
                          {isMale ? <Mars size={14} /> : <Venus size={14} />}
                          {isMale ? " (Nam)" : " (Nữ)"}
                        </span>
                      </div>
                      <div className="fwb-dating-loc">
                        <MapPin size={14} />
                        <span>{current.province || me?.province || "—"}</span>
                      </div>
                      <div className="fwb-dating-bio-row">
                        <p className="fwb-dating-bio">
                          {current.bio ? `💬 ${current.bio}` : fallbackBio ? `💬 ${fallbackBio}` : "💬 Đang tìm người phù hợp"}
                        </p>
                        <div className="fwb-dating-inline-actions">
                          <button className="fwb-dating-btn pass" aria-label="Bỏ qua" onClick={onPass}>
                            <X size={20} strokeWidth={2.5} />
                          </button>
                          <button
                            className="fwb-dating-btn chat"
                            aria-label="Nhắn tin"
                            onClick={() => {
                              if (current.kind === "demo") {
                                toast.info("Hãy gửi ❤️ Quan tâm trước để bắt đầu trò chuyện.");
                                return;
                              }
                              onOpenChat?.(current.id);
                            }}
                          >
                            <MessageCircle size={20} strokeWidth={2.5} />
                          </button>
                          <button className="fwb-dating-btn like" aria-label="Kết nối" onClick={onLike}>
                            <Heart size={20} fill="currentColor" />
                          </button>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {phase === "sending" ? (
          <div className="fwb-dating-search">
            <div className="spinner" />
            <div className="label">💌 Đang gửi yêu cầu kết nối...</div>
            <div className="sublabel">Vui lòng đợi giây lát</div>
          </div>
        ) : null}

        {phase === "waiting" ? (
          <div className="fwb-dating-search">
            <div className="dots"><span /><span /><span /></div>
            <div className="label">⏳ Đang chờ đối phương phản hồi...</div>
            <div className="sublabel">Bạn sẽ được báo khi ghép đôi thành công</div>
          </div>
        ) : null}

        {!loading && !current && phase === "idle" ? (
          <div className="fwb-dating-empty">
            <div style={{ fontSize: 32 }}>🎯</div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>Hết hồ sơ phù hợp</div>
            <div style={{ opacity: 0.7, fontSize: 13, textAlign: "center" }}>Hãy quay lại sau, hoặc tải lại để khám phá thêm.</div>
            <button onClick={() => void load()}>Tải lại</button>
          </div>
        ) : null}
      </div>


      <AnimatePresence>
        {likeBurst ? (
          <motion.div
            className="fwb-like-burst"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: [0, 1.4, 1.8], opacity: [0, 1, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
            aria-hidden
          >💖</motion.div>
        ) : null}
      </AnimatePresence>

      {detail ? (
        <FwbDetailModal
          profile={fakeToDetail(detail as any, me?.province)}
          onClose={() => setDetail(null)}
          onAction={() => { setDetail(null); onLike(); }}
        />
      ) : null}
    </div>
  );
}
