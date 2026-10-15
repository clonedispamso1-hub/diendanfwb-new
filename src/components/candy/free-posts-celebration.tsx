import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/candy/auth-provider";
import { supabase } from "@/lib/db/router";
import { FREE_POST_TOTAL } from "@/lib/free-posts";

/**
 * Hiệu ứng "+1 … +20 lượt đăng bài miễn phí".
 * Server (claim_free_posts_celebration) chỉ trả show=true đúng 1 lần / tài khoản,
 * không cấp thêm lượt — nên đăng nhập lại / F5 không hiện lại, không cộng trùng.
 * Admin và Tài khoản thứ hai không nhận hiệu ứng.
 */
export function FreePostsCelebration() {
  const { me } = useAuth() as any;
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [remaining, setRemaining] = useState<number>(FREE_POST_TOTAL);
  const checkedFor = useRef<string | null>(null);

  useEffect(() => {
    const uid = me?.id as string | undefined;
    if (!uid || checkedFor.current === uid) return;
    if (me?.is_admin || me?.account_source === "internal") return;
    checkedFor.current = uid;
    (async () => {
      try {
        const { data, error } = await (supabase as any).rpc("claim_free_posts_celebration");
        if (error || !data?.show) return;
        setRemaining(Number(data.free_remaining ?? FREE_POST_TOTAL));
        setCount(0);
        setOpen(true);
      } catch {
        /* SQL chưa chạy → không hiện */
      }
    })();
  }, [me?.id, me?.is_admin, me?.account_source]);

  useEffect(() => {
    if (!open || count >= FREE_POST_TOTAL) return;
    const t = setTimeout(() => setCount((c) => c + 1), count === 0 ? 450 : 110);
    return () => clearTimeout(t);
  }, [open, count]);

  if (!open) return null;
  const done = count >= FREE_POST_TOTAL;

  return (
    <div className="fpc-backdrop" role="dialog" aria-modal="true" aria-label="Quà lượt đăng bài miễn phí">
      <div className="fpc-card">
        <div className="fpc-glow" aria-hidden />
        <p className="fpc-eyebrow">Quà chào mừng FWB</p>
        <div className="fpc-counter" aria-live="polite">
          {count > 0 && (
            <span key={count} className="fpc-plus">
              +{count}
            </span>
          )}
        </div>
        <div className="fpc-bar" aria-hidden>
          <div className="fpc-bar__fill" style={{ width: `${(count / FREE_POST_TOTAL) * 100}%` }} />
        </div>
        <h2 className="fpc-title">
          {done ? `Bạn có ${FREE_POST_TOTAL} lượt đăng bài miễn phí!` : "Đang cộng lượt đăng bài…"}
        </h2>
        <p className="fpc-sub">
          {done
            ? `Còn ${remaining} lượt. Mỗi bài đăng thành công trừ 1 lượt; hết lượt phí 5.000 gem/bài.`
            : `${count}/${FREE_POST_TOTAL} lượt`}
        </p>
        {done && (
          <button type="button" className="fpc-btn" onClick={() => setOpen(false)}>
            Đăng bài ngay
          </button>
        )}
      </div>
    </div>
  );
}
