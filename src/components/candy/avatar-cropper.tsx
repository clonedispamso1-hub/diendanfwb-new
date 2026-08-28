import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Loader2 } from "lucide-react";

/* Avatar Cropper — circular viewport, drag-to-pan + zoom; outputs 512×512 JPEG blob. */
export function AvatarCropper({
  file,
  onConfirm,
  onCancel,
  title = "Cắt ảnh đại diện",
  hint = "Kéo để di chuyển · trượt để phóng to",
  cancelLabel = "Huỷ",
  confirmLabel = "Xong",
}: {
  file: File;
  onConfirm: (blob: Blob) => void | Promise<void>;
  onCancel: () => void;
  title?: string;
  hint?: string;
  cancelLabel?: string;
  confirmLabel?: string;
}) {
  const VIEW = 280;
  const OUT = 600;
  const [src, setSrc] = useState<string>("");
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [scale, setScale] = useState(1);
  const [minScale, setMinScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const dragRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    const i = new Image();
    i.onload = () => {
      const base = Math.max(VIEW / i.width, VIEW / i.height);
      setImg(i);
      setMinScale(base);
      setScale(base);
      setTx(0);
      setTy(0);
    };
    i.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const clamp = (s: number, x: number, y: number) => {
    if (!img) return { x, y };
    const dispW = img.width * s;
    const dispH = img.height * s;
    const maxX = Math.max(0, (dispW - VIEW) / 2);
    const maxY = Math.max(0, (dispH - VIEW) / 2);
    return { x: Math.max(-maxX, Math.min(maxX, x)), y: Math.max(-maxY, Math.min(maxY, y)) };
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, tx, ty };
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    const next = clamp(scale, dragRef.current.tx + dx, dragRef.current.ty + dy);
    setTx(next.x);
    setTy(next.y);
  };
  const onPointerUp = () => {
    dragRef.current = null;
  };

  const handleScale = (s: number) => {
    setScale(s);
    const next = clamp(s, tx, ty);
    setTx(next.x);
    setTy(next.y);
  };

  const confirm = async () => {
    if (!img || busy) return;
    setBusy(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = OUT;
      canvas.height = OUT;
      const ctx = canvas.getContext("2d")!;
      const srcW = VIEW / scale;
      const srcH = VIEW / scale;
      const srcX = img.width / 2 - (VIEW / 2 + tx) / scale;
      const srcY = img.height / 2 - (VIEW / 2 + ty) / scale;
      ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, OUT, OUT);
      let quality = 0.9;
      let blob: Blob | null = null;
      for (let i = 0; i < 6; i++) {
        blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", quality));
        if (!blob) break;
        if (blob.size / 1024 <= 200) break;
        quality -= 0.12;
        if (quality < 0.3) break;
      }
      if (!blob) throw new Error("crop failed");
      await onConfirm(blob);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="po-crop-overlay">
      <AvatarCropperStyles />
      <div className="po-crop-shell">
        <h3 className="po-crop-title">{title}</h3>
        <p className="po-crop-hint">{hint}</p>
        <div
          className="po-crop-viewport"
          style={{ width: VIEW, height: VIEW }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {src && img && (
            <img loading="lazy" decoding="async"
              src={src}
              alt=""
              draggable={false}
              className="po-crop-img"
              style={{
                width: img.width * scale,
                height: img.height * scale,
                transform: `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px))`,
              }}
            />
          )}
          <div className="po-crop-mask" />
        </div>
        <input
          type="range"
          min={minScale}
          max={minScale * 4}
          step={0.01}
          value={scale}
          onChange={(e) => handleScale(parseFloat(e.target.value))}
          className="po-crop-zoom"
        />
        <div className="po-crop-actions">
          <button type="button" className="po-btn-ghost" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button type="button" className="po-btn-primary" onClick={confirm} disabled={busy}>
            {busy ? <Loader2 className="po-spin" size={16} /> : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function AvatarCropperStyles() {
  return (
    <style>{`
    .po-crop-overlay { position: fixed; inset: 0; z-index: 10000; background: rgba(7,7,11,0.85); backdrop-filter: blur(14px); display: flex; align-items: center; justify-content: center; padding: 20px; }
    .po-crop-shell { width: 100%; max-width: 360px; background: linear-gradient(180deg, rgba(20,18,30,0.95), rgba(10,9,16,0.98)); border: 1px solid rgba(168,85,247,0.3); border-radius: 22px; padding: 22px; display: flex; flex-direction: column; align-items: center; gap: 14px; box-shadow: 0 30px 80px rgba(168,85,247,0.25); color: #f5f5f7; }
    .po-crop-title { margin: 0; font-size: 18px; font-weight: 700; color: #fff; }
    .po-crop-hint { margin: 0; font-size: 12px; color: rgba(255,255,255,0.55); }
    .po-crop-viewport { position: relative; border-radius: 50%; overflow: hidden; background: #000; touch-action: none; user-select: none; cursor: grab; box-shadow: 0 0 0 2px rgba(168,85,247,0.45), 0 0 40px rgba(168,85,247,0.35); }
    .po-crop-viewport:active { cursor: grabbing; }
    .po-crop-img { position: absolute; top: 50%; left: 50%; max-width: none; pointer-events: none; }
    .po-crop-mask { position: absolute; inset: 0; border-radius: 50%; box-shadow: 0 0 0 9999px rgba(0,0,0,0.45); pointer-events: none; }
    .po-crop-zoom { width: 100%; accent-color: #a855f7; }
    .po-crop-actions { display: flex; gap: 10px; width: 100%; justify-content: space-between; }
    .po-btn-ghost { display: inline-flex; align-items: center; gap: 4px; padding: 12px 18px; background: transparent; border: 1px solid rgba(255,255,255,0.12); border-radius: 12px; color: rgba(255,255,255,0.8); font-size: 14px; cursor: pointer; }
    .po-btn-primary { display: inline-flex; align-items: center; gap: 4px; padding: 12px 22px; background: linear-gradient(135deg, #a855f7, #7c3aed); border: none; border-radius: 12px; color: #fff; font-size: 14px; font-weight: 600; cursor: pointer; box-shadow: 0 8px 24px rgba(168,85,247,0.4); transition: all .2s; margin-left: auto; }
    .po-btn-primary:disabled { opacity: 0.4; cursor: not-allowed; box-shadow: none; }
    .po-spin { animation: po-spin 1s linear infinite; }
    @keyframes po-spin { to { transform: rotate(360deg); } }
    `}</style>
  );
}
