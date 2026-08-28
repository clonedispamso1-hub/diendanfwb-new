import { avatarSrc } from "@/lib/image-cdn";
import { useVipUnlockLink } from "@/lib/vip-unlock-link";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  HeartHandshake, MessageCircle, UserMinus, MapPin, Crown, Sparkles, X, Users, ChevronRight,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/candy/auth-provider";
import UniversalBadge from "@/components/candy/universal-badge";
import { loadFwbFakeProfiles, type FakeProfileRecord } from "@/lib/fake-profiles";
import { unfollowUser } from "@/lib/follow-actions";
import { FakeMiniProfile } from "@/components/candy/fake-mini-profile";

import { openExternalLinkWithFeedback } from "@/lib/external-link";
import { read3 } from "@/lib/content-db";
import { resolveUserName } from "@/lib/user-name";
interface FwbPageProps {
  onViewProfile: (userId: string) => void;
  onOpenChat: (userId: string) => void;
}

interface FollowingItem {
  id: string;
  full_name: string | null;
  username: string | null;
  avatar: string | null;
  province: string | null;
  vip_level: number | null;
}

const REQUIRED_VIP = 2;

export function FwbPage({ onViewProfile, onOpenChat }: FwbPageProps) {
  const { me } = useAuth();
  const adminLink = useVipUnlockLink();
  const [following, setFollowing] = useState<FollowingItem[]>([]);
  const [fakes, setFakes] = useState<FakeProfileRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [matching, setMatching] = useState(true);
  const [vipLockOpen, setVipLockOpen] = useState(false);
  const [miniProfile, setMiniProfile] = useState<FakeProfileRecord | null>(null);

  const myProvince = me?.province || null;
  const areaLabel = myProvince || "khu vực gần bạn";
  const matchingLines = useMemo(
    () => [
      "Đang quét vị trí của bạn...",
      `Đang ưu tiên thành viên tại ${areaLabel}...`,
      "Đang ưu tiên hồ sơ đang hoạt động gần đây...",
    ],
    [areaLabel],
  );

  const load = async () => {
    if (!me) return;
    setLoading(true);
    try {
      const { data: follows } = await read3()
        .from("follows")
        .select("following_id")
        .eq("follower_id", me.id)
        // Egress: 100 người đang theo dõi là đủ cho màn ghép đôi.
        .range(0, 99);

      const ids = (follows || []).map((f: any) => f.following_id);
      let followingRows: FollowingItem[] = [];
      if (ids.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, full_name, username, avatar, province, vip_level")
          .in("id", ids);
        followingRows = (profs as FollowingItem[]) || [];
      }
      setFollowing(followingRows);

      const fakeRows = await loadFwbFakeProfiles({ province: myProvince, limit: 20 });
      setFakes(fakeRows);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setMatching(true);
    const timer = window.setTimeout(() => setMatching(false), 3000);
    void load();
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id, myProvince]);

  const unfollow = async (uid: string) => {
    if (!me) return;
    if (!window.confirm("Bỏ yêu thích người này?")) return;
    await unfollowUser(me.id, uid);
    setFollowing((prev) => prev.filter((p) => p.id !== uid));
  };

  const openMiniProfile = (p: FakeProfileRecord) => {
    setMiniProfile(p);
  };

  const triggerVipLock = () => {
    setMiniProfile(null);
    setVipLockOpen(true);
  };

  const openAdminFb = () => {
    if (adminLink) openExternalLinkWithFeedback(adminLink);
  };

  return (
    <section className="stack-lg">
      {/* HERO */}
      <div className="fwb-hero">
        <div className="fwb-hero-inner">
          <div className="inline-flex items-center gap-2">
            <HeartHandshake size={22} className="fwb-hero-icon" />
            <h2 className="section-title fwb-hero-title">Kết nối FWB</h2>
          </div>
          <p className="fwb-hero-sub">
            Tìm bạn cùng khu vực {myProvince ? <strong>· {myProvince}</strong> : "(cập nhật khu vực ở Hồ sơ để thấy nhiều người hơn)"} — kết bạn, trò chuyện, gặp gỡ an toàn.
          </p>
        </div>
      </div>

      {/* Lối tắt sang trang gợi ý kết bạn riêng (đã tách khỏi đây để gọn). */}
      <SuggestedShortcut province={myProvince} />

      {/* PHẦN 1 — TÌM KIẾM FWB (NICK ẢO) */}
      <section className="stack-sm">
        <div className="inline-flex items-center justify-between">
          <h3 className="section-title" style={{ fontSize: "1.05rem" }}>
            <Sparkles size={16} className="inline mr-1" style={{ color: "var(--gold-500, #f5c542)" }} />
            Tìm kiếm FWB · {myProvince || "Toàn quốc"}
          </h3>
          <span className="fwb-vip-tag"><Crown size={12} /> VIP {REQUIRED_VIP}+</span>
        </div>

        {matching || loading ? (
          <div className="fwb-matching-panel" role="status" aria-live="polite">
            <div className="fwb-radar" aria-hidden="true">
              <span className="fwb-radar-core" />
              <span className="fwb-radar-sweep" />
              <span className="fwb-radar-ring fwb-radar-ring-one" />
              <span className="fwb-radar-ring fwb-radar-ring-two" />
            </div>
            <div className="fwb-matching-copy">
              <p className="fwb-matching-title">Đang tìm kiếm người phù hợp...</p>
              <p className="fwb-matching-title" style={{ fontWeight: 600, opacity: 0.85 }}>
                Đang tìm kiếm người phù hợp tại: {areaLabel}
              </p>

              <div className="fwb-matching-lines">
                {matchingLines.map((line, index) => (
                  <span key={line} style={{ animationDelay: `${index * 0.55}s` }}>{line}</span>
                ))}
              </div>
            </div>
          </div>
        ) : fakes.length === 0 ? (
          <div className="empty-state">
            Chưa có gợi ý nào ở khu vực này.<br />
            <small className="muted-copy">(Admin có thể tạo thêm nick ảo trong Admin Panel → Nick ảo)</small>
          </div>
        ) : (
          <div className="fwb-swipe-wrap" aria-label="Vuốt sang phải để xem từng hồ sơ">
            <div className="fwb-swipe-track">
              {fakes.map((p) => {
                const name = p.display_name || resolveUserName(p as any, "Người dùng");
                const avatar = p.avatar_url || p.avatar || "/placeholder.svg";
                return (
                  <article key={p.id} className="fwb-card-gold">
                    <div className="fwb-card-shine" aria-hidden="true" />
                    <button
                      type="button"
                      className="fwb-card-tap"
                      onClick={() => openMiniProfile(p)}
                      aria-label={`Xem hồ sơ ${name}`}
                    >
                      <img loading="lazy" decoding="async" className="fwb-card-avatar" src={avatarSrc(avatar, 64)} alt={name} />
                      <div className="fwb-card-name">
                        {name}
                        <UniversalBadge profile={p as any} />
                      </div>
                      <div className="fwb-card-loc">
                        <MapPin size={12} /> {p.province || myProvince || "—"}
                      </div>
                    </button>
                    <div className="fwb-card-actions">
                      <button className="fwb-gold-btn" onClick={() => openMiniProfile(p)}>
                        <span className="fwb-gold-shine" />
                        Yêu thích
                      </button>
                      <button className="fwb-gold-btn fwb-gold-btn-alt" onClick={() => openMiniProfile(p)}>
                        <span className="fwb-gold-shine" />
                        Nhắn tin
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* PHẦN 2 — ĐÃ YÊU THÍCH */}
      <section className="stack-sm">
        <div className="inline-flex items-center justify-between">
          <h3 className="section-title" style={{ fontSize: "1.05rem" }}>👥 Đã yêu thích</h3>
          <span className="row-meta">{following.length} người</span>
        </div>

        {loading ? (
          <div className="empty-state">Đang tải…</div>
        ) : following.length === 0 ? (
          <div className="empty-state">Bạn chưa yêu thích ai. Vào Hồ sơ ai đó để bắt đầu.</div>
        ) : (
          <div className="fwb-scrollbox max-h-[400px] overflow-y-auto">
            <div className="stack-sm">
              {following.map((u) => (
                <article key={u.id} className="fwb-friend-card">
                  <button
                    type="button"
                    className="fwb-friend-id"
                    onClick={() => onViewProfile(u.id)}
                    aria-label={`Mở hồ sơ ${u.full_name}`}
                  >
                    <img loading="lazy" decoding="async" className="fwb-avatar" src={avatarSrc(u.avatar || "/placeholder.svg", 64)} alt="" />
                    <div className="fwb-friend-meta">
                      <span className="fwb-friend-name">
                        {resolveUserName(u as any, "Người dùng")}
                        <UniversalBadge profile={u as any} />
                      </span>
                      <span className="fwb-friend-loc">
                        <MapPin size={12} /> {u.province || "Chưa rõ khu vực"}
                      </span>
                    </div>
                  </button>
                  <div className="fwb-actions">
                    <button
                      className="fwb-btn fwb-btn-primary"
                      onClick={() => onOpenChat(u.id)}
                    >
                      <MessageCircle size={14} /> Nhắn tin
                    </button>
                    <button
                      className="fwb-btn fwb-btn-ghost"
                      onClick={() => void unfollow(u.id)}
                    >
                      <UserMinus size={14} /> Bỏ yêu thích
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* MINI PROFILE POPUP */}
      {miniProfile ? (
        <FakeMiniProfile
          profile={miniProfile}
          fallbackProvince={myProvince}
          onClose={() => setMiniProfile(null)}
          onAction={triggerVipLock}
        />
      ) : null}

      {/* POPUP CHẶN VIP */}
      {vipLockOpen ? (
        <div className="modal-backdrop" onClick={() => setVipLockOpen(false)}>
          <div className="modal-panel fwb-vip-modal" onClick={(e) => e.stopPropagation()}>
            <button className="icon-button fwb-vip-close" onClick={() => setVipLockOpen(false)} aria-label="Đóng">
              <X size={16} />
            </button>
            <div className="fwb-vip-crown">
              <Crown size={42} />
            </div>
            <h3 className="fwb-vip-title">Tính năng VIP {REQUIRED_VIP}+</h3>
            <p className="fwb-vip-desc">
              Bạn cần đạt <strong>VIP {REQUIRED_VIP} trở lên</strong> để kết nối!
            </p>
            <p className="muted-copy" style={{ textAlign: "center", marginTop: 0 }}>
              Liên hệ Admin để được hỗ trợ nâng cấp VIP và mở khóa Yêu thích & Nhắn tin với hàng nghìn FWB cùng khu vực.
            </p>
            <button
              className="fwb-gold-btn fwb-gold-btn-cta"
              onClick={openAdminFb}
            >
              <span className="fwb-gold-shine" />
              <Crown size={16} /> Liên hệ Admin nâng VIP
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

/** Lối tắt vào trang "Có thể bạn quen biết" — gọn, không chiếm diện tích. */
function SuggestedShortcut({ province }: { province: string | null }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      className="suggested-shortcut"
      onClick={() => navigate("/suggested")}
      aria-label="Mở trang gợi ý kết bạn"
    >
      <span className="suggested-shortcut-icon"><Users size={18} /></span>
      <span className="suggested-shortcut-body">
        <span className="suggested-shortcut-title">Có thể bạn quen biết</span>
        <span className="suggested-shortcut-sub">
          Khám phá người mới {province ? `tại ${province}` : "trên toàn quốc"}
        </span>
      </span>
      <ChevronRight size={18} className="suggested-shortcut-chev" />
    </button>
  );
}
