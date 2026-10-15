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

- Preserve the imported TanStack route tree, navigation compatibility adapter, component organization and central database router; this keeps existing screens and data ownership intact.
- Payment QR presentation must decode legacy content tokens without changing stored messages or schema, and strip malformed tokens from every text fallback to avoid leaking internal payloads.
- Level-3 IP bans are checked by a server function reading cf-connecting-ip (never a client-sent IP); failed checks return unverified and are never cached as clean.
- Post quota/fee: Supabase 1 RPC reserve_post_slot decides price/free slots and signs a one-use ticket; Supabase 3 posts trigger rejects inserts without a valid ticket, so every post insert must go through createPostCompat or insertPostWithTicket (lib/post-quota.ts).

- Second-account (Admin Panel) posts use a SB1-signed `internal` post ticket (`reserve_internal_post_ticket`) checked by the SB3 posts trigger; never bypass the trigger by client flags — keeps real-user fee/free-quota enforcement intact.
