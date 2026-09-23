/**
 * CoinTransferBillCard — thẻ hoá đơn chuyển Xu hiển thị trong cuộc trò chuyện.
 * Thuần trình bày: mọi dữ liệu lấy từ payload đã đính kèm trong tin nhắn.
 */
import { useRef } from "react";
import { CheckCircle2, ArrowRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCandy } from "@/lib/format";
import { formatBillTime, type CoinBillPayload } from "@/lib/coin-transfer-bill";
import { getValidAvatarUrl, handleAvatarError } from "@/lib/avatar-utils";
import { CoinIcon } from "./coin-icon";

export function CoinTransferBillCard({ data, onOpen }: { data: CoinBillPayload; onOpen?: () => void }) {
  const pressRef = useRef<{ at: number; x: number; y: number; moved: boolean } | null>(null);
  const suppressClickRef = useRef(false);

  const interactive = typeof onOpen === "function";

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!interactive) return;
    event.stopPropagation();
    pressRef.current = {
      at: Date.now(),
      x: event.clientX,
      y: event.clientY,
      moved: false,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!interactive || !pressRef.current) return;
    if (
      Math.abs(event.clientX - pressRef.current.x) > 8 ||
      Math.abs(event.clientY - pressRef.current.y) > 8
    ) {
      pressRef.current.moved = true;
    }
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!interactive) return;
    event.stopPropagation();
    const press = pressRef.current;
    if (press && (Date.now() - press.at > 450 || press.moved)) {
      suppressClickRef.current = true;
    }
    pressRef.current = null;
  };

  const handlePointerCancel = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!interactive) return;
    event.stopPropagation();
    pressRef.current = null;
    suppressClickRef.current = true;
  };

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (!interactive || !onOpen) return;
    event.preventDefault();
    event.stopPropagation();
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    onOpen();
  };

  return (
    <button
      type="button"
      className="coin-bill-card"
      aria-label="Mở biên lai chuyển Xu"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onPointerLeave={handlePointerCancel}
      onContextMenu={(event) => {
        if (!interactive) return;
        event.preventDefault();
        event.stopPropagation();
        suppressClickRef.current = true;
      }}
      onClick={handleClick}
    >
      <div className="coin-bill-body">
        <div className="coin-bill-title">Biên lai chuyển Xu</div>

        <div className="coin-bill-parties">
          <Party name={data.senderName} avatar={data.senderAvatar} label="Người gửi" />
          <ArrowRight size={16} className="coin-bill-arrow" aria-hidden />
          <Party name={data.receiverName} avatar={data.receiverAvatar} label="Người nhận" />
        </div>

        <div className="coin-bill-amount">
          <CoinIcon size={20} />
          {formatCandy(data.amount)} Xu
        </div>

        <div className="coin-bill-rows">
          {data.note ? (
            <div className="coin-bill-row">
              <span className="coin-bill-row-label">Nội dung</span>
              <span className="coin-bill-row-value">{data.note}</span>
            </div>
          ) : null}
          <div className="coin-bill-row">
            <span className="coin-bill-row-label">Thời gian</span>
            <span className="coin-bill-row-value">{formatBillTime(data.at)}</span>
          </div>
          <div className="coin-bill-row">
            <span className="coin-bill-row-label">Mã GD</span>
            <span className="coin-bill-row-value coin-bill-row--mono">{data.code}</span>
          </div>
        </div>

        <div className="coin-bill-status">
          <CheckCircle2 size={13} aria-hidden />
          Giao dịch thành công
        </div>
      </div>
    </button>
  );
}

export function CoinTransferBillModal({
  data,
  onClose,
}: {
  data: CoinBillPayload;
  onClose: () => void;
}) {
  const note = data.note?.trim();

  return (
    <div
      className="coin-bill-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="coin-bill-modal-title"
      onClick={onClose}
    >
      <div className="coin-bill-modal" onClick={(event) => event.stopPropagation()}>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="coin-bill-modal-close"
          aria-label="Đóng biên lai"
          onClick={onClose}
        >
          <X size={18} aria-hidden />
        </Button>

        <div className="coin-bill-modal-head">
          <div className="coin-bill-modal-kicker">BIÊN LAI CHUYỂN XU</div>
          <div className="coin-bill-modal-amount">
            <CoinIcon size={30} />
            <span>{formatCandy(data.amount)} Xu</span>
          </div>
          <div className="coin-bill-modal-status">
            <CheckCircle2 size={16} aria-hidden />
            <span>{data.status === "success" ? "Giao dịch thành công" : data.status}</span>
          </div>
        </div>

        <div className="coin-bill-modal-parties" aria-label="Thông tin người chuyển và người nhận">
          <ReceiptPerson label="Người gửi" name={data.senderName} avatar={data.senderAvatar} />
          <div className="coin-bill-modal-route" aria-hidden>
            <ArrowRight size={18} />
          </div>
          <ReceiptPerson label="Người nhận" name={data.receiverName} avatar={data.receiverAvatar} />
        </div>

        <div className="coin-bill-modal-lines">
          <ReceiptLine label="Thời gian" value={formatBillTime(data.at)} />
          {note ? <ReceiptLine label="Nội dung" value={note} /> : null}
          <ReceiptLine label="Mã GD" value={data.code} mono />
        </div>
      </div>
    </div>
  );
}

function Party({ name, avatar, label }: { name: string; avatar?: string | null; label: string }) {
  return (
    <div className="coin-bill-party">
      <img
        src={getValidAvatarUrl(avatar)}
        onError={handleAvatarError}
        alt={name}
        className="coin-bill-avatar"
        loading="lazy"
      />
      <span className="coin-bill-party-label">{label}</span>
      <span className="coin-bill-party-name" title={name}>
        {name}
      </span>
    </div>
  );
}

function ReceiptPerson({ name, avatar, label }: { name: string; avatar?: string | null; label: string }) {
  return (
    <div className="coin-bill-modal-person">
      <img
        src={getValidAvatarUrl(avatar)}
        onError={handleAvatarError}
        alt={name}
        className="coin-bill-modal-avatar"
        loading="lazy"
      />
      <span className="coin-bill-modal-person-label">{label}</span>
      <span className="coin-bill-modal-person-name" title={name}>{name}</span>
    </div>
  );
}

function ReceiptLine({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="coin-bill-modal-line">
      <span className="coin-bill-modal-line-label">{label}</span>
      <span className={`coin-bill-modal-line-value${mono ? " is-mono" : ""}`}>{value}</span>
    </div>
  );
}
