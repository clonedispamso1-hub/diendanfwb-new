<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture
- Preserve the imported component hierarchy and client-only application mount; TanStack owns navigation through the imported compatibility adapter to retain page state.
- Keep imported SQL and integration configurations as source references only; frontend imports must never execute database migrations.
- Group badges and profile popups share query-cache-scoped public owner reads, batched memberships, and a visible catalogue; one deduplicated list drives both count and popup without elevated access.
- Retain imported CDN media pointers and favicon rather than storing duplicate binary assets.
- The react-router-dom compat `useNavigate` must return a stable (memoized) function; many effects depend on it and an unstable identity causes re-run loops (e.g. repeated auth checks).
- Admin session identity (`fetchCurrentBangchu`) reuses the access guard's token-keyed verified uid and keeps a short in-memory, token-keyed row cache with in-flight dedupe; remounts of admin pages must not re-hit /auth/v1/user or bangchu, while token changes and TTL expiry still force a real re-check.
