import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Gift } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface RewardPost {
  id: string;
  user_id?: string | null;
  coin_pool_total?: number | null;
  coin_pool_remaining?: number | null;
  max_claimers?: number | null;
  claimed_count?: number | null;
  coin_per_person?: number | null;
  reward_enabled?: boolean | null;
}

interface Props {
  post: RewardPost;
  meId?: string | null;
  /** When true, render compact icon-only button for the action bar row. */
  compact?: boolean;
}

const EMPTY_MSG = "Vẫn còn nhiều bài viết lắm, lần sau quay lại nhé!";

const ERROR_MAP: Record<string, string> = {
  NOT_AUTHENTICATED: "Bạn cần đăng nhập.",
  POST_NOT_FOUND: "Không tìm thấy bài viết.",
  CANNOT_CLAIM_OWN: "Bạn không thể nhận thưởng bài viết của mình.",
  REWARD_DISABLED: EMPTY_MSG,
  REWARD_EXHAUSTED: EMPTY_MSG,
  ALREADY_CLAIMED: "Bạn đã nhận thưởng bài viết này rồi.",
  NEED_LIKE_AND_COMMENT: "Bạn phải Like và Bình luận bài viết này trước khi nhận thưởng.",
};

export function CoinSpinButton({ post, meId, compact }: Props) {
  const [state, setState] = useState({
    enabled: Boolean(post.reward_enabled),
    remaining: Number(post.coin_pool_remaining ?? 0),
    claimed: Number(post.claimed_count ?? 0),
    max: Number(post.max_claimers ?? 0),
    per: Number(post.coin_per_person ?? 0),
    total: Number(post.coin_pool_total ?? 0),
  });
  const [busy, setBusy] = useState(false);
  const [alreadyClaimed, setAlreadyClaimed] = useState(false);

  useEffect(() => {
    setState({
      enabled: Boolean(post.reward_enabled),
      remaining: Number(post.coin_pool_remaining ?? 0),
      claimed: Number(post.claimed_count ?? 0),
      max: Number(post.max_claimers ?? 0),
      per: Number(post.coin_per_person ?? 0),
      total: Number(post.coin_pool_total ?? 0),
    });
  }, [post.id, post.reward_enabled, post.coin_pool_remaining, post.claimed_count]);

  useEffect(() => {
    if (!meId) return;
    let cancelled = false;
    (async () => {
      const { data } = await (supabase as any)
        .from("post_coin_claims")
        .select("id")
        .eq("post_id", post.id)
        .eq("user_id", meId)
        .maybeSingle();
      if (!cancelled && data) setAlreadyClaimed(true);
    })();
    return () => { cancelled = true; };
  }, [post.id, meId]);

  useEffect(() => {
    if (!post.id) return;
    const ch = (supabase as any)
      .channel(`coin-claims-${post.id}-${Math.random().toString(36).slice(2, 8)}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "post_coin_claims", filter: `post_id=eq.${post.id}` },
        (payload: any) => {
          setState((s) => {
            const nextClaimed = s.claimed + 1;
            const nextRemaining = Math.max(0, s.remaining - s.per);
            const stillOpen = nextClaimed < s.max && nextRemaining >= s.per && s.per > 0;
            return { ...s, claimed: nextClaimed, remaining: nextRemaining, enabled: stillOpen };
          });
          if (payload?.new?.user_id && payload.new.user_id === meId) {
            setAlreadyClaimed(true);
          }
        },
      )
      .subscribe();
    return () => { try { (supabase as any).removeChannel(ch); } catch {} };
  }, [post.id, meId]);

  const exhausted = !state.enabled || state.per <= 0 || state.claimed >= state.max || state.remaining < state.per;
  const canClaim = !exhausted && !alreadyClaimed;

  const handleClaim = async () => {
    if (busy) return;
    if (exhausted) { toast.info(EMPTY_MSG); return; }
    if (!meId) { toast.error("Bạn cần đăng nhập."); return; }
    if (alreadyClaimed) { toast.info("Bạn đã nhận thưởng bài viết này rồi."); return; }
    setBusy(true);
    try {
      const { data, error } = await (supabase as any).rpc("claim_post_reward", { post_uuid: post.id });
      if (error) {
        const code = (error.message || "").match(/[A-Z_]{4,}/)?.[0] || "";
        const msg = ERROR_MAP[code] || error.message || "Không thể nhận thưởng.";
        if (code === "ALREADY_CLAIMED") setAlreadyClaimed(true);
        if (code === "NEED_LIKE_AND_COMMENT") toast.error(msg);
        else if (code === "REWARD_DISABLED" || code === "REWARD_EXHAUSTED") toast.info(msg);
        else toast.error(msg);
        return;
      }
      const coins = Number(data?.coins ?? data?.coins_received ?? state.per ?? 0);
      toast.success(
        `Bạn nhận được ${coins.toLocaleString()} xu từ admin khi like bài viết này. Hãy chăm tương tác bạn nhé, chúc bạn có một ngày tốt lành!`,
        { duration: 6000 },
      );
      setAlreadyClaimed(true);
      setState((s) => ({
        ...s,
        claimed: data?.claimed_count ?? s.claimed + 1,
        remaining: data?.coin_pool_remaining ?? Math.max(0, s.remaining - s.per),
      }));
    } catch (e: any) {
      toast.error(e?.message || "Lỗi mạng");
    } finally {
      setBusy(false);
    }
  };

  if (compact) {
    const title = alreadyClaimed
      ? "Bạn đã nhận thưởng"
      : exhausted
        ? "Phần thưởng đã hết — quay lại sau nhé!"
        : `Nhận ${state.per.toLocaleString()} xu`;
    return (
      <button
        type="button"
        onClick={handleClaim}
        disabled={busy}
        title={title}
        aria-label="Nhận xu"
        className={`oklove-action oklove-action--claim ${canClaim ? "is-active" : "is-dim"}`}
      >
        <span className={`coin-spin-anim${canClaim ? "" : " is-claimed"}`}>
          <Gift
            size={20}
            strokeWidth={2.25}
            className={canClaim ? "text-amber-400 drop-shadow-[0_2px_6px_rgba(245,181,10,0.6)]" : "text-muted-foreground"}
          />
        </span>
        {canClaim && state.per > 0 ? (
          <span className="oklove-action__count">{state.per.toLocaleString()}</span>
        ) : null}
      </button>
    );
  }

  // Legacy non-compact rendering (kept for backward compatibility)
  if (exhausted) {
    return (
      <div className="coin-spin-wrap" title="Phần thưởng đã hết">
        <div className="coin-spin-exhausted">
          <Gift size={20} className="text-amber-400" strokeWidth={2.25} />
          <span>Đã hết</span>
        </div>
      </div>
    );
  }
  return (
    <div className="coin-spin-wrap">
      <button
        type="button"
        className="coin-spin-btn"
        onClick={handleClaim}
        disabled={busy || alreadyClaimed}
        title={alreadyClaimed ? "Bạn đã nhận thưởng" : `Nhận ${state.per.toLocaleString()} xu`}
        aria-label="Nhận thưởng"
      >
        <span className={`coin-spin-anim${alreadyClaimed ? " is-claimed" : ""}`}>
          <Gift size={26} className="text-amber-400 drop-shadow-[0_2px_6px_rgba(245,181,10,0.55)]" strokeWidth={2.25} />
        </span>
      </button>
      <div className="coin-spin-meta">
        <span className="coin-spin-chip">🎁 {state.per.toLocaleString()} xu</span>
        <span className="coin-spin-chip coin-spin-chip--muted">
          Còn {Math.max(0, state.max - state.claimed)}/{state.max}
        </span>
      </div>
    </div>
  );
}
