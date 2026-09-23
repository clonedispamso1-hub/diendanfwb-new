import { useMemo, useState } from "react";
import { Portal } from "@/components/candy/portal";
import { ArrowRight, BadgeCheck, Check, Loader2, MapPin, Sparkles, UserRound, X } from "lucide-react";
import { ProvinceCombobox } from "@/components/candy/province-combobox";
import { Button } from "@/components/ui/button";
import { districtsOf } from "@/lib/vn-districts";
import type { CrmChatCardPayload } from "@/lib/crm-chat-card";
import { supabase } from "@/lib/supabase";

interface CrmChatCardProps {
  data: CrmChatCardPayload;
  /** Người xem là người nhận card (khách hàng), không phải người gửi. */
  canOpen: boolean;
  fading?: boolean;
  onSubmitted: (cardId: string, info: { name: string; phone: string; region: string; district: string }) => void;
}

interface SubmittedInfo {
  name: string;
  phone: string;
  region: string;
  district: string;
}

export function CrmChatCard({ data, canOpen, fading, onSubmitted }: CrmChatCardProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [region, setRegion] = useState(data.location);
  const [district, setDistrict] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [localInfo, setLocalInfo] = useState<SubmittedInfo | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const districts = useMemo(() => districtsOf(region), [region]);

  // Trạng thái theo đúng card này: lấy từ dữ liệu card trong DB, hoặc từ lần submit vừa xong.
  const submittedInfo: SubmittedInfo | null = localInfo
    ?? (data.status === "submitted"
      ? {
          name: data.name ?? "",
          phone: data.phone ?? "",
          region: data.region ?? data.location,
          district: data.district ?? "",
        }
      : null);

  const submit = async () => {
    const cleanName = name.trim();
    const cleanPhone = phone.replace(/\D/g, "");
    if (cleanName.length < 2) return setError("Vui lòng nhập đúng tên Zalo.");
    if (cleanPhone.length !== 10) return setError("Số Zalo phải gồm đúng 10 chữ số.");
    if (!region) return setError("Vui lòng chọn khu vực.");
    if (!district) return setError("Vui lòng chọn Quận/Huyện.");

    setSaving(true);
    setError("");
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (sessionError || !token) throw new Error("Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.");
      const response = await fetch("/api/public/crm-card-submit", {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ cardId: data.cardId, name: cleanName, phone: cleanPhone, region, district }),
      });
      // Không bao giờ để response.json() ném lỗi (HTML 500/502, body rỗng…) làm vỡ flow.
      let result: { ok?: boolean; error?: string; duplicate?: boolean } = {};
      const raw = await response.text().catch(() => "");
      try { result = raw ? (JSON.parse(raw) as typeof result) : {}; } catch { result = {}; }
      if (!response.ok || !result.ok) {
        const fallback = response.status >= 500
          ? "Máy chủ đang bận, vui lòng thử lại sau."
          : "Không gửi được thông tin, vui lòng thử lại.";
        throw new Error(result.error || fallback);
      }
      const info: SubmittedInfo = { name: cleanName, phone: cleanPhone, region, district };
      setLocalInfo(info);
      setOpen(false);
      try { onSubmitted(data.cardId, info); } catch (cause) { console.error("[CrmChatCard] onSubmitted", cause); }
    } catch (cause) {
      console.error("[CrmChatCard] submit failed", cause);
      setError(cause instanceof Error && cause.message ? cause.message : "Không gửi được thông tin, vui lòng thử lại.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <article className={`crm-chat-card${fading ? " is-dissolving" : ""}`}>
        <div className="crm-chat-card__top">
          <span className="crm-chat-card__seal"><Sparkles size={16} /></span>
          <span>ZALO BẢO MẬT 100%</span>
        </div>
        <div className="crm-chat-card__body">
          <MapPin size={20} aria-hidden />
          <div>
            <small>VIP ZALO</small>
            <strong>Nhập thông tin vào VIP để Admin kết bạn</strong>
          </div>
        </div>
        {canOpen && submittedInfo ? (
          <Button type="button" className="crm-chat-card__done" onClick={() => setInfoOpen(true)}>
            ĐÃ NHẬP THÀNH CÔNG <BadgeCheck size={16} />
          </Button>
        ) : canOpen ? (
          <Button type="button" className="crm-chat-card__cta" onClick={() => setOpen(true)}>
            Nhập Thông Tin <ArrowRight size={15} />
          </Button>
        ) : (
          <div className="crm-chat-card__sent">
            {submittedInfo ? "Khách hàng đã nhập thông tin" : "Đã gửi tới khách hàng"}
          </div>
        )}
      </article>

      {infoOpen && submittedInfo ? (
        <Portal>
          <div className="crm-form-overlay" role="dialog" aria-modal="true" aria-label="Thông tin CRM đã nhập" onClick={() => setInfoOpen(false)}>
            <div className="crm-form-modal" onClick={(event) => event.stopPropagation()}>
              <div className="crm-form-handle" aria-hidden />
              <div className="crm-form-head">
                <span className="crm-form-mark"><BadgeCheck size={20} /></span>
                <div><small>ĐÃ NHẬP THÀNH CÔNG</small><h2>Thông tin bạn đã gửi</h2></div>
                <Button type="button" variant="ghost" size="icon" onClick={() => setInfoOpen(false)} aria-label="Đóng"><X size={18} /></Button>
              </div>
              <div className="crm-info-list">
                <div><small>Tên Zalo</small><strong>{submittedInfo.name || "—"}</strong></div>
                <div><small>Số Zalo</small><strong>{submittedInfo.phone || "—"}</strong></div>
                <div><small>Khu vực</small><strong>{submittedInfo.region || "—"}</strong></div>
                {submittedInfo.district ? <div><small>Quận/Huyện</small><strong>{submittedInfo.district}</strong></div> : null}
              </div>
              <p className="crm-info-note">Thông tin đã được gửi tới Admin, bạn không cần nhập lại.</p>
            </div>
          </div>
        </Portal>
      ) : null}

      {open ? (
        <Portal>
        <div className="crm-form-overlay" role="dialog" aria-modal="true" aria-label="Thông tin VIP Zalo" onClick={() => !saving && setOpen(false)}>
          <div className="crm-form-modal" onClick={(event) => event.stopPropagation()}>
            <div className="crm-form-handle" aria-hidden />
            <div className="crm-form-head">
              <span className="crm-form-mark"><UserRound size={20} /></span>
              <div><small>Thông tin đăng ký</small><h2>VIP Zalo {data.location}</h2></div>
              <Button type="button" variant="ghost" size="icon" onClick={() => setOpen(false)} disabled={saving} aria-label="Đóng"><X size={18} /></Button>
            </div>
            <div className="crm-form-fields">
              <label><span>Tên Zalo (chính chủ)</span><input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={80} placeholder="Nhập tên Zalo" /></label>
              <label><span>Số Zalo (chính chủ)</span><input value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))} inputMode="numeric" autoComplete="tel" placeholder="Nhập số Zalo" /></label>
              <label><span>Khu vực</span><ProvinceCombobox value={region} onChange={(value) => { setRegion(value); setDistrict(""); }} required /></label>
              <label><span>Quận/Huyện</span><select value={district} onChange={(e) => setDistrict(e.target.value)} disabled={!region}><option value="">Chọn Quận/Huyện</option>{districts.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
              {error ? <p className="crm-form-error" role="alert">{error}</p> : null}
            </div>
            <Button type="button" className="crm-form-submit" disabled={saving} onClick={() => void submit()}>
              {saving ? <><Loader2 size={17} className="animate-spin" /> Đang gửi…</> : <>Gửi thông tin <Check size={17} /></>}
            </Button>
          </div>
        </div>
              </Portal>
      ) : null}
    </>
  );
}
