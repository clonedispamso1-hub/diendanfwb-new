import { useEffect, useRef, useState } from "react";
import { ArrowLeft, BadgeCheck, Check, Copy, Crown, Facebook, Flag, Loader2, Mars, MessageCircle, Venus, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Portal } from "@/components/candy/portal";
import { VipUnlockModal } from "@/components/candy/vip-unlock-modal";
import { useAuth } from "@/components/candy/auth-provider";
import { useProfileQuery, profileQueryKey } from "@/hooks/use-profile-query";
import { useOverlayAutoClose, Z_LAYERS } from "@/lib/modal-manager";
import { getValidAvatarUrl, handleAvatarError } from "@/lib/avatar-utils";
import { deriveUid } from "@/lib/user-uid";
import { supabase } from "@/lib/supabase";
import { isVipProfile, useHasVipNameIcon, useIsVip, type VipProfileLike } from "@/lib/vip-status";
import { submitRewardReport } from "@/services/report-reward.service";
import "@/styles/profile-id-card.css";

/** Cột riêng cho thẻ ID — chỉ lấy đúng dữ liệu thẻ cần. */
export const PROFILE_ID_CARD_COLS =
  "id, display_name, full_name, username, avatar, vip_level, age, gender, public_id, facebook, zalo";

/** Chuẩn hoá link Facebook người dùng nhập (thiếu http:// vẫn mở được). */
function normalizeFacebookUrl(value?: string | null) {
  const v = String(value ?? "").trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  return `https://${v.replace(/^\/+/, "")}`;
}

interface ProfileIdCardPopupProps {
  userId: string | null;
  open: boolean;
  onClose: () => void;
}

function genderLabel(value?: string | null) {
  const v = String(value ?? "").toLowerCase().trim();
  if (v === "male") return "Nam";
  if (v === "female") return "Nữ";
  if (!v || v === "null" || v === "undefined" || v === "other") return "Chưa cập nhật";
  return v === "nam" ? "Nam" : v === "nữ" ? "Nữ" : "Khác";
}

function genderIcon(value?: string | null) {
  const v = String(value ?? "").toLowerCase().trim();
  if (v === "female" || v === "nữ") {
    return (
      <Venus
        size={14}
        aria-hidden
        style={{ color: "#ec4899", flex: "0 0 auto" }}
      />
    );
  }
  if (v === "male" || v === "nam") {
    return (
      <Mars
        size={14}
        aria-hidden
        style={{ color: "#3b82f6", flex: "0 0 auto" }}
      />
    );
  }
  return null;
}

export function ProfileIdCardPopup({ userId, open, onClose }: ProfileIdCardPopupProps) {
  useOverlayAutoClose(open, onClose, "profile-id-card");
  const { data: profile } = useProfileQuery(open ? userId : null, PROFILE_ID_CARD_COLS);
  const hasVipNameIcon = useHasVipNameIcon(open ? userId : null);
  const { me } = useAuth();
  const qc = useQueryClient();

  const [editContact, setEditContact] = useState<null | "facebook" | "zalo">(null);
  const [facebook, setFacebook] = useState("");
  const [zalo, setZalo] = useState("");
  const [saving, setSaving] = useState(false);
  const [vipOpen, setVipOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [view, setView] = useState<"profile" | "report">("profile");
  const [reportReason, setReportReason] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const meIsVip = useIsVip(me?.id ?? null);

  const fbInputRef = useRef<HTMLInputElement>(null);
  const zaloInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setEditContact(null);
      setCopied(false);
      setView("profile");
      setReportReason("");
      setReportSubmitting(false);
      return;
    }
    setFacebook(profile?.facebook ?? "");
    setZalo(profile?.zalo ?? "");
  }, [open, profile?.facebook, profile?.zalo]);

  useEffect(() => {
    if (editContact === "facebook") fbInputRef.current?.focus();
    else if (editContact === "zalo") zaloInputRef.current?.focus();
  }, [editContact]);

  if (!open || !userId) return null;

  const isOwner = !!me?.id && me.id === userId;
  const name =
    profile?.display_name || profile?.full_name || profile?.username || "Thành viên ZaLove";
  const avatar = getValidAvatarUrl(profile?.avatar);
  /**
   * VIP = trạng thái thật từ dữ liệu hồ sơ (vip_level / is_vip / hạn VIP) hoặc
   * icon VIP đã được gán cho tài khoản. KHÔNG suy ra từ chữ "VIP" trong tên.
   * Tài khoản VIP luôn ở trạng thái "đã xác minh".
   */
  const isVip = isVipProfile(profile as VipProfileLike) || hasVipNameIcon;
  const verified = isVip;
  const uid = profile?.public_id || deriveUid(userId);

  const save = async (payload: Record<string, unknown>) => {
    if (!isOwner || saving) return;
    setSaving(true);
    try {
      await supabase.from("profiles").update(payload as any).eq("id", userId);
      void qc.invalidateQueries({ queryKey: profileQueryKey(userId, PROFILE_ID_CARD_COLS) });
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async (type: "facebook" | "zalo") => {
    if (!isOwner || saving) return;
    const value = type === "facebook" ? facebook.trim() : zalo.trim();
    const current =
      type === "facebook"
        ? String(profile?.facebook ?? "")
        : String(profile?.zalo ?? "");
    if (value === current) return;
    await save({ [type]: value || null });
  };

  const toggleEdit = (type: "facebook" | "zalo") => {
    setEditContact((prev) => (prev === type ? null : type));
  };

  const fbUrl = normalizeFacebookUrl(profile?.facebook);
  const zaloPhone = String(profile?.zalo ?? "").trim();

  const openFacebook = () => {
    if (fbUrl) window.open(fbUrl, "_blank", "noopener,noreferrer");
  };

  const openZalo = () => {
    const phone = zaloPhone.replace(/[^\d+]/g, "");
    if (phone) window.open(`https://zalo.me/${phone}`, "_blank", "noopener,noreferrer");
  };

  /** Chưa VIP → chặn bằng popup VIP chung; đủ VIP → mở liên hệ tương ứng. */
  const handleContactClick = (type: "facebook" | "zalo") => {
    if (!meIsVip) {
      setVipOpen(true);
      return;
    }
    if (type === "facebook") openFacebook();
    else openZalo();
  };

  const copyUid = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(uid);
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = uid;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      } catch { /* bỏ qua */ }
    }
    setCopied(true);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopied(false), 1500);
  };

  const submitProfileReport = async () => {
    const reason = reportReason.trim();
    if (!me?.id) {
      toast.error("Bạn cần đăng nhập.");
      return;
    }
    if (!reason || reportSubmitting) return;
    setReportSubmitting(true);
    try {
      await submitRewardReport({
        reporterId: me.id,
        reporterName: (me as any).full_name || (me as any).username || null,
        targetUid: userId,
        targetName: name,
        targetAvatar: profile?.avatar ?? null,
        kind: "profile",
        reason,
      });
      toast.success("Đã gửi tố cáo! Admin sẽ xem xét nội dung của bạn.");
      onClose();
    } catch (error: any) {
      toast.error("Gửi tố cáo thất bại: " + (error?.message || "lỗi không xác định"));
    } finally {
      setReportSubmitting(false);
    }
  };


  return (
    <Portal>
      <div
        className="pidc-overlay"
        style={{ zIndex: Z_LAYERS.top }}
        role="dialog"
        aria-modal="true"
        aria-label="Thẻ hồ sơ thành viên"
        onClick={onClose}
      >
        <div className={`pidc-card${verified ? " pidc-card--vip" : ""}`} onClick={(e) => e.stopPropagation()}>
          <button type="button" className="pidc-close" onClick={onClose} aria-label="Đóng">
            <X size={16} strokeWidth={2.5} />
          </button>

          <div className="pidc-pattern" aria-hidden />

          <header className="pidc-head">
            <span className="pidc-kicker">
              {view === "report" ? (
                <>TỐ CÁO THÀNH VIÊN</>
              ) : isVip ? (
                <>
                  <Crown size={13} strokeWidth={2.5} aria-hidden className="pidc-crown" />
                  THẺ HỒ SƠ THÀNH VIÊN VIP
                </>
              ) : (
                "THẺ HỒ SƠ THÀNH VIÊN"
              )}
            </span>
          </header>

          {view === "profile" ? (
          <div className="pidc-body">
            <div className="pidc-photo">
              <img src={avatar} alt="" onError={handleAvatarError} />
              {isVip ? (
                <span className="pidc-photo__crown" aria-hidden>👑</span>
              ) : null}
            </div>

            <div className="pidc-fields">
              <h3 className="pidc-name">
                <span className="pidc-name-text">{name}</span>
                {isVip ? (
                  <span className="pidc-vip-pill">
                    <Crown size={11} strokeWidth={2.6} aria-hidden />
                    VIP
                  </span>
                ) : null}
                {verified ? (
                  <BadgeCheck size={16} className="pidc-verified" aria-label="Đã xác minh" />
                ) : null}
              </h3>

              <dl>
                <div className="pidc-row">
                  <dt>UID</dt>
                  <dd className="pidc-dd-action pidc-uid-line">
                    <span className="pidc-mono">{uid}</span>
                    <button
                      type="button"
                      className="pidc-copy-btn"
                      onClick={copyUid}
                      aria-label={copied ? "Đã sao chép UID" : "Sao chép UID"}
                      title={copied ? "Đã sao chép" : "Sao chép UID"}
                    >
                      {copied ? <Check size={12} strokeWidth={3} /> : <Copy size={12} />}
                    </button>
                  </dd>
                </div>
                <div className="pidc-row">
                  <dt>Giới tính</dt>
                  <dd>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                      {genderIcon(profile?.gender)}
                      {genderLabel(profile?.gender)}
                    </span>
                  </dd>
                </div>
                <div className="pidc-row">
                  <dt>Tuổi</dt>
                  <dd>{profile?.age ? `${profile.age} tuổi` : "Chưa cập nhật"}</dd>
                </div>
                <div className="pidc-row">
                  <dt>Xác minh</dt>
                  <dd>
                    {isVip ? (
                      <span className="pidc-verify-badge">
                        <BadgeCheck size={14} aria-hidden />
                        Đã xác minh
                      </span>
                    ) : (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                        <BadgeCheck size={14} aria-hidden style={{ color: "#9ca3af", flex: "0 0 auto" }} />
                        <span style={{ color: "#6b7280" }}>Chưa xác minh</span>
                      </span>
                    )}
                  </dd>
                </div>
              </dl>

              <div className="pidc-connect">
                <div
                  role="button"
                  tabIndex={0}
                  className={`pidc-social pidc-social--fb ${editContact === "facebook" ? "is-editing" : ""}`}
                  onClick={isOwner ? () => toggleEdit("facebook") : () => handleContactClick("facebook")}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" && e.key !== " ") return;
                    e.preventDefault();
                    if (isOwner) toggleEdit("facebook");
                    else handleContactClick("facebook");
                  }}
                >
                  <span className="pidc-social__icon" aria-hidden>
                    <Facebook size={18} fill="currentColor" />
                  </span>
                  <span className="pidc-social__label">Facebook</span>
                  {isOwner && (
                    <span
                      className="pidc-social__input-wrap"
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <input
                        ref={fbInputRef}
                        type="url"
                        placeholder="Link Facebook"
                        value={facebook}
                        onChange={(e) => setFacebook(e.target.value)}
                        onBlur={() => void handleSave("facebook")}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void handleSave("facebook");
                            setEditContact(null);
                          } else if (e.key === "Escape") {
                            e.preventDefault();
                            setEditContact(null);
                          }
                        }}
                      />
                    </span>
                  )}
                  <span className="pidc-social__btn">
                    {isOwner ? "Thêm" : "Kết bạn"}
                  </span>
                </div>

                <div
                  role="button"
                  tabIndex={0}
                  className={`pidc-social pidc-social--za ${editContact === "zalo" ? "is-editing" : ""}`}
                  onClick={isOwner ? () => toggleEdit("zalo") : () => handleContactClick("zalo")}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" && e.key !== " ") return;
                    e.preventDefault();
                    if (isOwner) toggleEdit("zalo");
                    else handleContactClick("zalo");
                  }}
                >
                  <span className="pidc-social__icon" aria-hidden>
                    <MessageCircle size={18} fill="currentColor" />
                  </span>
                  <span className="pidc-social__label">{zaloPhone || "Zalo"}</span>
                  {isOwner && (
                    <span
                      className="pidc-social__input-wrap"
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <input
                        ref={zaloInputRef}
                        type="tel"
                        inputMode="tel"
                        placeholder="Số Zalo"
                        value={zalo}
                        onChange={(e) => setZalo(e.target.value)}
                        onBlur={() => void handleSave("zalo")}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void handleSave("zalo");
                            setEditContact(null);
                          } else if (e.key === "Escape") {
                            e.preventDefault();
                            setEditContact(null);
                          }
                        }}
                      />
                    </span>
                  )}
                  <span className="pidc-social__btn">
                    {isOwner ? "Thêm" : "Kết bạn"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          ) : (
            <div className="pidc-report">
              <button
                type="button"
                className="pidc-report__back"
                onClick={() => setView("profile")}
              >
                <ArrowLeft size={15} aria-hidden />
                Quay lại
              </button>
              <div className="pidc-report__heading">
                <span className="pidc-report__flag" aria-hidden><Flag size={18} /></span>
                <div>
                  <span>Tố cáo</span>
                  <strong>{name}</strong>
                </div>
              </div>
              <label className="pidc-report__label" htmlFor="pidc-report-reason">
                Lý do tố cáo
              </label>
              <textarea
                id="pidc-report-reason"
                className="pidc-report__input"
                rows={5}
                maxLength={1000}
                value={reportReason}
                onChange={(event) => setReportReason(event.target.value)}
                placeholder="Nhập lý do tố cáo..."
                autoFocus
              />
              <button
                type="button"
                className="pidc-report__submit"
                disabled={!reportReason.trim() || reportSubmitting}
                onClick={() => void submitProfileReport()}
              >
                {reportSubmitting ? <Loader2 size={16} className="pidc-spin" aria-hidden /> : <Flag size={16} aria-hidden />}
                {reportSubmitting ? "Đang gửi…" : "Gửi tố cáo"}
              </button>
            </div>
          )}

          {view === "profile" && !isOwner ? (
            <div className="pidc-report-action-wrap">
              <button type="button" className="pidc-report-action" onClick={() => setView("report")}>
                <Flag size={14} aria-hidden />
                Tố cáo
              </button>
            </div>
          ) : null}

          {view === "profile" ? <footer className="pidc-foot">
            <span>Thẻ hư cấu trong ứng dụng — không có giá trị pháp lý</span>
          </footer> : null}
        </div>
      </div>
      <VipUnlockModal open={vipOpen} onClose={() => setVipOpen(false)} variant="zalo" />
    </Portal>
  );
}

export default ProfileIdCardPopup;
