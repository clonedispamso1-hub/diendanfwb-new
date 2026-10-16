# Website import and payment QR
- [x] Hide Bank/QR ellipsis and action sheet, sharing the existing gesture-disabled condition; regression tests preserve inline copy, QR zoom and ordinary-message classification.
- [x] Import inspected ZIP source, preserving components and existing DB configuration.
- [x] Fix payment QR parsing, card rendering and image zoom without DB changes.
- [x] Verify 23 regression tests, website sign-in rendering, QR card and zoom in browser without DB writes.
- [x] Report authenticated/provider verification blockers accurately.
- [ ] Verify an actual admin-to-user message on the old DB — blocked by unavailable existing authenticated session.
- [ ] Verify uploads and scheduled services — blocked by existing provider server secrets not configured in this project.
# Remove From Reply
- [x] Remove code, tab, cron route, tests; move SB4 SQL to _removed
- [ ] Run SB4 drop SQL — waits on Admin review (PENDING_2026-10-16_DROP_from_reply_SB4.sql)
