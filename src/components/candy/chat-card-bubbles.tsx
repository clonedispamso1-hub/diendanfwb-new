/** Hiển thị thẻ "Sao chép" và "QR" trong khung chat (phía user và admin). */
import { useEffect, useState } from "react";
import { Check, Clock, Copy, QrCode } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { formatCountdown } from "@/lib/vip-payment";
import { copyTextLines, parseQrPay, stripQrPayTokens, qrExpiresAt, serverClockOffset, type CopyTextLine, type CopyTextPayload, type QrPayPayload } from "@/lib/chat-cards";
import { Button } from "@/components/ui/button";

function useCopy() {
  const [done, setDone] = useState(false);
  const copy = async (v: string) => {
    let success = false;
    try { await navigator.clipboard.writeText(v); success = true; } catch {
      const ta = document.createElement("textarea");
      ta.value = v; document.body.appendChild(ta); ta.select();
      try { success = document.execCommand("copy"); } catch { /* ignore */ }
      ta.remove();
    }
    if (!success) return;
    setDone(true);
    setTimeout(() => setDone(false), 1400);
  };
  return { done, copy };
}

function CopyCardLine({ line }: { line: CopyTextLine }) {
  const { done, copy } = useCopy();
  return (
    <div className={`copy-card-row${line.kind === "note" ? " copy-card-note" : ""}`}>
      <span className="copy-card-text">
        {line.label?.trim() ? <><strong className="copy-card-label">{line.label.replace(/[:：]\s*$/, "")}:</strong>{" "}</> : null}
        {line.text || "\u00a0"}
      </span>
      {line.copyEnabled && line.text.trim() ? (
        <Button type="button" variant="chatCopy" size="unstyled" onClick={(e) => { e.stopPropagation(); void copy(line.text); }}
          aria-label={`Sao chép: ${line.text}`} title="Sao chép" onPointerDown={(e) => e.stopPropagation()}>
          {done ? <Check size={16} /> : <Copy size={16} />}
          <span aria-live="polite">{done ? "Đã chép" : "Sao chép"}</span>
        </Button>
      ) : null}
    </div>
  );
}

export function CopyTextBubble({ data }: { data: CopyTextPayload }) {
  return (
    <div className="copy-message-card">
      {data.title?.trim() ? <div className="copy-card-title">{data.title}</div> : null}
      {copyTextLines(data).map((line, index) => <CopyCardLine key={index} line={line} />)}
    </div>
  );
}

export function QrPayMessage({ content, createdAt }: { content?: string | null; createdAt?: string | null }) {
  const tokens = (content ?? "").match(/\[\[qrpay:[\s\S]*?\]\]/gi) ?? [];
  const cards = tokens.map(parseQrPay).filter((data): data is QrPayPayload => data !== null);
  const text = stripQrPayTokens(content).trim();
  return <div className="qr-message-stack">
    {text ? <div className="qr-message-text">{text}</div> : null}
    {cards.map((data, index) => <QrPayCard key={index} data={data} createdAt={createdAt} />)}
    {!cards.length ? <p className="qr-card-status" role="status">Không thể đọc mã QR thanh toán. Vui lòng nhờ admin gửi lại.</p> : null}
  </div>;
}

export function QrPayCard({ data, createdAt }: { data: QrPayPayload; createdAt?: string | null }) {
  const expiresAt = qrExpiresAt(data, createdAt);
  const [offset, setOffset] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (expiresAt === null) return;
    let on = true;
    serverClockOffset().then((o) => { if (on) setOffset(o); });
    return () => { on = false; };
  }, [expiresAt]);
  useEffect(() => {
    if (expiresAt === null) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [expiresAt]);
  const ready = expiresAt === null || offset !== null;
  const left = expiresAt === null ? null : Math.max(0, expiresAt - (now + (offset ?? 0)));
  const expired = left !== null && left <= 0;
  const [zoom, setZoom] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const title = data.title?.trim() || "Mã QR thanh toán";
  const fields = [["Ngân hàng", data.bankName], ["Số tài khoản", data.accountNumber], ["Chủ tài khoản", data.accountName], ["Nội dung chuyển khoản", data.transferContent]].filter(([, value]) => value);
  return (
    <div className="qr-payment-card">
      <div className="qr-card-heading"><QrCode size={18} /> <strong>{title}</strong></div>
      <div className="qr-card-image-frame">
        {ready && !expired && !imageFailed ? (
          <Button type="button" variant="ghost" size="unstyled" className="qr-zoom-trigger" aria-label="Phóng to mã QR" title="Phóng to mã QR"
            onClick={(e) => { e.stopPropagation(); setZoom(true); }}>
            <img src={data.qrUrl} alt={`Mã QR — ${title}`} className="qr-card-image" onError={() => setImageFailed(true)} />
          </Button>
        ) : (
          <div className="qr-card-status" role="status">
            {expired ? "Mã QR đã hết hiệu lực. Vui lòng không chuyển tiền theo mã này." : imageFailed ? "Không tải được ảnh QR. Vui lòng nhờ admin gửi lại." : "Đang tải…"}
          </div>
        )}
      </div>
      <Dialog open={zoom && !expired} onOpenChange={setZoom}>
        <DialogContent className="qr-payment-zoom" aria-describedby={undefined} onClick={(e) => e.stopPropagation()}>
          <DialogTitle className="qr-card-heading">{title}</DialogTitle>
          <img src={data.qrUrl} alt="Mã QR phóng to" className="qr-card-zoom-image" />
          {left !== null && <div className="qr-card-status">{formatCountdown(left)}</div>}
        </DialogContent>
      </Dialog>
      {fields.length ? <dl className="qr-bank-fields">{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl> : null}
      {left !== null && (
        <div className={`flex items-center justify-center gap-1.5 rounded-md py-1 text-sm font-mono font-semibold ${expired ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>
          <Clock size={14} /> {expired ? "Đã hết hạn" : formatCountdown(left)}
        </div>
      )}
      {data.notes.length > 0 && (
        <ul className="qr-card-notes">
          {data.notes.map((n, i) => <li key={i}>{n}</li>)}
        </ul>
      )}
    </div>
  );
}
