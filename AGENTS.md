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
