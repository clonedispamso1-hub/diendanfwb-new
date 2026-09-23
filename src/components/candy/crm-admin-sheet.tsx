import { useState } from "react";
import { ArrowRight, Check, IdCard, Loader2, Search, Send, UserRound, X } from "lucide-react";
import { Portal } from "@/components/candy/portal";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";

interface CrmSearchResult {
  id: string;
  phone: string;
  region: string | null;
}

interface CrmCustomerInfo {
  name: string | null;
  phone: string;
  region: string | null;
}

interface CrmAdminSheetProps {
  open: boolean;
  onClose: () => void;
  onSend: () => void;
  onCustomerSelected: (region: string | null) => void;
  /** Số Zalo khách hàng đang chat đã submit qua chính card của họ (nếu có). */
  customerPhone?: string | null;
}

export function CrmAdminSheet({ open, onClose, onSend, onCustomerSelected, customerPhone }: CrmAdminSheetProps) {
  const [phone, setPhone] = useState("");
  const [result, setResult] = useState<CrmSearchResult | null>(null);
  const [message, setMessage] = useState("");
  const [searching, setSearching] = useState(false);
  const [info, setInfo] = useState<CrmCustomerInfo | null>(null);
  const [infoMessage, setInfoMessage] = useState("");
  const [infoLoading, setInfoLoading] = useState(false);

  const searchCustomer = async () => {
    const cleanPhone = phone.replace(/\D/g, "");
    if (cleanPhone.length !== 10) {
      setResult(null);
      setMessage("Số Zalo phải gồm đúng 10 chữ số.");
      return;
    }
    setSearching(true);
    setMessage("");
    const { data, error } = await supabase
      .from("crm_customers")
      .select("id, phone, region")
      .eq("phone", cleanPhone)
      .limit(1)
      .maybeSingle();
    setSearching(false);
    if (error) {
      setResult(null);
      setMessage("Không tìm được CRM, vui lòng thử lại.");
      return;
    }
    if (!data) {
      setResult(null);
      setMessage("Số Zalo chưa có trong CRM.");
      return;
    }
    setResult(data as CrmSearchResult);
  };

  /** Thông tin CRM của ĐÚNG khách hàng đang chat (tra theo số Zalo họ đã submit). */
  const loadCustomerInfo = async () => {
    setInfo(null);
    setInfoMessage("");
    const clean = (customerPhone || "").replace(/\D/g, "");
    if (clean.length !== 10) {
      setInfoMessage("Khách hàng chưa nhập thông tin CRM.");
      return;
    }
    setInfoLoading(true);
    try {
      const { data, error } = await supabase
        .from("crm_customers")
        .select("name, phone, region")
        .eq("phone", clean)
        .limit(1)
        .maybeSingle();
      if (error) {
        setInfoMessage("Không tải được thông tin CRM, vui lòng thử lại.");
        return;
      }
      if (!data) {
        setInfoMessage("Khách hàng chưa nhập thông tin CRM.");
        return;
      }
      setInfo(data as CrmCustomerInfo);
    } catch (cause) {
      console.error("[CrmAdminSheet] loadCustomerInfo", cause);
      setInfoMessage("Không tải được thông tin CRM, vui lòng thử lại.");
    } finally {
      setInfoLoading(false);
    }
  };

  if (!open) return null;
  return (
    <Portal>
    <div className="crm-admin-overlay" role="dialog" aria-modal="true" aria-label="CRM khách hàng" onClick={onClose}>
      <div className="crm-admin-sheet" onClick={(event) => event.stopPropagation()}>
        <div className="crm-form-handle" aria-hidden />
        <div className="crm-admin-head">
          <span><UserRound size={19} /></span>
          <div><small>CHĂM SÓC KHÁCH HÀNG</small><h2>CRM KHÁCH HÀNG</h2></div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Đóng"><X size={18} /></Button>
        </div>
        <div className="crm-admin-actions">
          <Button type="button" variant="ghost" onClick={onSend}><span className="crm-admin-action-icon"><Send size={18} /></span><span><strong>Gửi card</strong><small>Gửi lời mời VIP Zalo</small></span><ArrowRight size={16} /></Button>
          <Button type="button" variant="ghost" onClick={() => void loadCustomerInfo()} disabled={infoLoading}><span className="crm-admin-action-icon">{infoLoading ? <Loader2 size={18} className="animate-spin" /> : <IdCard size={18} />}</span><span><strong>Thông tin</strong><small>Xem CRM của khách đang chat</small></span><ArrowRight size={16} /></Button>
          {infoMessage ? <p className="crm-admin-search-message" role="status">{infoMessage}</p> : null}
          {info ? (
            <div className="crm-info-list">
              <div><small>Tên Zalo</small><strong>{info.name || "—"}</strong></div>
              <div><small>Số Zalo</small><strong>{info.phone}</strong></div>
              <div><small>Khu vực</small><strong>{info.region || "Chưa cập nhật"}</strong></div>
            </div>
          ) : null}
          <div className="crm-admin-search">
            <label htmlFor="crm-zalo-search">Nhập số Zalo để tìm kiếm</label>
            <div className="crm-admin-search-row">
              <input id="crm-zalo-search" value={phone} inputMode="numeric" maxLength={10} placeholder="Nhập đúng 10 chữ số" onChange={(event) => { setPhone(event.target.value.replace(/\D/g, "").slice(0, 10)); setResult(null); setMessage(""); }} onKeyDown={(event) => { if (event.key === "Enter") void searchCustomer(); }} />
              <Button type="button" size="icon" onClick={() => void searchCustomer()} disabled={searching} aria-label="Tìm số Zalo">{searching ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}</Button>
            </div>
            {message ? <p className="crm-admin-search-message" role="status">{message}</p> : null}
            {result ? (
              <div className="crm-admin-result">
                <div><small>Số Zalo</small><strong>{result.phone}</strong></div>
                <div><small>Khu vực</small><strong>{result.region || "Chưa cập nhật"}</strong></div>
                <Button type="button" onClick={() => onCustomerSelected(result.region)}><Check size={16} /> OK</Button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
    </Portal>
  );
}
