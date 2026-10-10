import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchFeedbackZalo, type FeedbackZaloPost } from "@/lib/feedback-zalo-store";
import { FeedbackMedia } from "@/components/candy/feedback-zalo-media";
import { feedbackLabel, useFeedbackZaloUnread, useNow } from "@/lib/feedback-zalo-unread";

/** Entry + huy hiệu đỏ số feedback chưa đọc (theo tài khoản). */
export function FeedbackZaloEntry() {
  const unread = useFeedbackZaloUnread();
  return (
    <Button asChild variant="ghost" size="unstyled" className="feedback-zalo-entry">
      <Link to="/feedback-zalo">
        <span className="feedback-zalo-mark" aria-hidden="true">Zalo</span>
        <span>Feedback Zalo</span>
        <ChevronRight size={14} aria-hidden="true" />
        {unread > 0 ? (
          <span className="feedback-zalo-badge" aria-hidden="true" title={`${unread} feedback mới`}>
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </Link>
    </Button>
  );
}

export function FeedbackZaloBack() {
  return (
    <Button asChild variant="ghost" size="unstyled" className="feedback-zalo-back">
      <Link to="/" aria-label="Quay lại trang chủ" title="Quay lại trang chủ">
        <ChevronLeft size={22} aria-hidden="true" />
      </Link>
    </Button>
  );
}

function readId(search: unknown): string | undefined {
  const id = (search as { id?: unknown } | undefined)?.id;
  return typeof id === "string" && id ? id : undefined;
}

export function FeedbackZaloPage() {
  const search = useRouterState({ select: (s) => s.location.search });
  const id = readId(search);
  const navigate = useNavigate();
  const [items, setItems] = useState<FeedbackZaloPost[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const listScroll = useRef(0);
  const openedFromList = useRef(false);

  useEffect(() => {
    let alive = true;
    fetchFeedbackZalo().then(
      (list) => { if (alive) { setItems(list); setState("ready"); } },
      () => { if (alive) setState("error"); },
    );
    return () => { alive = false; };
  }, []);

  const now = useNow(60_000);

  useEffect(() => {
    if (id) window.scrollTo(0, 0);
    else if (openedFromList.current) {
      const top = listScroll.current;
      requestAnimationFrame(() => window.scrollTo(0, top));
    }
  }, [id]);

  const open = (postId: string) => {
    listScroll.current = window.scrollY;
    openedFromList.current = true;
    void navigate({ to: "/feedback-zalo", search: { id: postId } });
  };
  const back = () => {
    if (openedFromList.current) window.history.back();
    else void navigate({ to: "/feedback-zalo", search: {} });
  };

  if (id) {
    const post = items.find((p) => p.id === id);
    return (
      <section className="feedback-zalo-page fz-detail">
        <button type="button" className="fz-back" onClick={back} aria-label="Quay lại danh sách Feedback Zalo">
          <ChevronLeft size={20} aria-hidden="true" /> Quay lại
        </button>
        {state === "loading" ? <p className="fz-status">Đang tải…</p> : null}
        {state === "error" ? <p className="fz-status">Không tải được feedback. Vui lòng thử lại sau.</p> : null}
        {state === "ready" && !post ? <p className="fz-status">Feedback không tồn tại hoặc đã bị xóa.</p> : null}
        {post ? (
          <article>
            <h1 className="fz-detail__title">{post.title}</h1>
            <div className="fz-author">
              <Avatar url={post.avatar_url} name={post.author_name} />
              <strong>{post.author_name}</strong>
            </div>
            <FeedbackMedia url={post.content_url} type={post.content_type} poster={post.cover_url || undefined} />
            {post.description ? <p className="fz-detail__desc">{post.description}</p> : null}
          </article>
        ) : null}
      </section>
    );
  }

  return (
    <section className="feedback-zalo-page" aria-labelledby="feedback-zalo-title">
      <div className="feedback-zalo-page__heading">
        <span className="feedback-zalo-mark feedback-zalo-mark--large" aria-hidden="true">Zalo</span>
        <h1 id="feedback-zalo-title">Feedback Zalo</h1>
      </div>
      {state === "loading" ? <p className="fz-status">Đang tải…</p> : null}
      {state === "error" ? <p className="fz-status">Không tải được feedback. Vui lòng thử lại sau.</p> : null}
      {state === "ready" && items.length === 0 ? (
        <div className="feedback-zalo-page__empty">
          <MessageCircle size={36} strokeWidth={1.4} aria-hidden="true" />
          <p>Chưa có feedback nào.</p>
        </div>
      ) : null}
      <div className="fz-list">
        {items.map((p) => (
          <article key={p.id} className="fz-card">
            <div className="fz-author">
              <Avatar url={p.avatar_url} name={p.author_name} />
              <strong>{p.author_name}</strong>
            </div>
            <FeedbackLabelChip createdAt={p.created_at} now={now} />
            <h2 className="fz-card__title">{p.title}</h2>
            {p.cover_url ? <CoverImage url={p.cover_url} /> : null}
            <button type="button" className="fz-card__cta" onClick={() => open(p.id)}>
              Xem chi tiết →
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

function Avatar({ url, name }: { url: string; name: string }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) return <span className="fz-avatar fz-avatar--fallback" aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>;
  return <img className="fz-avatar" src={url} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />;
}

function CoverImage({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <div className="fz-card__cover fz-card__cover--error">Không tải được ảnh bìa</div>;
  return <img className="fz-card__cover" src={url} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />;
}

function FeedbackLabelChip({ createdAt, now }: { createdAt: string; now: number }) {
  const label = feedbackLabel(createdAt, now);
  return (
    <span className={label === "NEW" ? "fz-label fz-label--new" : "fz-label fz-label--vip"}>{label}</span>
  );
}
