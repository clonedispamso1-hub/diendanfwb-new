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
- Post Reply messages keep their encoded snapshot and render a compact author/date/caption/ID reference with GIF-only media in Chat and compose; suppress their actions without changing normal messages or the old database.
- Keep the existing multi-database router and remote database configuration intact; UI-only changes must not alter data routing or Like behavior.
- Keep SSR-visible initial state deterministic; read browser storage only after hydration to prevent blank-screen mismatches.
