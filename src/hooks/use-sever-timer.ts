import { useEffect, useRef, useState } from "react";
import { getSeverTiming, SEVER_PHASE_DURATION_MS } from "@/lib/sever-timing";

/** One local clock drives the bar, percentage and countdown together. */
export function useSeverTimer(onComplete: () => void) {
  const [elapsed, setElapsed] = useState(0);
  const callback = useRef(onComplete);
  useEffect(() => { callback.current = onComplete; }, [onComplete]);

  useEffect(() => {
    const started = performance.now();
    let frame: number | undefined;
    const tick = window.setInterval(() => {
      setElapsed(Math.min(SEVER_PHASE_DURATION_MS, performance.now() - started));
    }, 100);
    const done = window.setTimeout(() => {
      window.clearInterval(tick);
      setElapsed(SEVER_PHASE_DURATION_MS);
      // Paint 100% / 0 before advancing, without adding a second-long hold.
      frame = window.requestAnimationFrame(() => {
        frame = window.requestAnimationFrame(() => callback.current());
      });
    }, SEVER_PHASE_DURATION_MS);
    return () => {
      window.clearInterval(tick);
      window.clearTimeout(done);
      if (frame !== undefined) window.cancelAnimationFrame(frame);
    };
  }, []);

  return { elapsed, ...getSeverTiming(elapsed) };
}