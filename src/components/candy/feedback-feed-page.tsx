import { useCallback, useEffect, useRef, useState } from "react";
import { Images, Send, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/candy/auth-provider";
import { PostCard } from "@/components/candy/post-card";
import { BottomSheet } from "@/components/candy/bottom-sheet";
import { supabase } from "@/lib/supabase";
import type { PostRecord } from "@/lib/app-types";
import { createPostCompat, uploadPublicFile } from "@/lib/db-compat";
import { getMediaUrl as cdnUrl } from "@/lib/media";
import { getValidAvatarUrl, handleAvatarError } from "@/lib/avatar-utils";
import { getFriendlyName } from "@/lib/name-format";

/**
 * FeedbackFeedPage — UI 1:1 với feed "Tìm FWB" nhưng dữ liệu hoàn toàn tách biệt.
 * Mọi bài viết & bình luận tại đây chỉ ghi/đọc với `posts.visibility = 'feedback'`.
 * Bài feedback KHÔNG bao giờ leak sang feed chính (đã thêm filter ở feed-page).
 */
const PAGE_SIZE = 20;
const MAX_IMAGES = 4;
const PROFILE_FIELDS =
  "id, full_name, username, avatar, vip_level, title_gif_url, gender, province, location, intent, is_admin";

interface Props {
  onViewProfile: (userId: string) => void;
}

export function FeedbackFeedPage({ onViewProfile }: Props) {
  const { me } = useAuth();
  const meAny = me as any;
  const [posts, setPosts] = useState<PostRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [composerOpen, setComposerOpen] = useState(false);
  const [postText, setPostText] = useState("");
  const [postFiles, setPostFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [posting, setPosting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const hydrate = useCallback(async (rows: any[]) => {
    const ids = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];
    if (!ids.length) return rows as PostRecord[];
    const { data } = await supabase.from("profiles").select(PROFILE_FIELDS).in("id", ids);
    const map = new Map((data || []).map((p: any) => [p.id, p]));
    return rows.map((r) => ({ ...r, profiles: map.get(r.user_id) || null })) as PostRecord[];
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase.from("posts") as any)
      .select("*")
      .eq("category", "feedback")
      .order("created_at", { ascending: false })
      .range(0, PAGE_SIZE - 1);
    if (error) {
      toast.error("Không tải được Feedback.");
      setPosts([]);
    } else {
      const hydrated = await hydrate((data as any[]) || []);
      setPosts(hydrated);
    }
    setLoading(false);
  }, [hydrate]);

  useEffect(() => {
    void load();
  }, [load]);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const next = Array.from(list).slice(0, MAX_IMAGES - postFiles.length);
    setPostFiles((prev) => [...prev, ...next].slice(0, MAX_IMAGES));
    const newPreviews = next.map((f) => URL.createObjectURL(f));
    setPreviewUrls((prev) => [...prev, ...newPreviews].slice(0, MAX_IMAGES));
  };

  const removeFile = (idx: number) => {
    setPostFiles((prev) => prev.filter((_, i) => i !== idx));
    setPreviewUrls((prev) => {
      const url = prev[idx];
      if (url) URL.revokeObjectURL(url);
      return prev.filter((_, i) => i !== idx);
    });
  };

  useEffect(() => () => previewUrls.forEach((u) => URL.revokeObjectURL(u)), []); // eslint-disable-line

  const handleSubmit = async () => {
    if (!me) return toast.error("Vui lòng đăng nhập.");
    if (!postText.trim() && postFiles.length === 0) {
      return toast.error("Nhập nội dung hoặc chọn ảnh.");
    }
    setPosting(true);
    try {
      const urls: string[] = [];
      for (const f of postFiles.slice(0, MAX_IMAGES)) {
        const raw = await uploadPublicFile("posts", f, "posts");
        urls.push(cdnUrl(raw));
      }
      await createPostCompat(me.id, postText.trim() || "💬", urls[0] ?? null, {
        imageUrls: urls,
        visibility: "feedback",
        status: "published",
        category: "feedback",
      });
      toast.success("Đã gửi Feedback!");
      setPostText("");
      setPostFiles([]);
      setPreviewUrls([]);
      setComposerOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không gửi được.");
    } finally {
      setPosting(false);
    }
  };

  return (
    <>
      {/* Yellow header notice — giữ nguyên theo yêu cầu */}
      <div
        style={{
          margin: "12px 16px",
          padding: "14px 16px",
          borderRadius: 16,
          background: "linear-gradient(135deg, rgba(245,158,11,0.18), rgba(245,158,11,0.06))",
          border: "1px solid rgba(245,158,11,0.45)",
          color: "hsl(var(--foreground))",
          fontSize: 13,
          lineHeight: 1.55,
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 4, color: "#f59e0b" }}>
          💎 Feedback &amp; Voucher
        </div>
        <div style={{ opacity: 0.9 }}>
          Chia sẻ trải nghiệm, đóng góp ý tưởng hoặc báo lỗi để chúng tôi cải thiện ứng dụng.
          Mỗi feedback chất lượng được duyệt sẽ nhận Voucher Gem ưu đãi.
        </div>
      </div>

      {/* Composer trigger — y hệt feed chính */}
      <button
        type="button"
        className="composer-trigger"
        onClick={() => setComposerOpen(true)}
        aria-label="Gửi feedback mới"
      >
        <img loading="lazy" decoding="async"
          src={getValidAvatarUrl(meAny?.avatar)}
          onError={handleAvatarError}
          alt=""
          className="composer-trigger__avatar"
        />
        <span className="composer-trigger__text">Có gì mới?</span>
        <span className="composer-trigger__cta">Đăng</span>
      </button>

      <BottomSheet
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        title="Gửi Feedback"
        leftAction={
          <button type="button" className="bsheet-cancel" onClick={() => setComposerOpen(false)}>
            Hủy
          </button>
        }
        rightAction={
          <button
            type="button"
            className="composer-submit-premium"
            onClick={() => void handleSubmit()}
            disabled={posting}
            style={{ height: 34, padding: "0 14px", fontSize: 13 }}
          >
            <Send size={13} strokeWidth={2.4} />
            <span>{posting ? "Đang gửi..." : "Gửi"}</span>
          </button>
        }
      >
        <section
          className="composer-card composer-threads stack-sm rounded-3xl"
          style={{ border: 0, background: "transparent", padding: 0 }}
        >
          <div className="flex items-center gap-3" style={{ paddingBottom: 4 }}>
            <img loading="lazy" decoding="async"
              src={getValidAvatarUrl(meAny?.avatar)}
              onError={handleAvatarError}
              alt={getFriendlyName(meAny?.full_name, meAny?.username)}
              className="rounded-full"
              style={{ width: 40, height: 40, objectFit: "cover", flexShrink: 0 }}
            />
            <div style={{ minWidth: 0, lineHeight: 1.25 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                Phản hồi của bạn rất quan trọng!
              </div>
            </div>
          </div>
          <textarea
            ref={textareaRef}
            className="app-input"
            rows={4}
            placeholder="Viết feedback, đề xuất tính năng, hay báo lỗi…"
            value={postText}
            onChange={(e) => setPostText(e.target.value)}
          />
          {previewUrls.length > 0 ? (
            <div className="composer-thumbs">
              {previewUrls.map((u, i) => (
                <div key={u} className="composer-thumb">
                  <img loading="lazy" decoding="async" src={u} alt={`Xem trước ${i + 1}`} />
                  <button
                    type="button"
                    className="composer-thumb-remove"
                    onClick={() => removeFile(i)}
                    aria-label="Bỏ ảnh"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          <div className="composer-row composer-row-actions composer-row--premium">
            <div className="flex w-full items-center justify-between gap-2 rounded-2xl border border-white/10 bg-white/5 px-2 py-1.5 backdrop-blur-md">
              <label
                className="composer-icon-btn !h-9 !w-9 !rounded-xl flex items-center justify-center cursor-pointer transition hover:bg-primary/15 hover:text-primary"
                title={`Chọn ảnh (tối đa ${MAX_IMAGES})`}
                aria-label="Chọn ảnh"
              >
                <Images size={18} />
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  onChange={(e) => {
                    addFiles(e.target.files);
                    e.currentTarget.value = "";
                  }}
                />
              </label>
              <span style={{ fontSize: 12, opacity: 0.6 }}>
                {postFiles.length}/{MAX_IMAGES} ảnh
              </span>
            </div>
          </div>
        </section>
      </BottomSheet>

      {/* Feed list — dùng PostCard giống hệt feed chính */}
      <section className="feed-threads" style={{ paddingTop: 8 }}>
        {loading ? (
          <div className="empty-state">Đang tải feedback…</div>
        ) : posts.length === 0 ? (
          <div className="empty-state">
            Chưa có feedback nào — hãy là người đầu tiên chia sẻ!
          </div>
        ) : (
          posts.map((p) => (
            <PostCard
              key={p.id}
              meId={me?.id}
              post={p}
              onRefresh={load}
              onRemoved={(id) => setPosts((prev) => prev.filter((x) => x.id !== id))}
              onViewProfile={onViewProfile}
              canDelete={me?.id === p.user_id}
              compactMedia
            />
          ))
        )}
      </section>
    </>
  );
}
