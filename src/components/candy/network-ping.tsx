import { useEffect, useState } from "react";
import { Wifi, WifiOff } from "lucide-react";

/**
 * Real-time network ping indicator.
 * Measures round-trip latency on mount and when connectivity changes.
 * Color tiers: <50ms green · 50–150ms amber · >150ms red.
 */
export function NetworkPing() {
  const [ping, setPing] = useState<number | null>(null);
  const [online, setOnline] = useState<boolean>(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );

  useEffect(() => {
    let alive = true;

    const measure = async () => {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        if (alive) { setOnline(false); setPing(null); }
        return;
      }
      const url = `${window.location.origin}/favicon.ico?_p=${Date.now()}`;
      const t0 = performance.now();
      try {
        await fetch(url, { method: "GET", cache: "no-store", mode: "no-cors" });
        const ms = Math.round(performance.now() - t0);
        if (alive) { setPing(ms); setOnline(true); }
      } catch {
        if (alive) { setPing(null); setOnline(false); }
      }
    };

    void measure();

    const onOnline = () => { setOnline(true); void measure(); };
    const onOffline = () => { setOnline(false); setPing(null); };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      alive = false;
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  if (!online) {
    return (
      <span className="net-ping net-ping--bad" title="Mất kết nối">
        <WifiOff size={12} />
        <span>offline</span>
      </span>
    );
  }

  if (ping == null) {
    return (
      <span className="net-ping" title="Đang đo tín hiệu...">
        <Wifi size={12} />
        <span>…</span>
      </span>
    );
  }

  const tier = ping < 50 ? "good" : ping <= 150 ? "mid" : "bad";
  return (
    <span className={`net-ping net-ping--${tier}`} title={`Ping ${ping}ms`}>
      <Wifi size={12} />
      <span>{ping}ms</span>
    </span>
  );
}
