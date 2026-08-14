import { avatarSrc } from "@/lib/image-cdn";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Smile, Hash, Image as ImageIcon, X, Play, Sparkles, Mic, MapPin, Video } from "lucide-react";
import { toUserMessage } from "@/lib/user-error";
import { toast } from "sonner";
import { GifPicker } from "@/components/candy/gif-picker";
import { countGifTokens, gifToken } from "@/lib/rich-content";
import { useAuth } from "@/components/candy/auth-provider";
import { Switch } from "@/components/ui/switch";
import { createPostCompat } from "@/lib/db-compat";
import { normalizeFacebookUrl, normalizeZaloPhone } from "@/lib/contact-validation";
import { VoiceRecorder } from "@/components/candy/voice-recorder";
import { ZaloVipLockModal } from "@/components/candy/zalo-vip-lock-modal";
import { canSendVoice, uploadVoiceBlob, voiceToken, voiceVipLockMessage, hasVoiceToken } from "@/lib/voice-chat";


interface CreatePostViewProps {
  open: boolean;
  onClose: () => void;
  onPosted?: () => void;
}

const EMOJI_SET = [
  "😀","😁","😂","🤣","😅","😊","😍","🥰","😘","😎",
  "🤩","🥳","😋","😜","🤔","🤗","😴","😭","😡","🥺",
  "😱","🤯","🤤","🤭","🫶","👍","👎","👏","🙏","💪",
  "❤️","🧡","💛","💚","💙","💜","🖤","🤍","💖","💔",
  "🔥","✨","🌟","⚡","🎉","🎁","🌹","🌸","🍀","🌈",
  "☕","🍺","🍻","🍕","🍔","🍰","🎂","🍎","🍓","🍑",
];

const HASHTAG_SUGGESTIONS = [
  { tag: "nguoimoi", views: 213009.7 },
  { tag: "xuhuong", views: 64995.0 },
  { tag: "tamtrang", views: 45120.3 },
  { tag: "tinhyeu", views: 38217.9 },
  { tag: "fwb", views: 29144.1 },
  { tag: "doctha", views: 22107.4 },
  { tag: "saigon", views: 19880.6 },
  { tag: "hanoi", views: 17221.5 },
  { tag: "danang", views: 12044.0 },
  { tag: "lgbt", views: 9881.2 },
  { tag: "hentho", views: 8120.7 },
  { tag: "review", views: 6420.0 },
];

const MAX_CHARS = 500;

const ToolBtn = memo(function ToolBtn({
  label,
  tone,
  active,
  title,
  onClick,
  btnRef,
  children,
}: {
  label: string;
  tone: string;
  active?: boolean;
  title?: string;
  onClick: () => void;
  btnRef?: React.RefObject<HTMLButtonElement | null>;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      ref={btnRef as any}
      className={`cpv-tool2 cpv-tool2--${tone}${active ? " is-active" : ""}`}
      onClick={onClick}
      title={title ?? label}
      aria-label={label}
    >
      <span className="cpv-tool2__icon">{children}</span>
      <span className="cpv-tool2__label">{label}</span>
    </button>
  );
});


type Panel = null | "emoji" | "hashtag" | "media" | "gif";
type Album = "all" | "photo" | "video";

type LocalMedia = {
  id: string;
  url: string;
  type: "photo" | "video";
  duration?: string;
};

function makeMockLibrary(): LocalMedia[] {
  const photos: LocalMedia[] = Array.from({ length: 18 }).map((_, i) => ({
    id: `p${i}`,
    type: "photo",
    url: `https://picsum.photos/seed/cp${i}/300/300`,
  }));
  const videos: LocalMedia[] = Array.from({ length: 6 }).map((_, i) => ({
    id: `v${i}`,
    type: "video",
    url: `https://picsum.photos/seed/cv${i}/300/300`,
    duration: `${String(Math.floor(Math.random() * 2)).padStart(1, "0")}:${String(
      10 + Math.floor(Math.random() * 49)
    ).padStart(2, "0")}`,
  }));
  const out: LocalMedia[] = [];
  for (let i = 0; i < photos.length; i++) {
    out.push(photos[i]);
    if (i % 3 === 0 && videos.length) out.push(videos.shift()!);
  }
  return out;
}

export function CreatePostView({ open, onClose, onPosted }: CreatePostViewProps) {
  const { me } = useAuth();
  const [content, setContent] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [album, setAlbum] = useState<Album>("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [facebookUrl, setFacebookUrl] = useState<string | null>(null);
  const [zaloUrl, setZaloUrl] = useState<string | null>(null);
  const [linkDialog, setLinkDialog] = useState<null | "facebook" | "zalo">(null);
  const [linkDraft, setLinkDraft] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const gifBtnRef = useRef<HTMLButtonElement>(null);
  const [recording, setRecording] = useState(false);
  const [voiceUploading, setVoiceUploading] = useState(false);
  const [voiceLocked, setVoiceLocked] = useState(false);
  const library = useMemo(() => makeMockLibrary(), [open]);

  useEffect(() => {
    if (!open) {
      setContent("");
      setAnonymous(false);
      setPanel(null);
      setAlbum("all");
      setSelected([]);
      setRecording(false);
      setVoiceUploading(false);
      setVoiceLocked(false);
      setFacebookUrl(null);
      setZaloUrl(null);
      setLinkDialog(null);
      setLinkDraft("");
      return;
    }
    // Pre-fill FB/Zalo from profile defaults when composer opens.
    const pf: any = (me as any)?.profile ?? me ?? {};
    if (pf?.facebook) setFacebookUrl(pf.facebook);
    if (pf?.zalo) setZaloUrl(pf.zalo);
    document.body.classList.add("modal-open");
    return () => document.body.classList.remove("modal-open");
  }, [open, me]);

  useEffect(() => {
    if (open) setTimeout(() => textareaRef.current?.focus(), 220);
  }, [open]);

  useEffect(() => {
    if (linkDialog === "facebook") setLinkDraft(facebookUrl ?? "");
    else if (linkDialog === "zalo") setLinkDraft(zaloUrl ?? "");
    setLinkError(null);
  }, [linkDialog, facebookUrl, zaloUrl]);

  const openFacebookDialog = () => setLinkDialog("facebook");
  const openZaloDialog = () => setLinkDialog("zalo");

  const saveLink = () => {
    const v = linkDraft.trim();
    if (linkDialog === "facebook") {
      if (!v) { setFacebookUrl(null); setLinkError(null); setLinkDialog(null); return; }
      const fb = normalizeFacebookUrl(v);
      if (!fb) { setLinkError("Liên kết Facebook không hợp lệ (vd: https://facebook.com/ten-cua-ban)"); return; }
      setFacebookUrl(fb);
    }
    if (linkDialog === "zalo") {
      if (!v) { setZaloUrl(null); setLinkError(null); setLinkDialog(null); return; }
      const phone = normalizeZaloPhone(v);
      if (!phone) { setLinkError("Số điện thoại Zalo không hợp lệ (vd: 0912345678)"); return; }
      setZaloUrl(phone);
    }
    setLinkError(null);
    setLinkDialog(null);
  };
  const clearLink = () => {
    if (linkDialog === "facebook") setFacebookUrl(null);
    if (linkDialog === "zalo") setZaloUrl(null);
    setLinkError(null);
    setLinkDialog(null);
  };



  const insertAtCursor = (text: string) => {
    const el = textareaRef.current;
    if (!el) {
      setContent((c) => c + text);
      return;
    }
    const start = el.selectionStart ?? content.length;
    const end = el.selectionEnd ?? content.length;
    const next = content.slice(0, start) + text + content.slice(end);
    setContent(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + text.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const onContentChange = (v: string) => {
    setContent(v);
    const el = textareaRef.current;
    if (!el) return;
    const pos = el.selectionStart ?? v.length;
    const lastHash = v.lastIndexOf("#", Math.max(0, pos - 1));
    if (lastHash >= 0) {
      const between = v.slice(lastHash + 1, pos);
      if (!/\s/.test(between) && between.length <= 24) {
        setPanel("hashtag");
        return;
      }
    }
    if (panel === "hashtag") setPanel(null);
  };

  const hasGif = countGifTokens(content) > 0;
  const stripGifTokens = (t: string) => t.replace(/\[\[gif:[^\]\s]+\]\]/g, "").trim();

  const filteredLibrary = library.filter((m) =>
    album === "all" ? true : album === "photo" ? m.type === "photo" : m.type === "video"
  );

  const handleSubmit = async () => {
    if (submitting) return;
    if (!content.trim() && selected.length === 0) {
      toast.error("Hãy nhập nội dung hoặc chọn ảnh/video");
      return;
    }
    if (!me?.id) {
      toast.error("Bạn cần đăng nhập");
      return;
    }

    if (countGifTokens(content) > 0 && selected.length > 0) {
      toast.error("Không thể thêm ảnh vào bài viết GIF.");
      return;
    }

    setSubmitting(true);
    try {
      const mediaUrls = selected
        .map((id) => library.find((m) => m.id === id)?.url)
        .filter(Boolean) as string[];
      await createPostCompat(me.id, content.trim(), mediaUrls[0] ?? null, {
        imageUrls: mediaUrls.length ? mediaUrls : null,
        visibility: "home",
        status: "published",
        category: "general",
        isAnonymous: anonymous,
        facebookUrl: facebookUrl || null,
        zaloUrl: zaloUrl || null,
      });

      toast.success("Đã đăng thành công");
      onPosted?.();
      onClose();
    } catch (e: any) {
      toast.error(toUserMessage(e, "Không đăng được bài, vui lòng thử lại."));
    } finally {
      setSubmitting(false);
    }
  };

  const profileAny: any = (me as any)?.profile ?? me ?? {};
  const displayName =
    profileAny.display_name || profileAny.full_name || profileAny.username || "Bạn";
  const avatarUrl = profileAny.avatar_url || profileAny.avatar || null;
  const province = profileAny.province || profileAny.location || null;
  const remaining = Math.max(0, MAX_CHARS - content.length);

  if (!open) return null;

  return (
    <>
      {(
        <div className="create-post-view cpv-v2 cpv-instant">
          <header className="cpv-header">
            <button className="cpv-cancel" onClick={onClose}>
              Hủy
            </button>
            <span className="cpv-title" aria-hidden />
            <button
              className="cpv-post-btn"
              onClick={() => void handleSubmit()}
              disabled={submitting}
            >
              {submitting ? "Đang đăng…" : "Đăng"}
            </button>
          </header>

          <div className="cpv-body">
            <div className="cpv-author">
              <div className="cpv-avatar">
                {avatarUrl ? (
                  <img src={avatarSrc(avatarUrl, 64)} alt="" loading="lazy" decoding="async" />
                ) : (
                  <span>{String(displayName).slice(0, 1).toUpperCase()}</span>
                )}
              </div>
              <div className="cpv-author-meta">
                <div className="cpv-author-name">{displayName}</div>
                {province ? (
                  <div className="cpv-author-loc">
                    <MapPin size={12} /> {province}
                  </div>
                ) : null}
              </div>
              <div className="cpv-anon-inline">
                <span>Ẩn danh</span>
                <Switch checked={anonymous} onCheckedChange={setAnonymous} />
              </div>
            </div>

            <textarea
              ref={textareaRef}
              className="cpv-textarea"
              placeholder="Hôm nay bạn muốn chia sẻ điều gì?"
              value={content}
              onChange={(e) => onContentChange(e.target.value)}
            />

            {hasGif && (
              <div className="cpv-gif-badge">
                <span>Đang tạo bài viết GIF</span>
                <button
                  type="button"
                  onClick={() => onContentChange(stripGifTokens(content))}
                  aria-label="Xoá GIF"
                >
                  <X size={12} />
                </button>
              </div>
            )}

            {selected.length > 0 && (
              <div className={`cpv-selected-grid${selected.length === 1 ? " is-single" : ""}`}>
                {selected.map((id) => {
                  const m = library.find((x) => x.id === id);
                  if (!m) return null;
                  return (
                    <div key={id} className="cpv-selected-item">
                      <img loading="lazy" decoding="async" src={m.url} alt="" />
                      {m.type === "video" && (
                        <span className="cpv-video-badge"><Play size={10} /> {m.duration}</span>
                      )}
                      <button
                        className="cpv-remove"
                        onClick={() => setSelected((s) => s.filter((x) => x !== id))}
                        aria-label="Xoá ảnh"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>


          <>
            {panel === "emoji" && (
              <div
                className="cpv-panel"
              >
                <div className="cpv-panel-head">
                  <span>Toàn bộ emoji</span>
                  <button onClick={() => setPanel(null)} className="cpv-icon-btn" aria-label="Đóng">
                    <X size={16} />
                  </button>
                </div>
                <div className="cpv-emoji-grid">
                  {EMOJI_SET.map((e) => (
                    <button key={e} className="cpv-emoji" onClick={() => insertAtCursor(e)}>
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {panel === "hashtag" && (
              <div
                className="cpv-panel"
              >
                <div className="cpv-panel-head">
                  <span>Hashtag gợi ý</span>
                  <button onClick={() => setPanel(null)} className="cpv-icon-btn" aria-label="Đóng">
                    <X size={16} />
                  </button>
                </div>
                <div className="cpv-hashtag-list">
                  {HASHTAG_SUGGESTIONS.map((h) => (
                    <button
                      key={h.tag}
                      className="cpv-hashtag-row"
                      onClick={() => {
                        insertAtCursor(content.endsWith("#") ? `${h.tag} ` : `#${h.tag} `);
                        setPanel(null);
                      }}
                    >
                      <div className="cpv-hashtag-name">#{h.tag}</div>
                      <div className="cpv-hashtag-meta">{h.views.toFixed(1)}k lượt xem</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {panel === "media" && (
              <div
                className="cpv-panel cpv-panel-tall"
              >
                <div className="cpv-panel-head">
                  <span>Thư viện</span>
                  <button onClick={() => setPanel(null)} className="cpv-icon-btn" aria-label="Đóng">
                    <X size={16} />
                  </button>
                </div>
                <div className="cpv-album-tabs">
                  {([
                    ["all", "Toàn bộ"],
                    ["photo", "Ảnh"],
                    ["video", "Video"],
                  ] as [Album, string][]).map(([k, label]) => (
                    <button
                      key={k}
                      className={`cpv-album-tab${album === k ? " is-active" : ""}`}
                      onClick={() => setAlbum(k)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="cpv-media-grid">
                  {filteredLibrary.map((m) => {
                    const isOn = selected.includes(m.id);
                    return (
                      <button
                        key={m.id}
                        className={`cpv-media-item${isOn ? " is-selected" : ""}`}
                        onClick={() => {
                          if (!isOn && hasGif) {
                            toast.error("Không thể thêm ảnh vào bài viết GIF.");
                            return;
                          }
                          setSelected((s) =>
                            s.includes(m.id) ? s.filter((x) => x !== m.id) : [...s, m.id]
                          );
                        }}

                      >
                        <img loading="lazy" decoding="async" src={m.url} alt="" />
                        {m.type === "video" && (
                          <span className="cpv-video-badge"><Play size={10} /> {m.duration}</span>
                        )}
                        {isOn && <span className="cpv-check">{selected.indexOf(m.id) + 1}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </>

          {recording ? (
            <div className="cpv-voice-row">
              <VoiceRecorder
                compact
                sending={voiceUploading}
                onCancel={() => setRecording(false)}
                onSend={async (blob, duration) => {
                  if (!me) return;
                  // VIP chỉ được kiểm tra tại bước Gửi; không đạt → huỷ, không upload.
                  if (!canSendVoice(me)) {
                    setRecording(false);
                    setVoiceLocked(true);
                    return;
                  }
                  setVoiceUploading(true);
                  try {
                    const path = await uploadVoiceBlob(me.id, blob);
                    insertAtCursor(voiceToken(path, duration));
                    setRecording(false);
                  } catch (e: any) {
                    toast.error(toUserMessage(e));
                  } finally {
                    setVoiceUploading(false);
                  }
                }}
              />
            </div>
          ) : null}

          <ZaloVipLockModal
            open={voiceLocked}
            title="Tin nhắn thoại dành cho thành viên VIP"
            message={voiceVipLockMessage(me)}
            onClose={() => setVoiceLocked(false)}
          />

          <div className="cpv-dock">
            <div className="cpv-toolbar" style={{ position: "relative" }}>
              <GifPicker
                open={panel === "gif"}
                onClose={() => setPanel(null)}
                anchorRef={gifBtnRef}
                onPick={(url) => {
                  if (countGifTokens(content) >= 1) {
                    toast.error("Mỗi bài viết chỉ được đính kèm 1 GIF");
                    return;
                  }
                  if (selected.length > 0) {
                    toast.error("Vui lòng xoá ảnh trước khi sử dụng GIF.");
                    return;
                  }
                  insertAtCursor(gifToken(url));
                  setPanel(null);
                }}
              />
              <ToolBtn
                label="Ảnh"
                tone="photo"
                active={panel === "media" && album !== "video"}
                title={hasGif ? "Bài viết GIF không thể đính kèm ảnh." : "Ảnh"}
                onClick={() => {
                  if (hasGif) {
                    toast.error("Không thể thêm ảnh vào bài viết GIF.");
                    return;
                  }
                  setAlbum("photo");
                  setPanel(panel === "media" ? null : "media");
                }}
              >
                <ImageIcon size={19} />
              </ToolBtn>
              <ToolBtn
                label="Video"
                tone="video"
                active={panel === "media" && album === "video"}
                onClick={() => {
                  if (hasGif) {
                    toast.error("Không thể thêm ảnh vào bài viết GIF.");
                    return;
                  }
                  setAlbum("video");
                  setPanel(panel === "media" ? null : "media");
                }}
              >
                <Video size={19} />
              </ToolBtn>
              <ToolBtn
                label="Facebook"
                tone="fb"
                active={!!facebookUrl}
                title={facebookUrl ? `Facebook: ${facebookUrl}` : "Thêm liên kết Facebook"}
                onClick={openFacebookDialog}
              >
                <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
                  <path fill="currentColor" d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5 3.66 9.15 8.44 9.94v-7.03H7.9v-2.9h2.54V9.83c0-2.52 1.5-3.91 3.78-3.91 1.1 0 2.24.2 2.24.2v2.47h-1.26c-1.24 0-1.63.78-1.63 1.58v1.89h2.78l-.44 2.9h-2.34V22c4.78-.79 8.43-4.94 8.43-9.94Z"/>
                </svg>
              </ToolBtn>
              <ToolBtn
                label="Zalo"
                tone="zalo"
                active={!!zaloUrl}
                title={zaloUrl ? `Zalo: ${zaloUrl}` : "Thêm liên kết Zalo"}
                onClick={openZaloDialog}
              >
                <span className="cpv-zalo-mark" aria-hidden>Zalo</span>
              </ToolBtn>
              <ToolBtn
                label="Voice"
                tone="voice"
                active={recording}
                title="Tin nhắn thoại"
                onClick={() => {
                  if (hasVoiceToken(content)) {
                    toast.error("Mỗi bài viết chỉ được đính kèm 1 tin nhắn thoại");
                    return;
                  }
                  setRecording((r) => !r);
                }}
              >
                <Mic size={19} />
              </ToolBtn>
              <ToolBtn
                label="Emoji"
                tone="emoji"
                active={panel === "emoji"}
                onClick={() => setPanel(panel === "emoji" ? null : "emoji")}
              >
                <Smile size={19} />
              </ToolBtn>
              <ToolBtn
                label="Hashtag"
                tone="tag"
                active={panel === "hashtag"}
                onClick={() => setPanel(panel === "hashtag" ? null : "hashtag")}
              >
                <Hash size={19} />
              </ToolBtn>
              <ToolBtn
                label="GIF"
                tone="gif"
                active={panel === "gif"}
                btnRef={gifBtnRef}
                onClick={() => setPanel(panel === "gif" ? null : "gif")}
              >
                <Sparkles size={19} />
              </ToolBtn>
            </div>

            <div className="cpv-footer">
              <span className="cpv-count">Còn {remaining} ký tự</span>
            </div>
          </div>



          <>
            {linkDialog ? (
              <div
                className="lm-overlay"
                onClick={() => setLinkDialog(null)}
                onKeyDown={(e) => { if (e.key === "Escape") setLinkDialog(null); }}
                tabIndex={-1}
              >
                <div
                  className="lm-sheet"
                  onClick={(e) => e.stopPropagation()}
                  role="dialog"
                  aria-modal="true"
                >
                  <div className="lm-sheet__head">
                    <span className="lm-sheet__title">
                      {linkDialog === "facebook" ? "Liên kết Facebook" : "Liên kết Zalo"}
                    </span>
                    <button className="lm-icon-btn" onClick={() => setLinkDialog(null)} aria-label="Đóng">
                      <X size={18} />
                    </button>
                  </div>
                  <label className="lm-field">
                    <span>
                      {linkDialog === "facebook"
                        ? "Nhập URL Facebook (vd: facebook.com/ten-cua-ban)"
                        : "Nhập số điện thoại Zalo (vd: 0912345678)"}
                    </span>
                    <div className="lm-input-money">
                      <input
                        autoFocus
                        type={linkDialog === "zalo" ? "tel" : "text"}
                        value={linkDraft}
                        placeholder={linkDialog === "facebook" ? "https://facebook.com/..." : "0912345678"}
                        onChange={(e) => { setLinkDraft(e.target.value); setLinkError(null); }}
                        onKeyDown={(e) => { if (e.key === "Enter") saveLink(); }}
                      />
                    </div>
                  </label>
                  {linkError ? <div className="lm-errors">{linkError}</div> : null}
                  <div className="lm-sheet__actions">
                    {(linkDialog === "facebook" ? facebookUrl : zaloUrl) ? (
                      <button type="button" className="lm-btn lm-btn--ghost" onClick={clearLink}>
                        Gỡ liên kết
                      </button>
                    ) : null}
                    <button type="button" className="lm-btn lm-btn--primary" onClick={saveLink}>
                      Lưu
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </>
        </div>
      )}
    </>
  );
}
