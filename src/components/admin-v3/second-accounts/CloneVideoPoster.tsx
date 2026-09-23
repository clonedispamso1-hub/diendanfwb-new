/**
 * MỤC VIDEO — Admin Panel → Tài khoản thứ hai → Đăng bài.
 *
 *  • Chọn tài khoản clone để đăng.
 *  • Upload video từ máy (đi qua MediaService như mọi media khác) hoặc dán URL.
 *  • Preview video trước khi đăng.
 *  • Giới hạn 5 phút (300s): video dài hơn sẽ được CẮT Ở SERVER
 *    (/api/public/clone-video-trim) trước khi đăng.
 */
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Send, Video, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { uploadClonePostMediaUrl } from "@/lib/media";
import { createClonePostSb3 } from "@/lib/admin/second-account-sb3";
import type { AccountLite } from "./InternalTools";

export const MAX_VIDEO_SECONDS = 300;

/** Đọc thời lượng video từ URL (metadata) — dùng cho preview & quyết định cắt. */
function probeDuration(url: string): Promise<number | null> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    const done = (val: number | null) => {
      v.removeAttribute("src");
      resolve(val);
    };
    v.onloadedmetadata = () => done(Number.isFinite(v.duration) ? v.duration : null);
    v.onerror = () => done(null);
    v.src = url;
  });
}

async function trimOnServer(url: string): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token || "";
  const res = await fetch("/api/public/clone-video-trim", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ url, maxSeconds: MAX_VIDEO_SECONDS }),
  });
  const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string; detail?: string };
  if (!res.ok || !json.url) {
    throw new Error(json.detail || json.error || "Cắt video ở server thất bại.");
  }
  return json.url;
}

function fmt(sec: number): string {
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function CloneVideoPoster({ accounts }: { accounts: AccountLite[] }) {
  const [accountId, setAccountId] = useState("");
  const [content, setContent] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [duration, setDuration] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!videoUrl) { setDuration(null); return; }
    let alive = true;
    void probeDuration(videoUrl).then((d) => { if (alive) setDuration(d); });
    return () => { alive = false; };
  }, [videoUrl]);

  async function pickFile(file: File | undefined) {
    if (!file) return;
    if (!(file.type || "").toLowerCase().startsWith("video/")) {
      toast.error("Vui lòng chọn tệp video (mp4, webm, mov).");
      return;
    }
    setUploading(true);
    try {
      const url = await uploadClonePostMediaUrl(file);
      setVideoUrl(url);
      toast.success("Đã tải video lên");
    } catch (e: any) {
      toast.error(e?.message || "Tải video thất bại");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function publish() {
    if (!accountId) { toast.error("Chọn tài khoản clone để đăng"); return; }
    if (!videoUrl) { toast.error("Chưa có video"); return; }
    setBusy(true);
    try {
      let finalUrl = videoUrl;
      const dur = duration ?? (await probeDuration(videoUrl));
      if (dur === null || dur > MAX_VIDEO_SECONDS) {
        toast.info("Video dài hơn 5 phút — đang cắt ở server…");
        finalUrl = await trimOnServer(videoUrl);
      }
      await createClonePostSb3({
        accountId,
        content: content.trim(),
        imageUrls: [finalUrl],
        visibility: "home",
        facebookUrl: null,
        zaloUrl: null,
      });
      toast.success("Đã đăng video");
      setContent(""); setVideoUrl(""); setUrlInput(""); setDuration(null);
    } catch (e: any) {
      toast.error(e?.message || "Đăng video thất bại");
    } finally {
      setBusy(false);
    }
  }

  const tooLong = duration !== null && duration > MAX_VIDEO_SECONDS;

  return (
    <div className="admv3-card p-3 max-w-3xl mt-3">
      <div className="text-sm font-semibold flex items-center gap-1 mb-2">
        <Video size={14} /> Video (tối đa 5 phút)
      </div>

      <label className="block">
        <div className="text-xs text-muted-foreground mb-1">Đăng dưới tài khoản clone</div>
        <select className="admv3-input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          <option value="">-- Chọn tài khoản --</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {(a.full_name || a.username)} (@{a.username})
            </option>
          ))}
        </select>
      </label>

      <label className="block mt-3">
        <div className="text-xs text-muted-foreground mb-1">Nội dung (tuỳ chọn)</div>
        <textarea className="admv3-input" rows={3} value={content}
          onChange={(e) => setContent(e.target.value)} placeholder="Caption cho video…" />
      </label>

      <div className="flex items-center gap-2 mt-3 flex-wrap">
        <button className="admv3-btn admv3-btn-ghost" onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 size={14} className="animate-spin" /> : <Video size={14} />} Tải video từ máy
        </button>
        <input ref={fileRef} type="file" accept="video/*" hidden
          onChange={(e) => void pickFile(e.target.files?.[0])} />
      </div>

      <div className="flex items-end gap-2 mt-3">
        <label className="block flex-1">
          <div className="text-xs text-muted-foreground mb-1">Hoặc dán URL video</div>
          <input className="admv3-input" value={urlInput} onChange={(e) => setUrlInput(e.target.value)}
            placeholder="https://…/video.mp4" />
        </label>
        <button className="admv3-btn admv3-btn-ghost" onClick={() => {
          const u = urlInput.trim();
          if (!/^https?:\/\//i.test(u)) { toast.error("URL không hợp lệ"); return; }
          setVideoUrl(u);
        }}>Dùng URL</button>
      </div>

      {videoUrl && (
        <div className="mt-3">
          <div className="text-xs text-muted-foreground mb-1">Preview trước khi đăng</div>
          <div className="relative w-fit">
            <video src={videoUrl} controls preload="metadata"
              className="max-h-64 rounded-lg border bg-black" />
            <button className="absolute -top-2 -right-2 bg-background border rounded-full p-0.5"
              onClick={() => { setVideoUrl(""); setDuration(null); }}><X size={12} /></button>
          </div>
          <div className={`mt-1 text-xs ${tooLong ? "text-amber-600" : "text-muted-foreground"}`}>
            {duration === null
              ? "Chưa đọc được thời lượng — sẽ cắt ở server để đảm bảo tối đa 5 phút."
              : tooLong
                ? `Thời lượng ${fmt(duration)} > 5:00 — video sẽ được cắt còn 5:00 ở server khi đăng.`
                : `Thời lượng ${fmt(duration)} — hợp lệ.`}
          </div>
        </div>
      )}

      <div className="flex justify-end mt-3">
        <button className="admv3-btn" onClick={publish} disabled={busy || uploading || !videoUrl}>
          <Send size={14} /> {busy ? "Đang đăng…" : "Đăng bài"}
        </button>
      </div>
    </div>
  );
}

export default CloneVideoPoster;
