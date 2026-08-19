// Khối soạn nội dung dùng chung: Caption + Ảnh (upload) + GIF + VIP GIF + Voice.
// Giống hệt phần Đăng Bài của Tài Khoản Thứ Hai (không nhập URL, không nhập token).
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Image as ImageIcon, Sticker, Crown, Mic, X, Loader2 } from "lucide-react";
import { GifPicker } from "@/components/candy/gif-picker";
import { VipGifPicker } from "@/components/admin-v3/vip/VipGifPicker";
import { VoiceLibraryPicker } from "@/components/candy/voice-library-picker";
import { voiceToken } from "@/lib/voice-chat";
import { uploadMediaUrl } from "@/lib/media";

export type ComposerValue = {
  caption: string;
  imageUrls: string[];
  gifUrl: string | null;
  vipGifUrl: string | null;
  voiceToken: string | null;
};

export const EMPTY_COMPOSER: ComposerValue = {
  caption: "", imageUrls: [], gifUrl: null, vipGifUrl: null, voiceToken: null,
};

export function ScenarioComposer({
  value,
  onChange,
  captionLabel = "Caption",
}: {
  value: ComposerValue;
  onChange: (v: ComposerValue) => void;
  captionLabel?: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [showGif, setShowGif] = useState(false);
  const [showVip, setShowVip] = useState(false);
  const [showVoice, setShowVoice] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const gifAnchor = useRef<HTMLButtonElement | null>(null);
  const vipAnchor = useRef<HTMLButtonElement | null>(null);

  const set = (patch: Partial<ComposerValue>) => onChange({ ...value, ...patch });

  async function uploadFiles(files: FileList) {
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const f of Array.from(files)) {
        // uploadMediaUrl nén ảnh giống hệt luồng đăng bài hiện tại.
        urls.push(await uploadMediaUrl(f, { kind: f.type.startsWith("video") ? "video" : "post" }));
      }
      set({ imageUrls: [...value.imageUrls, ...urls] });
      toast.success("Đã tải lên");
    } catch (e: any) {
      toast.error(e?.message || "Upload thất bại");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <label className="block">
        <div className="text-xs text-muted-foreground mb-1">{captionLabel}</div>
        <textarea className="admv3-input" rows={4} value={value.caption}
          onChange={(e) => set({ caption: e.target.value })}
          placeholder="Nội dung bài viết…" />
      </label>

      <div className="flex items-center gap-1 flex-wrap relative">
        <button className="admv3-btn admv3-btn-ghost" disabled={uploading}
          onClick={() => fileRef.current?.click()}>
          {uploading ? <Loader2 size={14} className="animate-spin" /> : <ImageIcon size={14} />} Ảnh
        </button>
        <input ref={fileRef} type="file" accept="image/*,video/*" multiple hidden
          onChange={(e) => { const f = e.target.files; if (f?.length) uploadFiles(f); }} />

        <button ref={gifAnchor} className="admv3-btn admv3-btn-ghost" onClick={() => setShowGif((v) => !v)}>
          <Sticker size={14} /> GIF
        </button>
        <GifPicker open={showGif} onClose={() => setShowGif(false)} anchorRef={gifAnchor}
          onPick={(u) => { set({ gifUrl: u }); setShowGif(false); }} />

        <button ref={vipAnchor} className="admv3-btn admv3-btn-ghost" onClick={() => setShowVip((v) => !v)}>
          <Crown size={14} /> VIP GIF
        </button>
        <VipGifPicker open={showVip} onClose={() => setShowVip(false)} anchorRef={vipAnchor}
          onPick={(u) => { set({ vipGifUrl: u }); setShowVip(false); }} />

        <button className="admv3-btn admv3-btn-ghost" onClick={() => setShowVoice(true)}>
          <Mic size={14} /> Voice
        </button>
        <VoiceLibraryPicker open={showVoice} title="Voice Bài Viết" onClose={() => setShowVoice(false)}
          onPick={(item) => {
            set({ voiceToken: voiceToken(item.storage_path, item.duration) });
            setShowVoice(false);
          }} />
      </div>

      {value.imageUrls.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {value.imageUrls.map((u, i) => (
            <div key={`${u}-${i}`} className="relative">
              {/\.(mp4|webm|mov)$/i.test(u)
                ? <video preload="none" src={u} className="w-16 h-16 rounded object-cover border" muted />
                : <img decoding="async" src={u} alt="" loading="lazy" className="w-16 h-16 rounded object-cover border" />}
              <button className="absolute -top-2 -right-2 bg-background border rounded-full p-0.5"
                onClick={() => set({ imageUrls: value.imageUrls.filter((_, j) => j !== i) })}>
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        {value.gifUrl && (
          <Chip label="GIF" onClear={() => set({ gifUrl: null })}>
            <img loading="lazy" decoding="async" src={value.gifUrl} alt="" className="h-10 rounded border" />
          </Chip>
        )}
        {value.vipGifUrl && (
          <Chip label="VIP GIF" onClear={() => set({ vipGifUrl: null })}>
            <img loading="lazy" decoding="async" src={value.vipGifUrl} alt="" className="h-10 rounded border" />
          </Chip>
        )}
        {value.voiceToken && (
          <Chip label="Voice" onClear={() => set({ voiceToken: null })}>
            <Mic size={12} />
          </Chip>
        )}
      </div>
    </div>
  );
}

function Chip({ label, children, onClear }: { label: string; children: React.ReactNode; onClear: () => void }) {
  return (
    <span className="relative inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg bg-muted">
      {children} {label}
      <button onClick={onClear}><X size={11} /></button>
    </span>
  );
}
