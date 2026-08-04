import { useEffect, useState, lazy, Suspense } from "react";

// Mount the legacy Vite + react-router-dom app entirely on the client.
// SSR is skipped because BrowserRouter requires window.
const App = lazy(() => import("./App"));

export function LegacyApp() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return (
    <Suspense fallback={null}>
      <App />
    </Suspense>
  );
}
