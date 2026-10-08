import { lazy, Suspense } from "react";
import { AppLoading } from "@/components/candy/app-loading";

const pages = import.meta.glob<{ default: React.ComponentType }>("./imported-views/**/*.tsx");
/** Lazy-load original page components without changing their source or providers. */
export function importedPage(name: string) {
  const loader = pages[`./imported-views/${name}.tsx`];
  if (!loader) throw new Error(`Missing imported page: ${name}`);
  const Page = lazy(loader);
  return function ImportedPage() {
    return <Suspense fallback={<AppLoading label="Đang tải…" size="lg" />}><Page /></Suspense>;
  };
}