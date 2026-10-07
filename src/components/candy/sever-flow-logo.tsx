import logo from "@/assets/brand/sever-flow-logo.asset.json";
import "@/styles/sever-progress.css";

/** Flow-only logo: never fetches branding settings or Supabase Storage. */
export function SeverFlowLogo() {
  return <img src={logo.url} className="sever-flow-logo" alt="Logo website"
    loading="eager" decoding="async" />;
}