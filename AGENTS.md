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
- Keep shared egg progress and opening as a separate in-flow chat strip; enable only through server-authoritative status and atomic opening validation, never PetWorld local inventory or chat-derived progress.
- Keep the imported component hierarchy and client-only application mount; TanStack owns navigation through the existing compatibility adapter to preserve page state.
- Keep the target starter's pinned framework dependencies and compatible UI primitives; add only dependencies missing from the imported source.
- Fix post videos in the existing PostMedia primitive using original URLs and native controls; image rendering remains unchanged.
- Scope playback coordination to post media: observe its owning card, pause offscreen and competing players, and release detached elements without affecting chat audio.
- Profile post thumbnails reuse the existing post URL resolver and paused native video frames; open existing media viewers without uploading or fetching new data.
- Import SQL as source references only, never execute it during this frontend migration; the user's existing external data and access rules must remain untouched.
- Simulated post likes live in Supabase #1 table simulated_post_likes (one row per post, admin-only writes via RLS, batched session-cached reads); the old admin_site_settings sim_likes_config is a temporary fallback until the table is verified, then removed.
