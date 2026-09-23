import { useEffect, useState, type ReactNode } from "react";
import { ArrowRight, CalendarDays, Check, Crown, Gift, Infinity, MapPin, ScrollText, Sparkles, Users, WalletCards, X } from "lucide-react";
import { Portal } from "@/components/candy/portal";
import { ZaloIcon } from "@/components/candy/zalo-icon";
import { Button } from "@/components/ui/button";
import { listZaloMedia } from "@/lib/zalo-sub-items";
import type { FromCardPayload } from "@/lib/crm-from-card";

/** Cache 1 lần logo Zalo từ kho ảnh, dùng chung cho mọi Card CRM. */
let zaloLogoPromise: Promise<string | null> | null = null;
function fetchZaloLogoUrl(): Promise<string | null> {
  if (!zaloLogoPromise) {
    zaloLogoPromise = listZaloMedia()
      .then((list) => list.find((m) => m.kind === "zalo")?.url ?? null)
      .catch(() => null);
  }
  return zaloLogoPromise;
}

type GuideKind = "community" | "benefits" | "rules" | "fee";

const safeRegion = (value: string, fallback?: string) => {
  const region = String(value ?? "").trim();
  if (region && region !== "__global__" && region.toLowerCase() !== "global") return region;
  const customerRegion = String(fallback ?? "").trim();
  return customerRegion && customerRegion !== "__global__" ? customerRegion : "Khu vực của bạn";
};

function GuideLogo({ src }: { src?: string | null }) {
  return src ? <img src={src} alt="Logo Zalo" /> : null;
}

function GuideCard({
  kind,
  logo,
  ledTitle,
  content,
  cta,
  onOpen,
}: {
  kind: GuideKind;
  logo?: string | null;
  ledTitle: string;
  content: string;
  cta: string;
  onOpen: () => void;
}) {
  const Icon = kind === "community" ? Crown : kind === "benefits" ? Gift : kind === "rules" ? ScrollText : WalletCards;
  return (
    <article className={`crm-guide-card crm-guide-card--${kind}`}>
      <div className="crm-guide-card__watermark" aria-hidden><GuideLogo src={logo} /></div>
      <div className="crm-guide-card__main">
        <div className="crm-guide-card__logo">
          {logo ? <GuideLogo src={logo} /> : <ZaloIcon size={44} title="Logo Zalo" />}
        </div>
        <div className="crm-guide-card__copy">
          <span className="crm-guide-card__led"><Icon size={12} aria-hidden /> {ledTitle}</span>
          <strong>{content}</strong>
        </div>
      </div>
      <Button type="button" className="crm-guide-card__cta" onClick={onOpen}>
        {cta}<ArrowRight size={15} aria-hidden />
      </Button>
    </article>
  );
}

function GuideModal({ kind, title, eyebrow, region, onClose, children }: {
  kind: GuideKind;
  title: string;
  eyebrow: string;
  region: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const Icon = kind === "community" ? Crown : kind === "benefits" ? Gift : kind === "rules" ? ScrollText : WalletCards;
  return (
    <Portal>
      <div className="community-vip-overlay" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
        <section className={`crm-guide-modal crm-guide-modal--${kind}`} onClick={(event) => event.stopPropagation()}>
          <header className="crm-guide-modal__header">
            <div className="crm-guide-modal__heading">
              <div className="crm-guide-modal__mark" aria-hidden><Icon size={19} strokeWidth={1.8} /></div>
              <div className="crm-guide-modal__titles">
                <span>{eyebrow}</span>
                <h2>{title}</h2>
                {region ? <p><MapPin size={13} aria-hidden /> {region}</p> : null}
              </div>
            </div>
            <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Đóng"><X size={19} /></Button>
          </header>
          <div className="crm-guide-modal__scroll">{children}</div>
        </section>
      </div>
    </Portal>
  );
}

/** Popup thông báo giữa màn hình khi bấm “Vào” trên card Community VIP. */
function AdminInviteModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", closeOnEscape);
    const timer = window.setTimeout(onClose, 4000);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
      window.clearTimeout(timer);
    };
  }, [onClose]);

  return (
    <Portal>
      <div className="crm-admin-invite-overlay" role="dialog" aria-modal="true" aria-label="Thông báo" onClick={onClose}>
        <section className="crm-admin-invite-modal" onClick={(event) => event.stopPropagation()}>
          <button type="button" className="crm-admin-invite-modal__close" onClick={onClose} aria-label="Đóng">
            <X size={16} strokeWidth={2.5} />
          </button>
          <div className="crm-admin-invite-modal__icon" aria-hidden>
            <X size={28} strokeWidth={2.5} />
          </div>
          <h2>Bạn sẽ được Admin mời vào sau</h2>
          <p>Vui lòng chờ Admin liên hệ và hỗ trợ bạn.</p>
        </section>
      </div>
    </Portal>
  );
}

export function FromChatCard({ data, customerRegion }: { data: FromCardPayload; customerRegion?: string }) {
  const [open, setOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [fetchedLogo, setFetchedLogo] = useState<string | null>(null);
  const vip = data.vip;
  const benefits = (data.benefits ?? []).filter((item) => item.title || item.content);
  const rules = (data.rules ?? []).filter((item) => item.title || item.content);
  const region = safeRegion(data.region, customerRegion);
  const storedLogo = vip?.avatar_url ?? data.logo_url ?? null;
  const logo = storedLogo || fetchedLogo;
  const kind: GuideKind | null = vip?.groups?.length
    ? "community"
    : benefits.length
      ? "benefits"
      : rules.length
        ? "rules"
        : data.itemId === "phi"
          ? "fee"
          : null;

  useEffect(() => {
    if (storedLogo) return;
    let alive = true;
    fetchZaloLogoUrl().then((url) => {
      if (alive) setFetchedLogo(url);
    });
    return () => { alive = false; };
  }, [storedLogo]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  if (kind === "community" && vip) {
    return (
      <>
        <GuideCard kind={kind} logo={logo} ledTitle="CÁC NHÓM ZALO VIP" content={`Cộng Đồng VIP Zalo ${region}`} cta="Vào" onOpen={() => setOpen(true)} />
        {open ? (
          <GuideModal kind="community" eyebrow="CỘNG ĐỒNG VIP ZALO" title="CÁC NHÓM ZALO VIP" region={region} onClose={() => setOpen(false)}>
            {vip.intro ? <div className="crm-guide-detail crm-guide-detail--text"><p>{vip.intro}</p></div> : null}
            <div className="crm-guide-light-container crm-guide-light-container--community">
              <div className="crm-guide-groups">
                {vip.groups.map((group, index) => (
                  <article className="crm-guide-group" key={`${group.name}-${index}`}>
                    <div className="crm-guide-group__logo">{logo ? <GuideLogo src={logo} /> : <ZaloIcon size={40} title="Logo Zalo" />}</div>
                    <div>
                      <strong>{group.name}</strong>
                      <span><MapPin size={11} aria-hidden /> {group.district}</span>
                    </div>
                    <div className="crm-guide-group__stats">
                      <span><Users size={11} aria-hidden /> {group.members} thành viên</span>
                      <span>Nam {group.men}</span>
                      <span>Nữ {group.women}</span>
                      <span className="is-admin"><Crown size={11} aria-hidden /> {group.admins} Admin</span>
                    </div>
                    <Button
                      type="button"
                      className="crm-guide-group__cta"
                      onClick={(event) => {
                        event.stopPropagation();
                        setInviteOpen(true);
                      }}
                    >
                      Vào <ArrowRight size={14} aria-hidden />
                    </Button>
                  </article>
                ))}
              </div>
            </div>
            {vip.notes?.length ? vip.notes.map((note, index) => (
              <div className="crm-guide-detail crm-guide-detail--text" key={`note-${index}`}><p>{note}</p></div>
            )) : null}
          </GuideModal>
        ) : null}
        {inviteOpen ? <AdminInviteModal onClose={() => setInviteOpen(false)} /> : null}
      </>
    );
  }

  if (kind === "benefits") {
    return (
      <>
        <GuideCard kind={kind} logo={logo} ledTitle="QUYỀN LỢI KHI VÀO VIP ZALO" content={`Quyền Lợi Khi Vào VIP Zalo ${region}`} cta="Xem Quyền Lợi" onOpen={() => setOpen(true)} />
        {open ? <GuideModal kind="benefits" eyebrow="QUYỀN LỢI THÀNH VIÊN" title="QUYỀN LỢI KHI VÀO VIP ZALO" region={region} onClose={() => setOpen(false)}><div className="crm-guide-light-container crm-guide-light-container--benefits">{benefits.map((item, index) => <div className="crm-guide-detail" key={`${item.title}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><div className="crm-guide-detail__copy"><strong><Sparkles size={13} aria-hidden />{item.title || `Quyền lợi ${index + 1}`}</strong>{item.content ? <p>{item.content}</p> : null}</div></div>)}</div></GuideModal> : null}
      </>
    );
  }

  if (kind === "rules") {
    return (
      <>
        <GuideCard kind={kind} logo={logo} ledTitle="NỘI QUY" content={`Nội Quy Cộng Đồng ${region}`} cta="Xem Nội Quy" onOpen={() => setOpen(true)} />
        {open ? <GuideModal kind="rules" eyebrow="NỘI QUY THÀNH VIÊN" title="NỘI QUY CỘNG ĐỒNG" region={region} onClose={() => setOpen(false)}><div className="crm-guide-light-container crm-guide-light-container--rules">{rules.map((item, index) => <div className="crm-guide-detail" key={`${item.title}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><div className="crm-guide-detail__copy">{item.title ? <strong><ScrollText size={13} aria-hidden />{item.title}</strong> : null}{item.content ? <p>{item.content}</p> : null}</div></div>)}</div></GuideModal> : null}
      </>
    );
  }

  if (kind === "fee") {
    const fee = data.fee ?? {
      eight_months: data.text,
      lifetime: "",
      notes: [],
    };
    return (
      <>
        <GuideCard kind={kind} logo={logo} ledTitle="PHÍ VÀO CỘNG ĐỒNG" content={`PHÍ VÀO CỘNG ĐỒNG ZALO ${region}`} cta="Xem Chi Tiết Phí" onOpen={() => setOpen(true)} />
        {open ? (
          <GuideModal kind="fee" eyebrow="THÔNG TIN CHI PHÍ" title={`PHÍ VÀO CỘNG ĐỒNG ZALO ${region}`} region="" onClose={() => setOpen(false)}>
            <div className="crm-fee-detail">
              <section className="crm-fee-detail__tier crm-fee-detail__tier--eight">
                <div className="crm-fee-detail__icon" aria-hidden><CalendarDays size={20} strokeWidth={2} /></div>
                <div className="crm-fee-detail__copy">
                  <h3>PHÍ 8 THÁNG</h3>
                  <p>{fee.eight_months}</p>
                </div>
              </section>
              <section className="crm-fee-detail__tier crm-fee-detail__tier--lifetime">
                <div className="crm-fee-detail__icon" aria-hidden><Infinity size={21} strokeWidth={2} /></div>
                <div className="crm-fee-detail__copy">
                  <h3>PHÍ VĨNH VIỄN</h3>
                  <p>{fee.lifetime}</p>
                </div>
              </section>
              {fee.notes.length ? (
                <section className="crm-fee-detail__notes">
                  <h3>LƯU Ý</h3>
                  <div>{fee.notes.map((note, index) => <p key={`${note}-${index}`}><span aria-hidden><Check size={13} strokeWidth={2.5} /></span><span>{note}</span></p>)}</div>
                </section>
              ) : null}
            </div>
          </GuideModal>
        ) : null}
      </>
    );
  }

  return <div className="mgc-card"><div className="mgc-card-top"><span className="mgc-emoji" aria-hidden>{data.icon}</span><div className="mgc-card-text"><strong className="mgc-title">{data.title}</strong></div></div>{data.text.trim() ? <div className="mgc-subtitle">{data.text}</div> : null}</div>;
}

export default FromChatCard;