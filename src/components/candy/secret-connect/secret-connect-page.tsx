import { avatarSrc } from "@/lib/image-cdn";
/**
 * ❤️ Kết Nối Bí Mật — V3.
 *
 * Luồng: Bắt đầu → Glass Heart quay LED (5–10s) → card thông tin căn trái,
 * tuổi + khu vực quay slot 5–10s → 2 phút quyết định → Ghép đôi → 4 giai đoạn
 * mô phỏng người thật (~15–20s, chỉ animation client) → thành công (avatar quay
 * 360°, flash, tên clone bay lên) hoặc popup lớn "GHÉP ĐÔI KHÔNG THÀNH CÔNG"
 * + đếm ngược 20s tự tìm lại.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "@/components/candy/auth-provider";
import {
  DEFAULT_SETTINGS,
  bumpWeeklyUsage,
  ensureWeeklyReset,
  loadSecretCandidatePool,
  loadSecretConnectSettings,
  loadWeeklyUsage,
  logConnectAttempt,
  markCloneUsedForUser,
  markSecretAccountUsed,
  pick,
  randInt,
  resolveMatchOutcome,
  syncConnectArea,
  type ConnectCandidate,
  type FailReason,
  type SecretConnectSettings,
} from "@/lib/secret-connect";
import { getDistricts } from "@/lib/vn-locations";
import { AGE_REEL, SlotReel, clampAge } from "./slot-reel";
import { GlassHeart, type HeartEnergy } from "./glass-heart";
import "./secret-connect.css";
import "./secret-connect-v3.css";
import "./secret-connect-mobile.css";


type Stage = "idle" | "scanning" | "reveal" | "connecting" | "failed" | "matched" | "limit";

/** 12 lý do từ chối — random, hiển thị lớn trong popup. */
const FAIL_REASONS = [
  "Đối phương đã từ chối lời mời.",
  "Đối phương đang bận.",
  "Đối phương đã thoát ứng dụng.",
  "Đối phương đang nhắn tin với người khác.",
  "Đối phương vừa hủy tìm kiếm.",
  "Đối phương không còn trực tuyến.",
  "Đối phương đã ghép đôi thành công với người khác.",
  "Đối phương không phản hồi.",
  "Đối phương đã hết lượt ghép đôi hôm nay.",
  "Kết nối đã hết thời gian chờ.",
  "Đối phương đã đóng ứng dụng.",
  "Đối phương tạm thời không nhận lời mời.",
];

const SEARCH_TEXTS = ["Đang tìm", "Đang dò khu vực", "Đang kết nối tín hiệu"];

/** "Tìm kiếm : ..." — random nhu cầu. */
const SEEK_LABELS = ["Tìm FWB", "Tìm ONS", "Tìm Người Yêu", "Tìm Bạn Tâm Sự"];

/** Giai đoạn 2 (3–8s). */
const PHASE2 = [
  "Đối phương đã nhận được lời mời...",
  "Đối phương đang xem hồ sơ của bạn...",
];

/** Giai đoạn 3 (8–15s) — mỗi dòng 2–3s, fade chuyển. */
const PHASE3 = [
  "Đối phương đang cân nhắc...",
  "Đối phương đang xem lời mời...",
  "Đang chờ phản hồi...",
  "Đối phương đang quyết định...",
  "Đối phương vừa mở lời mời...",
  "Đối phương đang suy nghĩ...",
  "Đối phương đang kiểm tra hồ sơ...",
  "Đang kết nối an toàn...",
  "Đang xác minh ghép đôi...",
];

const DECIDE_SECONDS = 120;
const RETRY_SECONDS = 20;

function genderText(g: ConnectCandidate["gender"]) {
  return g === "female" ? "Nữ" : g === "male" ? "Nam" : "Khác";
}

function mmss(total: number) {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Hạt sáng nền. */
function Particles({ count = 16 }: { count?: number }) {
  const bits = useMemo(
    () =>
      Array.from({ length: count }, () => ({
        left: `${Math.round(Math.random() * 100)}%`,
        size: `${(Math.random() * 2 + 2).toFixed(1)}px`,
        dx: `${Math.round((Math.random() - 0.5) * 80)}px`,
        dur: `${(Math.random() * 6 + 7).toFixed(1)}s`,
        delay: `${(Math.random() * 8).toFixed(1)}s`,
      })),
    [count],
  );
  return (
    <span className="sc-particles" aria-hidden>
      {bits.map((b, i) => (
        <i
          key={i}
          style={
            {
              left: b.left,
              "--s": b.size,
              "--dx": b.dx,
              "--d": b.dur,
              animationDelay: b.delay,
            } as React.CSSProperties
          }
        />
      ))}
    </span>
  );
}

function Row({
  label,
  children,
  valueClass,
}: {
  label: string;
  children: React.ReactNode;
  valueClass?: string;
}) {
  return (
    <div className="sc-row">
      <span className="sc-row__label">{label}</span>
      <span className={`sc-row__value ${valueClass || ""}`}>{children}</span>
    </div>
  );
}

/* ---------------------------------- page ---------------------------------- */

export function SecretConnectPage() {
  const { me } = useAuth();
  const navigate = useNavigate();

  const [settings, setSettings] = useState<SecretConnectSettings>(DEFAULT_SETTINGS);
  const [area, setArea] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [candidate, setCandidate] = useState<ConnectCandidate | null>(null);
  const [seekLabel, setSeekLabel] = useState(SEEK_LABELS[0]);
  const [failText, setFailText] = useState<string>("");
  const [usage, setUsage] = useState(0);
  const [searchText, setSearchText] = useState(SEARCH_TEXTS[0]);
  const [reelMs, setReelMs] = useState(7000);
  const [reelsDone, setReelsDone] = useState(false);
  const [decideLeft, setDecideLeft] = useState(DECIDE_SECONDS);
  const [retryLeft, setRetryLeft] = useState(RETRY_SECONDS);
  const [phaseText, setPhaseText] = useState("");
  const [phaseKey, setPhaseKey] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [showTip, setShowTip] = useState(false);

  const poolRef = useRef<ConnectCandidate[]>([]);
  const timers = useRef<number[]>([]);
  const aliveRef = useRef(true);

  const isVip = Number((me as any)?.vip_level ?? 0) > 0;
  const unlimited = isVip && settings.vip_unlimited;
  const remaining = Math.max(0, settings.free_weekly_limit - usage);

  const clearTimers = useCallback(() => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  }, []);
  const later = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      if (aliveRef.current) fn();
    }, ms);
    timers.current.push(id);
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    void (async () => {
      const s = await loadSecretConnectSettings();
      if (!aliveRef.current) return;
      setSettings(s);
      void ensureWeeklyReset();
      if (me?.id) {
        const [a, u] = await Promise.all([syncConnectArea(me.id), loadWeeklyUsage(me.id)]);
        if (!aliveRef.current) return;
        setUsage(u);
        setArea(a);
      }
    })();
    return () => {
      aliveRef.current = false;
      clearTimers();
    };
  }, [me?.id, clearTimers]);

  /* --------------------------------- scan --------------------------------- */

  const startScan = useCallback(() => {
    clearTimers();
    setFailText("");
    setCandidate(null);
    setRevealed(false);
    setReelsDone(false);
    setShowTip(false);
    setStage("scanning");

    const targetArea = area || "";
    const totalMs = randInt(5, 8) * 1000;

    setSearchText(SEARCH_TEXTS[0]);
    later(() => setSearchText(SEARCH_TEXTS[1]), Math.round(totalMs * 0.35));
    later(() => setSearchText(SEARCH_TEXTS[2]), Math.round(totalMs * 0.7));

    void (async () => {
      if (poolRef.current.length === 0) {
        const pool = await loadSecretCandidatePool(
          targetArea,
          Math.max(settings.weekly_clone_count, 10),
          me?.id ?? null,
        );
        if (aliveRef.current) poolRef.current = pool;
      }
    })();

    later(() => {
      const next = poolRef.current.shift();
      if (!next) {
        later(() => startScan(), 800);
        return;
      }
      const spin = randInt(5, 10) * 1000;
      setReelMs(spin);
      setSeekLabel(pick(SEEK_LABELS));
      setCandidate(next);
      setDecideLeft(DECIDE_SECONDS);
      setStage("reveal");
      later(() => setReelsDone(true), spin + 200);
      if (me?.id && next.cloneId) {
        void markCloneUsedForUser(me.id, next.cloneId, false);
        void markSecretAccountUsed(next.cloneId, false);
      }
    }, totalMs);
  }, [area, clearTimers, later, me?.id, settings]);

  /* ------------------------- countdown: 2 phút quyết định ------------------ */

  const handleCancel = useCallback(() => {
    clearTimers();
    setCandidate(null);
    setFailText("");
    setStage("idle");
  }, [clearTimers]);

  useEffect(() => {
    if (stage !== "reveal" || !reelsDone) return;
    const id = window.setInterval(() => {
      setDecideLeft((s) => {
        if (s <= 1) {
          window.clearInterval(id);
          handleCancel();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [stage, reelsDone, handleCancel]);

  /* --------------------------------- match -------------------------------- */

  const handleMatch = useCallback(() => {
    if (!candidate) return;
    if (!unlimited && remaining <= 0) {
      setStage("limit");
      return;
    }
    clearTimers();
    setStage("connecting");
    setPhaseText("Đang gửi lời mời ghép đôi...");
    setPhaseKey((k) => k + 1);

    if (me?.id) void bumpWeeklyUsage(me.id).then((n) => aliveRef.current && setUsage(n));

    const say = (text: string, at: number) =>
      later(() => {
        setPhaseText(text);
        setPhaseKey((k) => k + 1);
      }, at);

    // Giai đoạn 2 (3–8s)
    say(pick(PHASE2), 3000);
    // Giai đoạn 3 (8–15s): mỗi dòng 2–3s
    const lines = [...PHASE3].sort(() => Math.random() - 0.5);
    let t = 8000;
    let li = 0;
    while (t < 15000 && li < lines.length) {
      say(lines[li++], t);
      t += randInt(2, 3) * 1000;
    }

    // Giai đoạn 4 (15–20s): gọi kết quả 1 lần duy nhất.
    const waitMs = randInt(15, 20) * 1000;
    later(() => {
      const accepted = me?.id ? resolveMatchOutcome(me.id, settings) : Math.random() < 0.3;
      if (accepted) {
        setPhaseText("❤️ Đối phương đã đồng ý ghép đôi");
        setPhaseKey((k) => k + 1);
        setStage("matched");
        setRevealed(false);
        later(() => setRevealed(true), 900);
        if (me?.id) {
          if (candidate.cloneId) {
            void markCloneUsedForUser(me.id, candidate.cloneId, true);
            void markSecretAccountUsed(candidate.cloneId, true);
          }
          void logConnectAttempt({
            userId: me.id,
            cloneId: candidate.cloneId,
            area: area || "",
            result: "matched",
          });
        }
      } else {
        setFailText(pick(FAIL_REASONS));
        setRetryLeft(RETRY_SECONDS);
        setStage("failed");
        if (me?.id)
          void logConnectAttempt({
            userId: me.id,
            cloneId: candidate.cloneId,
            area: area || "",
            result: pick<FailReason>(["busy", "left", "declined", "no_reply"]),
          });
      }
    }, waitMs);
  }, [area, candidate, clearTimers, later, me?.id, remaining, settings, unlimited]);

  /* -------------------- countdown: 20s tự tìm lại sau khi fail ------------- */
  useEffect(() => {
    if (stage !== "failed") return;
    const id = window.setInterval(() => {
      setRetryLeft((s) => {
        if (s <= 1) {
          window.clearInterval(id);
          startScan();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [stage, startScan]);

  /* --------------------------------- render ------------------------------- */

  const areaReel = useMemo(() => {
    const prov = candidate?.province || area || "";
    const list = prov ? getDistricts(prov) : [];
    return list.length ? list : [prov || "Toàn tỉnh"];
  }, [area, candidate?.province]);

  const realArea = candidate
    ? settings.show_district
      ? `${candidate.district}, ${candidate.province}`
      : candidate.province
    : "";

  const energy: HeartEnergy =
    stage === "matched" ? "match" : stage === "connecting" ? "sending" : stage === "scanning" ? "search" : "calm";

  const showCard =
    !!candidate && (stage === "reveal" || stage === "connecting" || stage === "matched");

  return (
    <div className="sc-page">
      <Particles />
      <header className="sc-head">
        <h1 className="sc-title">Kết Nối Bí Mật</h1>
        <div className="sc-sub">
          {unlimited ? "VIP · không giới hạn" : `${remaining}/${settings.free_weekly_limit} lượt`}
          {area ? ` · ${area}` : ""}
        </div>
      </header>

      <AnimatePresence mode="wait">
        {stage === "idle" && (
          <motion.div
            key="hero"
            className="sc-stage"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, filter: "blur(8px)" }}
            transition={{ duration: 0.5 }}
          >
            <GlassHeart energy="calm" />
            <div className="sc-hero__tagline">Một người đang chờ bạn</div>
            <button type="button" className="sc-cta sc-cta--hero" onClick={() => startScan()}>
              Bắt đầu kết nối
            </button>
          </motion.div>
        )}

        {stage === "scanning" && (
          <motion.div
            key="heart"
            className="sc-stage"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, filter: "blur(8px)" }}
            transition={{ duration: 0.45 }}
          >
            <GlassHeart energy="search" />
            <div className="sc-status">
              {searchText}
              <span className="sc-dots" />
            </div>
          </motion.div>
        )}

        {showCard && candidate && (
          <motion.div
            key="card"
            className="sc-stage sc-stage--card"
            initial={{ opacity: 0, y: 18, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, filter: "blur(10px)" }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="sc-heart-slot">
              <GlassHeart energy={energy} size={168} />
            </div>
            {stage === "connecting" && <span className="sc-beam" aria-hidden />}

            <div className={`sc-info${stage === "matched" && revealed ? " sc-info--flip" : ""}`}>
              {stage === "matched" && revealed && <span className="sc-flash" aria-hidden />}
              <div
                className={`sc-info__avatar${
                  stage === "matched" && revealed
                    ? " sc-info__avatar--reveal"
                    : " sc-info__avatar--hidden"
                }${stage === "connecting" ? " sc-info__avatar--beat" : ""}`}
              >
                {stage === "matched" && revealed && candidate.avatar ? (
                  <img src={avatarSrc(candidate.avatar, 64)} alt="" loading="lazy" decoding="async" />
                ) : null}
              </div>

              <div className="sc-rows">
                <Row label="Tên">
                  {stage === "matched" && revealed ? (
                    <span className="sc-realname">{candidate.name}</span>
                  ) : (
                    <button
                      type="button"
                      className="sc-name-btn"
                      onClick={() => setShowTip(true)}
                    >
                      Ẩn danh
                    </button>
                  )}
                </Row>


                <Row label="Tuổi">
                  <SlotReel
                    items={AGE_REEL}
                    finalValue={clampAge(candidate.age)}
                    spinning={stage === "reveal" && !reelsDone}
                    duration={reelMs}
                  />
                </Row>

                <Row label="Khu vực">
                  {stage === "matched" && revealed && settings.show_real_area_after ? (
                    realArea
                  ) : (
                    <SlotReel
                      items={areaReel}
                      finalValue={candidate.district || candidate.province}
                      spinning={stage === "reveal" && !reelsDone}
                      duration={reelMs}
                    />
                  )}
                </Row>

                <Row
                  label="Giới tính"
                  valueClass={
                    candidate.gender === "male"
                      ? "sc-row__value--male"
                      : candidate.gender === "female"
                        ? "sc-row__value--female"
                        : ""
                  }
                >
                  {genderText(candidate.gender)}
                </Row>

                <Row label="Tìm kiếm">{seekLabel}</Row>
              </div>
            </div>

            {stage === "reveal" && reelsDone && (
              <>
                <div className="sc-timerbox">
                  <div className="sc-countdown">{mmss(decideLeft)}</div>
                  <div className="sc-countdown__hint">Thời gian quyết định</div>
                </div>
                <div className="sc-actions sc-actions--dock">
                  <button type="button" className="sc-btn sc-btn--primary" onClick={handleMatch}>
                    ❤️ Ghép đôi
                  </button>
                  <button type="button" className="sc-btn" onClick={() => navigate(-1)}>
                    Hủy
                  </button>
                </div>
              </>
            )}


            {stage === "connecting" && (
              <div className="sc-phase" key={phaseKey}>
                {phaseText}
              </div>
            )}

            {stage === "matched" && (
              <>
                <div className="sc-phase" key={phaseKey}>
                  {phaseText}
                </div>
                {revealed && (
                  <div className="sc-actions">
                    {settings.allow_message && candidate.cloneId && (
                      <button
                        type="button"
                        className="sc-btn sc-btn--primary"
                        onClick={() => navigate(`/chat/${candidate.cloneId}`)}
                      >
                        Nhắn tin
                      </button>
                    )}
                    {settings.allow_profile_view && candidate.cloneId && (
                      <button
                        type="button"
                        className="sc-btn"
                        onClick={() => navigate(`/profile/${candidate.cloneId}`)}
                      >
                        Xem hồ sơ
                      </button>
                    )}
                    <button
                      type="button"
                      className="sc-btn sc-btn--full"
                      onClick={() => startScan()}
                    >
                      Tiếp tục kết nối
                    </button>
                  </div>
                )}
              </>
            )}
          </motion.div>
        )}

        {stage === "limit" && (
          <motion.div
            key="limit"
            className="sc-stage"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="sc-card">
              <div className="sc-line sc-line--name">Đã dùng hết lượt tuần này</div>
              <div className="sc-line sc-line--muted">Lượt mới sẽ mở lại vào thứ Hai</div>
            </div>
            <button type="button" className="sc-btn sc-btn--full" onClick={handleCancel}>
              Quay lại
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {stage === "failed" && (
        <div className="sc-modal" role="dialog" aria-modal="true">
          <div className="sc-modal__box">
            <div className="sc-modal__title">GHÉP ĐÔI KHÔNG THÀNH CÔNG</div>
            <div className="sc-modal__reason">{failText}</div>
            <div className="sc-modal__timer">
              Tự động tìm lại sau
              <b>{retryLeft}</b>
            </div>
            <div className="sc-actions">
              <button
                type="button"
                className="sc-btn sc-btn--primary"
                onClick={() => startScan()}
              >
                🔍 Tìm ngay
              </button>
              <button type="button" className="sc-btn" onClick={handleCancel}>
                ❌ Hủy
              </button>
            </div>
          </div>
        </div>
      )}

      {showTip && stage !== "matched" && (
        <div
          className="sc-anon"
          role="dialog"
          aria-modal="true"
          onClick={() => setShowTip(false)}
        >
          <div className="sc-anon__box" onClick={(e) => e.stopPropagation()}>
            <p className="sc-anon__text">
              Danh tính sẽ được mở khi cả hai ghép đôi thành công.
            </p>
            <button type="button" className="sc-btn sc-btn--full" onClick={() => setShowTip(false)}>
              Đã hiểu
            </button>
          </div>
        </div>
      )}
    </div>

  );
}

export default SecretConnectPage;
