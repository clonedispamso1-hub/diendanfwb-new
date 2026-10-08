# Requested ZIP import and fixes
- [x] Import application source and preserve original component hierarchy and external database/auth configuration.
- [x] Make authenticated DevTools locking shortcut-only; guests, idle time, resize and logout must not trigger locks.
- [x] Apply smaller, centered article video sizing.
- [x] Verify automated tests, guest browser behavior and video at 375/390/430px and desktop.
- [x] Report exact differences from the ZIP and verification limits; real login checks require an existing external session.
- [ ] Real existing-account login → idle 30–60s → shortcuts → logout: blocked by unavailable external authenticated session.
- [ ] Live verification of retained R2/Cloudinary/Sheets and privileged server operations: original secrets are not provisioned in this new project. No service or DB configuration was changed.
- [ ] Immediate poster for every original post: source SingleVideo has no poster/thumbnail property. CSS-only scope preserves source behavior; adding absent posters requires user-approved media logic changes.

## Correct portrait video presentation
- [x] Remove forced 16:9 and preserve exact native metadata ratio, including very tall portrait videos.
- [x] Increase the overly reduced frame slightly, keeping it centered without cropping or changing controls/data.
- [x] Verify portrait 9:16, tall 1:3 and landscape 16:9 using real native video browser fixtures at 375/390/430px and desktop; playback and expanded viewer pass. All 93 regression tests pass; automatic build OK. Existing authenticated posts remain unavailable for direct account testing.

## Always-on DevTools Guard (supersedes original guest/logout behavior)
- [x] Remove login and route dependencies without changing authentication, data, or UI.
- [x] Real guest browser: F12, Ctrl+Shift+I/J/C and Cmd+Option+I/J/C navigate to about:blank; 60 seconds idle and resize/orientation events do not lock. Debugger attachment does not expose a reliable page signal; native Inspect/menu cannot be driven in headless browser.
- [x] All 23 Guard tests pass; automatic build OK; no browser page errors.
- [ ] Real logged-in browser shortcuts and logout continuity: no available external authenticated session. Guard no longer imports or reads authentication and never reinstalls on login/logout.

## Hardened DevTools/source protection
- [x] Block DevTools/view-source/save shortcuts and right-click site-wide; start at app load for all routes.
- [x] Detect DevTools opened before load / via menu / docked (debugger pause + size) and lock until closed.
- [x] Real-browser checks (real keys/mouse, headed Chrome). Logged-in session test blocked: no real login session available.
