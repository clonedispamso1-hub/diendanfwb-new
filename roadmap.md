# Website import and payment QR
- [x] Hide Bank/QR ellipsis and action sheet, sharing the existing gesture-disabled condition; regression tests preserve inline copy, QR zoom and ordinary-message classification.
- [x] Import inspected ZIP source, preserving components and existing DB configuration.
- [x] Fix payment QR parsing, card rendering and image zoom without DB changes.
- [x] Verify 23 regression tests, website sign-in rendering, QR card and zoom in browser without DB writes.
- [x] Report authenticated/provider verification blockers accurately.
- [ ] Verify an actual admin-to-user message on the old DB — blocked by unavailable existing authenticated session.
- [ ] Verify uploads and scheduled services — blocked by existing provider server secrets not configured in this project.
# From Reply
- [x] Tab, SB4 SQL, server cron, triggers, rule tests
- [ ] Live run — blocked by missing server keys (SUPABASE1/3/4_SERVICE_ROLE_KEY, FROM_REPLY_CRON_SECRET), SB4 SQL run and publish
