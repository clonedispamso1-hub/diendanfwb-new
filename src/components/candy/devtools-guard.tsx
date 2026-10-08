/** App-wide DevTools / source protection. Started at module load (before React
 * renders) so it covers every route, guests and signed-in users; never stopped
 * by navigation, login/logout or re-renders.
 */
import { useEffect } from "react";
import { startDevtoolsProtection } from "@/lib/devtools-guard";

if (typeof window !== "undefined") startDevtoolsProtection();

export function DevToolsGuard() {
  useEffect(() => {
    startDevtoolsProtection();
  }, []);
  return null;
}

export default DevToolsGuard;
