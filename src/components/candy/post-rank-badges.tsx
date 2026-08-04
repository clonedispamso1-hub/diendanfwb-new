import { useLeaderboardRank } from "@/components/candy/leaderboard-badges-provider";

/**
 * Small pill-shaped rank badges used on posts.
 *
 * - Follow badge: gold styling, 🥇/🥈/🥉 medal for top 3, "TOP N FOLLOW" text.
 * - Stars badge: purple styling with ⭐ icon, "TOP N NGÔI SAO" text.
 *
 * A user in both leaderboards shows both badges side-by-side. Unranked users
 * render nothing. Sizing / border-radius match the existing "THÔNG BÁO"
 * pill so all post badges feel like one system.
 */
export function PostRankBadges({ userId }: { userId: string | null | undefined }) {
  const { follow, stars } = useLeaderboardRank(userId);
  if (!follow && !stars) return null;

  return (
    <span className="post-rank-badges">
      {follow ? <FollowBadge rank={follow} /> : null}
      {stars ? <StarsBadge rank={stars} /> : null}
      <style>{`
        .post-rank-badges {
          display: inline-flex;
          gap: 6px;
          flex-wrap: wrap;
          align-items: center;
        }
        .rank-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          height: 22px;
          padding: 0 10px;
          border-radius: 999px;
          font-size: 10.5px;
          font-weight: 900;
          letter-spacing: 0.5px;
          line-height: 1;
          border: 1px solid transparent;
          transition: transform 160ms ease, box-shadow 160ms ease, filter 160ms ease;
          cursor: default;
          white-space: nowrap;
        }
        .rank-badge:hover { transform: translateY(-1px) scale(1.03); filter: brightness(1.05); }
        .rank-badge:active { transform: translateY(0); }
        .rank-badge--follow {
          color: #78350f;
          background:
            linear-gradient(135deg, #fff7cc 0%, #fde68a 40%, #f59e0b 100%);
          border-color: rgba(217, 119, 6, 0.75);
          box-shadow:
            0 8px 18px -8px rgba(217, 119, 6, 0.7),
            0 0 0 1px rgba(255, 255, 255, 0.55) inset,
            0 -1px 0 rgba(146, 64, 14, 0.15) inset;
          text-shadow: 0 1px 0 rgba(255, 255, 255, 0.55);
        }
        .rank-badge--stars {
          color: #ffffff;
          background: linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%);
          border-color: rgba(139, 92, 246, 0.55);
          box-shadow:
            0 8px 18px -8px rgba(236, 72, 153, 0.7),
            0 0 0 1px rgba(255, 255, 255, 0.35) inset;
        }
      `}</style>
    </span>
  );
}

function FollowBadge({ rank }: { rank: number }) {
  const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : "🏅";
  return (
    <span className="rank-badge rank-badge--follow" title={`Top ${rank} Follow`}>
      <span aria-hidden>{medal}</span>
      TOP {rank} FOLLOW
    </span>
  );
}

function StarsBadge({ rank }: { rank: number }) {
  return (
    <span className="rank-badge rank-badge--stars" title={`Top ${rank} Ngôi sao`}>
      <span aria-hidden>⭐</span>
      TOP {rank} NGÔI SAO
    </span>
  );
}
