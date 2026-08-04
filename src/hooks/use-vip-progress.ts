import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/candy/auth-provider";
import { computeVipProgress, type VipProgress } from "@/lib/vip";

/**
 * Theo dõi vip_exp/vip_level realtime + tự gọi daily_checkin & online_tick.
 * Trả về VipProgress đã tính sẵn.
 */
export function useVipProgress(): VipProgress & { ready: boolean } {
  const { me } = useAuth();
  const [exp, setExp] = useState<number>(0);
  const [level, setLevel] = useState<number>(1);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    if (!me?.id) { setExp(0); setLevel(1); return; }
    const { data } = await supabase
      .from("profiles")
      .select("vip_exp, vip_level")
      .eq("id", me.id)
      .maybeSingle();
    if (data) {
      setExp(Number((data as any).vip_exp ?? 0));
      setLevel(Math.max(1, Number((data as any).vip_level ?? 1)));
    }
    setReady(true);
  }, [me?.id]);

  useEffect(() => { void refresh(); }, [refresh]);

  // Daily check-in + online tick on entry/foreground, without continuous polling.
  useEffect(() => {
    if (!me?.id) return;
    let cancelled = false;
    let lastRunAt = 0;
    const runOnce = async () => {
      const now = Date.now();
      if (now - lastRunAt < 5 * 60_000) return;
      lastRunAt = now;
      try { await supabase.rpc("daily_checkin" as any); } catch { /* ignore */ }
      try { await supabase.rpc("online_tick" as any); } catch { /* ignore */ }
      if (!cancelled) await refresh();
    };
    void runOnce();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void runOnce();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [me?.id, refresh]);

  // Realtime: profile UPDATE → reload exp
  useEffect(() => {
    if (!me?.id) return;
    const ch = supabase.channel(`vip-progress-${me.id}-${Math.random().toString(36).slice(2, 8)}`);
    ch.on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${me.id}` },
      (payload: any) => {
        const next = payload.new || {};
        if (typeof next.vip_exp === "number") setExp(next.vip_exp);
        if (typeof next.vip_level === "number") setLevel(Math.max(1, next.vip_level));
      },
    ).subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [me?.id]);

  const progress = computeVipProgress(exp, level);
  return { ...progress, ready };
}
