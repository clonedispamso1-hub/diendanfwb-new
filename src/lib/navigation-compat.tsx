import { forwardRef, useCallback, type AnchorHTMLAttributes, type ReactNode } from "react";
import { Link as TanStackLink, useRouter, useRouterState } from "@tanstack/react-router";

/**
 * Imported views retain their navigation API while TanStack owns all routing.
 *
 * The returned function MUST keep the same identity across renders (like
 * react-router's useNavigate). Many effects list `navigate` as a dependency;
 * a fresh function per render re-ran them on every render — e.g. AdminPage
 * re-called auth.getUser() (GET /auth/v1/user) in an endless loop.
 */
export function useNavigate() {
  const router = useRouter();
  return useCallback(
    (to: string | number, options?: { replace?: boolean; state?: unknown }) => {
      if (typeof to === "number") { router.history.go(to); return; }
      void router.navigate({ to, replace: options?.replace, state: options?.state as never });
    },
    [router],
  );
}
export function useLocation() {
  return useRouterState({ select: (s) => ({ pathname: s.location.pathname, search: s.location.searchStr, hash: s.location.hash ? `#${s.location.hash}` : "", state: s.location.state, key: s.location.state.__TSR_key ?? "default" }) });
}
export function useParams() {
  return useRouterState({ select: (s) => Object.assign({}, ...s.matches.map((m) => m.params)) as Record<string, string | undefined> });
}
export interface NavLinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "className" | "children"> {
  to: string;
  replace?: boolean;
  state?: unknown;
  end?: boolean;
  children?: ReactNode;
  className?: string | ((state: { isActive: boolean; isPending: boolean }) => string);
}
export const NavLink = forwardRef<HTMLAnchorElement, NavLinkProps>(function NavLink({ to, className, end, state, ...props }, ref) {
  const location = useLocation();
  const isActive = end ? location.pathname === to : location.pathname === to || location.pathname.startsWith(`${to}/`);
  return <TanStackLink {...props} ref={ref} to={to} state={state as never} className={typeof className === "function" ? className({ isActive, isPending: false }) : className} />;
});
export const Link = NavLink;
export function BrowserRouter({ children }: { children: ReactNode }) { return <>{children}</>; }
export const MemoryRouter = BrowserRouter;