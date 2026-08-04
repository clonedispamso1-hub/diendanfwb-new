import { useEffect, useState } from "react";
import App from "@/CandyApp";

export function CandyAppMount() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return <App />;
}

export default CandyAppMount;
