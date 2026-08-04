"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Loader2, RotateCw, ZoomIn, ZoomOut } from "lucide-react";

/**
 * Circular avatar cropper (Facebook/Zalo-style).
 * - Circular viewport, drag to pan, slider to zoom, button to rotate.
 * - Outputs a square JPEG Blob (default 512px) containing only the cropped region.
 * - Pure UI: does not touch storage/api; caller receives the Blob and uploads.
 */
export interface AvatarCropperProps {
  file: File;
  onCancel: () => void;
  onConfirm: (blob: Blob) => void | Promise<void>;
  /** Output square size in px (default 512). */
  outputSize?: number;
  /** Viewport size in px (default 288). */
  viewportSize?: number;
  title?: string;
  hint?: string;
  cancelLabel?: string;
  confirmLabel?: string;
}

export function AvatarCropper({
  file,
  onCancel,
  onConfirm,
  outputSize = 512,
  viewportSize = 288,
  title = "Cắt ảnh đại diện",
  hint = "Kéo để di chuyển · trượt để phóng to · xoay nếu cần",
  cancelLabel = "Huỷ",
  confirmLabel = "Xong",
}: AvatarCropperProps) {
  const VIEW = viewportSize;
  const OUT = outputSize;
  const [src, setSrc] = useState<string>("");
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [scale, setScale] = useState(1);
  const [minScale, setMinScale] = useState(1);
  const [rotation, setRotation] = useState(0); // degrees, multiples of 90 in practice
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const dragRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const [busy, setBusy] = useState(false);

  // Load image and compute the minimum scale needed to fully cover the viewport.
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    const i = new Image();
    i.onload = () => {
      const rotated = rotation % 180 !== 0;
      const w = rotated ? i.height : i.width;
      const h = rotated ? i.width : i.height;
      const base = Math.max(VIEW / w, VIEW / h);
      setImg(i);
      setMinScale(base);
      setScale(base);
      setTx(0);
      setTy(0);
    };
    i.src = url;
    return () => URL.revokeObjectURL(url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  // Recompute min scale when rotation flips orientation.
  useEffect(() => {
    if (!img) return;
    const rotated = rotation % 180 !== 0;
    const w = rotated ? img.height : img.width;
    const h = rotated ? img.width : img.height;
    const base = Math.max(VIEW / w, VIEW / h);
    setMinScale(base);
    setScale((s) => Math.max(s, base));
    setTx(0);
    setTy(0);
  }, [rotation, img, VIEW]);

  const clamp = (s: number, x: number, y: number) => {
    if (!img) return { x, y };
    const rotated = rotation % 180 !== 0;
    const w = rotated ? img.height : img.width;
    const h = rotated ? img.width : img.height;
    const dispW = w * s;
    const dispH = h * s;
    const maxX = Math.max(0, (dispW - VIEW) / 2);
    const maxY = Math.max(0, (dispH - VIEW) / 2);
    return {
      x: Math.max(-maxX, Math.min(maxX, x)),
      y: Math.max(-maxY, Math.min(maxY, y)),
    };
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
    const clamped = Math.max(minScale, s);
    setScale(clamped);
    const next = clamp(clamped, tx, ty);
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
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      // The viewport shows the image rotated around its center and translated
      // by (tx, ty). Recreate that transform on a square OUT×OUT canvas.
      const s = (OUT / VIEW) * scale;
      ctx.translate(OUT / 2 + tx * (OUT / VIEW), OUT / 2 + ty * (OUT / VIEW));
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.scale(s, s);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);

      let quality = 0.9;
      let blob: Blob | null = null;
      for (let i = 0; i < 6; i++) {
        blob = await new Promise<Blob | null>((res) =>
          canvas.toBlob(res, "image/jpeg", quality),
        );
        if (!blob) break;
        if (blob.size / 1024 <= 250) break;
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
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-background p-5 shadow-2xl">
        <h3 className="text-center text-base font-semibold text-foreground">{title}</h3>
        <p className="mt-1 text-center text-xs text-muted-foreground">{hint}</p>

        <div className="mt-4 flex justify-center">
          <div
            className="relative touch-none overflow-hidden rounded-full bg-muted ring-2 ring-border"
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
                className="pointer-events-none absolute left-1/2 top-1/2 max-w-none select-none"
                style={{
                  width: img.width * scale,
                  height: img.height * scale,
                  transform: `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px)) rotate(${rotation}deg)`,
                  transformOrigin: "center center",
                }}
              />
            )}
            {/* subtle circular guide (already circular via overflow) */}
            <div className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-white/40" />
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <ZoomOut size={16} className="text-muted-foreground" />
          <input
            type="range"
            min={minScale}
            max={minScale * 4}
            step={0.01}
            value={scale}
            onChange={(e) => handleScale(parseFloat(e.target.value))}
            className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-muted accent-primary"
          />
          <ZoomIn size={16} className="text-muted-foreground" />
          <button
            type="button"
            onClick={() => setRotation((r) => (r + 90) % 360)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-foreground transition hover:bg-muted"
            aria-label="Xoay 90°"
            title="Xoay 90°"
          >
            <RotateCw size={14} />
          </button>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-full border border-border bg-card px-4 py-1.5 text-sm font-medium text-foreground transition hover:bg-muted disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => void confirm()}
            disabled={busy || !img}
            className="inline-flex items-center gap-1 rounded-full bg-foreground px-4 py-1.5 text-sm font-semibold text-background disabled:opacity-60"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : null}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default AvatarCropper;
