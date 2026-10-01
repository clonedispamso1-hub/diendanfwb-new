/** Tab 18 — ⚡ ALBUM HOT: danh sách Album Card công khai, click để mở Album Viewer. */
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, Play, X, ZoomIn, ZoomOut } from "lucide-react";
import { flashPublicListFn, flashViewFn, type FlashAlbum, type FlashMedia } from "@/lib/flash-albums.functions";
import { fetchFlashZalo } from "@/lib/flash-album-zalo";
import { openExternalLink } from "@/lib/external-link";
import { hotPublicFn, type HotBanner } from "@/lib/hot-content.functions";

function normalize(raw: string) {
  const compact = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return /^[A-Z]{3}[0-9]{3}$/.test(compact) ? `${compact.slice(0, 3)}-${compact.slice(3)}` : raw.trim().toUpperCase();
}

function countLabel(media: FlashMedia[]) {
  const img = media.filter((m) => m.kind === "image").length;
  const vid = media.filter((m) => m.kind === "video").length;
  return [img && `${img} ảnh`, vid && `${vid} video`].filter(Boolean).join(" • ") || "Chưa có media";
}

/** Video không có nút tải xuống / PiP; chặn menu chuột phải. */
function SafeVideo({ src, className, label }: { src: string; className?: string; label?: string }) {
  return (
    <video
      src={src}
      controls
      playsInline
      preload="metadata"
      controlsList="nodownload noremoteplayback noplaybackrate"
      disablePictureInPicture
      disableRemotePlayback
      onContextMenu={(e) => e.preventDefault()}
      className={className}
      aria-label={label}
    />
  );
}

export function FlashAlbumTab() {
  const [albums, setAlbums] = useState<FlashAlbum[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [listError, setListError] = useState(false);
  const [zaloLink, setZaloLink] = useState("");
  const [banner, setBanner] = useState<HotBanner | null>(null);
  const [inputOpen, setInputOpen] = useState(false);
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [activeCode, setActiveCode] = useState<string | null>(null);
  const [open, setOpen] = useState<FlashAlbum | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [zoom, setZoomRaw] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [gesturing, setGesturing] = useState(false);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const panRef = useRef({ x: 0, y: 0 });
  const moveRef = useRef<(d: -1 | 1) => void>(() => {});
  const openingId = useRef<string | null>(null);
  const lightboxRef = useRef<HTMLDivElement | null>(null);
  const zoomRef = useRef(1);
  const MIN_ZOOM = 1, MAX_ZOOM = 4;
  const clampPan = (x: number, y: number, z: number) => {
    const stage = stageRef.current, img = imgRef.current;
    if (!stage || !img || z <= 1) return { x: 0, y: 0 };
    const mx = Math.max(0, (img.offsetWidth * z - stage.clientWidth) / 2);
    const my = Math.max(0, (img.offsetHeight * z - stage.clientHeight) / 2);
    return { x: Math.min(mx, Math.max(-mx, x)), y: Math.min(my, Math.max(-my, y)) };
  };
  const applyView = (z: number, x: number, y: number) => {
    const nz = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
    const p = clampPan(x, y, nz);
    zoomRef.current = nz; panRef.current = p;
    setZoomRaw(nz); setPan(p);
  };
  const setZoom = (v: number | ((c: number) => number)) => {
    const next = typeof v === "function" ? v(zoomRef.current) : v;
    const k = next / zoomRef.current;
    applyView(next, panRef.current.x * k, panRef.current.y * k);
  };

  useEffect(() => {
    void fetchFlashZalo().then(setZaloLink);
    let alive = true;
    const refresh = () => {
      void flashPublicListFn().then((r) => {
        if (!alive) return;
        setAlbums(r.albums);
        setListError(!!r.error);
        setLoaded(true);
      }).catch(() => { if (alive) { setListError(true); setLoaded(true); } });
      void hotPublicFn().then((r) => { if (alive) setBanner(r.banner); }).catch(() => {});
    };
    refresh();
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    return () => { alive = false; window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, []);

  // Cử chỉ cảm ứng: 2 ngón zoom, 1 ngón kéo khi đã zoom, vuốt ngang để đổi ảnh khi 1×.
  useEffect(() => {
    if (lightboxIndex === null) return;
    const stage = stageRef.current;
    if (!stage) return;
    type G = { mode: "pan" | "pinch" | "swipe"; sx: number; sy: number; px: number; py: number; dist: number; z: number; mx: number; my: number };
    let g: G | null = null;
    const center = () => { const r = stage.getBoundingClientRect(); return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 }; };
    const start = (e: TouchEvent) => {
      const { x, y } = panRef.current;
      if (e.touches.length >= 2) {
        const [a, b] = [e.touches[0], e.touches[1]];
        const { cx, cy } = center();
        g = { mode: "pinch", sx: 0, sy: 0, px: x, py: y, dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1, z: zoomRef.current,
          mx: (a.clientX + b.clientX) / 2 - cx, my: (a.clientY + b.clientY) / 2 - cy };
        setGesturing(true);
      } else if (e.touches.length === 1) {
        const t = e.touches[0];
        g = { mode: zoomRef.current > 1 ? "pan" : "swipe", sx: t.clientX, sy: t.clientY, px: x, py: y, dist: 0, z: zoomRef.current, mx: 0, my: 0 };
        if (g.mode === "pan") setGesturing(true);
      }
    };
    const move = (e: TouchEvent) => {
      if (!g) return;
      e.preventDefault();
      if (g.mode === "pinch" && e.touches.length >= 2) {
        const [a, b] = [e.touches[0], e.touches[1]];
        const { cx, cy } = center();
        const nz = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, g.z * (Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) / g.dist)));
        const k = nz / g.z;
        const mx = (a.clientX + b.clientX) / 2 - cx, my = (a.clientY + b.clientY) / 2 - cy;
        applyView(nz, mx - (g.mx - g.px) * k, my - (g.my - g.py) * k);
      } else if (g.mode === "pan" && e.touches.length === 1) {
        const t = e.touches[0];
        applyView(zoomRef.current, g.px + t.clientX - g.sx, g.py + t.clientY - g.sy);
      }
    };
    const end = (e: TouchEvent) => {
      if (!g) return;
      if (g.mode === "swipe" && e.touches.length === 0) {
        const t = e.changedTouches[0];
        const dx = t.clientX - g.sx, dy = t.clientY - g.sy;
        if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.2) moveRef.current(dx < 0 ? 1 : -1);
      }
      if (e.touches.length === 1 && zoomRef.current > 1) {
        const t = e.touches[0];
        g = { mode: "pan", sx: t.clientX, sy: t.clientY, px: panRef.current.x, py: panRef.current.y, dist: 0, z: zoomRef.current, mx: 0, my: 0 };
        return;
      }
      if (e.touches.length === 0) {
        if (zoomRef.current < 1.05) applyView(1, 0, 0);
        g = null;
        setGesturing(false);
      } else if (g.mode === "pinch") g = null;
    };
    stage.addEventListener("touchstart", start, { passive: true });
    stage.addEventListener("touchmove", move, { passive: false });
    stage.addEventListener("touchend", end);
    stage.addEventListener("touchcancel", end);
    return () => {
      stage.removeEventListener("touchstart", start);
      stage.removeEventListener("touchmove", move);
      stage.removeEventListener("touchend", end);
      stage.removeEventListener("touchcancel", end);
    };
  }, [lightboxIndex]);

  // Khóa cứng viewport khi lightbox mở: body giữ vị trí scroll hiện tại,
  // mọi touch/wheel không tràn ra nội dung phía sau.
  useEffect(() => {
    if (lightboxIndex === null) return;
    const { body, documentElement } = document;
    const previous = {
      bodyOverflow: body.style.overflow,
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyLeft: body.style.left,
      bodyRight: body.style.right,
      bodyWidth: body.style.width,
      htmlOverflow: documentElement.style.overflow,
    };
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = `-${scrollX}px`;
    body.style.right = "0";
    body.style.width = "100%";
    documentElement.style.overflow = "hidden";
    body.classList.add("lightbox-open");

    const node = lightboxRef.current;
    // touchmove mặc định ở root là passive, nên chặn bằng listener native.
    const blockScroll = (event: TouchEvent) => {
      if (zoomRef.current === 1) event.preventDefault();
    };
    node?.addEventListener("touchmove", blockScroll, { passive: false });

    return () => {
      node?.removeEventListener("touchmove", blockScroll);
      body.style.overflow = previous.bodyOverflow;
      body.style.position = previous.bodyPosition;
      body.style.top = previous.bodyTop;
      body.style.left = previous.bodyLeft;
      body.style.right = previous.bodyRight;
      body.style.width = previous.bodyWidth;
      documentElement.style.overflow = previous.htmlOverflow;
      body.classList.remove("lightbox-open");
      window.scrollTo({ left: scrollX, top: scrollY });
    };
  }, [lightboxIndex]);


  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const normalized = normalize(code);
    const album = albums.find((a) => a.code.toUpperCase() === normalized);
    if (!album) { setErr("Code không hợp lệ"); return; }
    setErr("");
    setCode("");
    setInputOpen(false);
    setActiveCode(album.code);
    void openAlbum(album);
  };

  const openAlbum = async (album: FlashAlbum) => {
    if (openingId.current === album.id || open?.id === album.id) return;
    openingId.current = album.id;
    setOpen(album);
    if (album.legacy) { openingId.current = null; return; }
    try {
      const result = await flashViewFn({ data: { id: album.id } });
      if (!result.view_count) return;
      setAlbums((current) => current.map((item) => (item.id === album.id ? { ...item, view_count: result.view_count } : item)));
    } catch {
      // Viewer vẫn mở nếu bộ đếm tạm thời không phản hồi.
    } finally {
      openingId.current = null;
    }
  };

  const closeAlbum = () => {
    setLightboxIndex(null);
    setZoom(1);
    setOpen(null);
  };

  const moveLightbox = (direction: -1 | 1) => {
    if (!open || lightboxIndex === null) return;
    const imageCount = open.media.filter((media) => media.kind === "image").length;
    if (!imageCount) return;
    setZoom(1);
    setLightboxIndex((lightboxIndex + direction + imageCount) % imageCount);
  };

  moveRef.current = moveLightbox;

  const lightboxImages = open?.media.filter((media) => media.kind === "image") ?? [];
  const lightboxMedia = lightboxIndex !== null ? lightboxImages[lightboxIndex] : null;
  const zoomLabel = Math.abs(zoom - Math.round(zoom)) < 0.05 ? `${Math.round(zoom)}` : zoom.toFixed(1);

  return (
    <div className="page-flash-album mx-auto min-h-full w-full max-w-4xl px-4 pb-28 pt-5 sm:px-6">
      {!open && (
        <div className="flash-hot-tabs grid grid-cols-2 gap-3">
          <button
            type="button"
            className="flash-cta flash-cta--primary"
            onClick={() => {
              setErr("");
              setInputOpen(true);
            }}
          >
            Nhập Code
          </button>
          <button
            type="button"
            className="flash-cta flash-cta--secondary"
            disabled={!zaloLink}
            onClick={() => openExternalLink(zaloLink)}
          >
            Nhóm Zalo Lấy Code
          </button>
        </div>
      )}

      {!open && banner && <div className="flash-hot-banner mt-5 overflow-hidden rounded-lg border border-border">
        <img src={banner.image_url} alt="Banner HOT" className="block h-auto w-full object-contain" />
      </div>}

      {!open && <section className="flash-hot-list mt-7" aria-label="Danh sách Album HOT">
        <h2 className="mb-4 text-lg font-bold text-foreground">🔥 Danh sách Code</h2>
        {listError && <p className="text-sm text-destructive">Chưa tải được danh sách. Vui lòng thử lại sau.</p>}
        {!listError && loaded && !albums.length && <p className="text-sm text-muted-foreground">Chưa có Album nào.</p>}
        {!loaded && <p className="text-sm text-muted-foreground">Đang tải…</p>}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {albums.map((album) => {
            const cover = album.media.find((m) => m.id === album.cover_media_id && m.kind === "image") || album.media.find((m) => m.kind === "image");
            const firstVideo = album.media.find((m) => m.kind === "video");
            const highlight = activeCode === album.code ? "border-primary ring-2 ring-primary/50" : "border-border";
            return (
              <button
                key={album.id}
                type="button"
                data-album-code={album.code}
                className={`flash-album-card group w-full min-w-0 overflow-hidden rounded-lg border bg-card text-left shadow-md transition-[transform,border-color] duration-200 hover:border-primary/40 active:scale-[0.98] ${highlight}`}
                onClick={() => void openAlbum(album)}
              >
                <div className="relative aspect-[4/5] w-full overflow-hidden bg-muted">
                  {cover ? (
                    <img src={cover.url} alt={album.name} loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" />
                  ) : firstVideo ? (
                    // Chỉ lấy khung hình làm ảnh bìa: không controls, không phát, không nhận thao tác.
                    <video src={`${firstVideo.url}#t=0.1`} muted playsInline preload="metadata" tabIndex={-1} aria-hidden="true" className="pointer-events-none h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full place-items-center text-3xl" aria-hidden="true">⚡</div>
                  )}
                  {!cover && firstVideo && (
                    <span className="absolute inset-0 grid place-items-center" aria-hidden="true">
                      <span className="grid h-11 w-11 place-items-center rounded-full bg-background/80 text-foreground shadow"><Play className="h-5 w-5" /></span>
                    </span>
                  )}
                </div>
                <div className="space-y-1 p-3">
                  <div className="line-clamp-2 text-sm font-extrabold leading-5 text-primary">{album.name}</div>
                  <div className="break-all font-mono text-xs font-bold text-foreground">{album.code}</div>
                  <div className="text-xs font-semibold text-foreground/70">{countLabel(album.media)}</div>
                </div>
              </button>
            );
          })}
        </div>
      </section>}

      {inputOpen && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-foreground/55 p-4"
          onClick={() => setInputOpen(false)}
        >
          <form
            onSubmit={submit}
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-card p-5 shadow-xl"
          >
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
              <h3 className="truncate text-lg font-bold">Nhập mã album</h3>
              <button
                type="button"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-muted"
                onClick={() => setInputOpen(false)}
                aria-label="Đóng"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <input
              autoFocus
              value={code}
              onChange={(event) => {
                setCode(event.target.value.toUpperCase());
                setErr("");
              }}
              placeholder="ABC-123"
              maxLength={20}
              inputMode="text"
              className="w-full rounded-lg border border-border bg-background px-3 py-3 text-center font-mono text-xl tracking-widest outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
            {err && <p className="text-sm font-medium text-destructive">{err}</p>}
            <button
              type="submit"
              className="w-full rounded-lg bg-primary px-4 py-3 font-bold text-primary-foreground shadow-sm active:scale-[0.98]"
            >
              Mở album
            </button>
          </form>
        </div>
      )}

      {open && (() => {
        const images = open.media.filter((m) => m.kind === "image");
        const videos = open.media.filter((m) => m.kind === "video");
        return (
        <div className="fixed inset-x-0 bottom-[calc(var(--app-dock-h)+env(safe-area-inset-bottom,0px)+12px)] top-[calc(var(--app-header-h)+env(safe-area-inset-top,0px)+8px)] z-[80] grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] bg-background">
          <div className="border-b border-border bg-background/95 px-3 py-2 backdrop-blur">
            <div className="mx-auto max-w-5xl min-w-0 text-center">
              <h3 className="truncate text-base font-extrabold text-primary">{open.name}</h3>
              <div className="mt-0.5 text-xs font-semibold text-foreground/65"><span className="font-mono">{open.code}</span> · {countLabel(open.media)}</div>
            </div>
          </div>
          <div className="border-b border-border/70 bg-background px-3 py-2">
            <button type="button" className="mx-auto flex h-10 w-full max-w-5xl items-center gap-2 rounded-md px-1 text-sm font-bold text-primary active:opacity-70" onClick={closeAlbum}>
              <ArrowLeft className="h-5 w-5" />
              Quay lại
            </button>
          </div>
          <div className="min-h-0 space-y-3 overflow-y-auto overscroll-contain px-1 py-1 sm:px-3 sm:py-3">
            {images.length > 0 && (
              <div className="mx-auto grid w-full max-w-6xl grid-cols-3 gap-1 sm:grid-cols-4 sm:gap-2 md:grid-cols-5">
                {images.map((media, index) => (
                  <button key={media.id} type="button" className="aspect-square min-w-0 overflow-hidden bg-muted active:opacity-80" onClick={() => { setZoom(1); setLightboxIndex(index); }} aria-label={`Mở ảnh ${index + 1}`}>
                    <img src={media.url} alt={`${open.name} ${index + 1}`} loading="lazy" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
            {videos.length > 0 && (
              <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-2 sm:grid-cols-2">
                {videos.map((media, index) => (
                  <div key={media.id} className="min-w-0 overflow-hidden rounded-md bg-muted">
                    <SafeVideo src={media.url} className="block aspect-video w-full bg-foreground object-contain" label={`${open.name} video ${index + 1}`} />
                  </div>
                ))}
              </div>
            )}
            {!open.media.length && <p className="text-center text-sm text-muted-foreground">Album chưa có ảnh hoặc video.</p>}
          </div>
        </div>
        );
      })()}

      {lightboxMedia?.kind === "image" && lightboxIndex !== null && (
        <div
          ref={lightboxRef}
          className="fixed inset-0 z-[10000] grid grid-rows-[auto_minmax(0,1fr)_auto] overscroll-contain bg-foreground"
        >
          <div className="flex items-center justify-between p-3 text-background">
            <span className="text-sm font-semibold">
              {lightboxIndex + 1} / {lightboxImages.length}
            </span>
            <button
              type="button"
              className="grid h-11 w-11 place-items-center rounded-full bg-background/20"
              onClick={() => {
                setLightboxIndex(null);
                setZoom(1);
              }}
              aria-label="Đóng ảnh và quay lại lưới"
            >
              <X className="h-6 w-6" strokeWidth={2.5} />
            </button>
          </div>
          <div ref={stageRef} className="relative flex min-h-0 touch-none select-none items-center justify-center overflow-hidden overscroll-contain">
            {lightboxImages.length > 1 && (
              <button
                type="button"
                className="absolute left-2 z-10 grid h-11 w-11 place-items-center rounded-full bg-background/20 text-background"
                onClick={() => moveLightbox(-1)}
                aria-label="Ảnh trước"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
            )}
            <img
              src={lightboxMedia.url}
              alt={`${open?.name ?? "Album"} ${lightboxIndex + 1}`}
              ref={imgRef}
              draggable={false}
              className={`max-h-full max-w-full object-contain ${gesturing ? "" : "transition-transform duration-200"}`}
              style={{ transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`, transformOrigin: "center center", willChange: "transform" }}
              onDoubleClick={() => setZoom((current) => (current === 1 ? 2 : 1))}
            />
            {lightboxImages.length > 1 && (
              <button
                type="button"
                className="absolute right-2 z-10 grid h-11 w-11 place-items-center rounded-full bg-background/20 text-background"
                onClick={() => moveLightbox(1)}
                aria-label="Ảnh sau"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            )}
          </div>
          <div className="flex items-center justify-center gap-3 p-4 text-background">
            <button
              type="button"
              className="grid h-11 w-11 place-items-center rounded-full bg-background/20 disabled:opacity-40"
              disabled={zoom <= 1}
              onClick={() => setZoom((current) => Math.max(1, Math.ceil(current) - 1))}
              aria-label="Thu nhỏ"
            >
              <ZoomOut className="h-5 w-5" />
            </button>
            <span className="w-12 text-center text-sm font-semibold">{zoomLabel}×</span>
            <button
              type="button"
              className="grid h-11 w-11 place-items-center rounded-full bg-background/20 disabled:opacity-40"
              disabled={zoom >= 3}
              onClick={() => setZoom((current) => Math.min(3, Math.floor(current) + 1))}
              aria-label="Phóng to"
            >
              <ZoomIn className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
