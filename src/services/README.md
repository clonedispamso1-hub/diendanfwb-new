# Services layer — Admin Panel

This folder is the **single seam** between the UI and the backend.
Today every service returns mock data. When the Admin Panel is complete
we will swap each function body for a Supabase query — the UI will not
need to change, only the internals of these files.

> **Do NOT** create SQL migrations or new tables yet. The schema below is
> a planning document, not a spec to run.

---

## Modules

| File                       | Responsibility                                           |
| -------------------------- | -------------------------------------------------------- |
| `types.ts`                 | Shared interfaces (`Report`, `Comment`, …) used by UI + services |
| `reports.service.ts`       | List / update / delete reports                           |
| `comments.service.ts`      | Fetch comments, hide/remove                              |
| `reputation.service.ts`    | Reputation history + adjustments                         |
| `notifications.service.ts` | User notifications feed + unread count                   |
| `admin.service.ts`         | Admin actions (lock, mute, pin, penalize, …)             |

All mutations return `ServiceResult<T> = { ok, data?, error? }` so the UI
can render toasts uniformly.

---

## Planned database (future — do not create yet)

### `profiles`
| column        | type        | notes                                    |
| ------------- | ----------- | ---------------------------------------- |
| id            | uuid (PK)   | = `auth.users.id`                        |
| username      | text unique |                                          |
| display_name  | text        |                                          |
| avatar_url    | text        |                                          |
| role          | enum        | `user` / `moderator` / `admin` — stored in a **separate `user_roles`** table in Supabase (never on profiles) |
| status        | enum        | `active` / `muted` / `locked` / `banned` |
| reputation    | int         | maintained by trigger on `reputation_history` |
| created_at    | timestamptz |                                          |

### `posts`
`id, author_id → profiles, title, content, media_urls text[], status, is_pinned bool, comments_locked bool, created_at, updated_at`

### `comments`
`id, post_id → posts (cascade), author_id → profiles, content, is_hidden bool, created_at`

### `reports`
`id, reporter_id → profiles, target_type ('post'|'comment'|'user'), target_id uuid, reason, details, status, handled_by → profiles, handled_at, created_at`

### `notifications`
`id, user_id → profiles, type, title, body, link, read_at, created_at`
Realtime channel per user: `notif:${user_id}`.

### `admin_logs` *(append-only audit trail)*
`id, admin_id → profiles, action, target_type, target_id, metadata jsonb, created_at`

### `reputation_history`
`id, user_id → profiles, delta int, reason, note, created_by → profiles, created_at`
Trigger updates `profiles.reputation` on insert.

### `pinned_posts`
`post_id → posts (PK), pinned_by → profiles, pinned_at` — enforce one-pin-per-scope via partial unique index later.

### `banned_words`
`id, word citext unique, severity ('soft'|'hard'), created_by → profiles, created_at`

### Relationships
```
auth.users 1─1 profiles 1─* posts 1─* comments
                       │
                       ├─* reports (as reporter)
                       ├─* notifications
                       ├─* reputation_history
                       └─* admin_logs (as admin_id)
posts 1─0..1 pinned_posts
```

### RLS (planning)
- `profiles`: self-read + admin-read; self-update non-privileged fields.
- `posts` / `comments`: public read of non-hidden; owner write; admin override via `has_role(auth.uid(), 'admin')`.
- `reports`: reporter can insert + read own; admin can read all + update status.
- `admin_logs`: admin-only read, insert via SECURITY DEFINER RPC.

---

## Migration checklist (later)

1. Create `user_roles` + `has_role()` per Supabase best practice.
2. Create the tables above with `GRANT` blocks + RLS policies.
3. Replace each mock body in `*.service.ts` with the real query.
4. Delete `_mock.ts` and the mock arrays.
5. Wire realtime for `notifications`.
