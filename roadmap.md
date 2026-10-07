# Import and post media fix

- [x] Remove video download UI/mechanisms across Post/Profile media viewers while retaining playback controls.
- [x] Render image/video post thumbnails in the existing Profile Photos grid and open existing viewers.
- [x] Verify thumbnail rendering and viewers at 375/390/430px and desktop: 15 tests passed, paused video frames render, both viewers open, video plays, no download buttons or browser errors. Browser used the existing WebM fixture because sandbox Chromium cannot decode the original Catbox MP4; signed-in Profile data readback remains unverified.
- [x] Bound expanded videos to a safe lightbox without changing normal card size; previous client-only download has now been removed as requested.
- [x] Pause PostMedia players when their owning card leaves the viewport, clean up on unmount, disable floating/remote playback, and coordinate competing post players without affecting chat audio.
- [x] Verify lightbox, download and post-video playback lifecycle at 375/390/430px and desktop: 11 passing tests; browser confirms offscreen pause, playback on return, competing-player pause and modal close. Downloads verified through a temporary WebM browser fixture; normal cards remain unchanged.
- [ ] Identify the separately described “listen/music” button if it is not the video's native audio control. Blocker: no standalone music/audio button exists in the imported PostCard hierarchy; need the user's screenshot or exact page/button to reproduce without modifying unrelated chat players.
- [x] Import inspected source, preserving component structure and old database configuration.
- [x] Correct direct-video detection/rendering in the actual Post Card media component only, including the zero-width shrink-wrap container.
- [x] Verify image behavior and video attributes: eight passing tests; responsive player checks at 375/390/430px and desktop with a compatible test video.
- [x] Record verification limits without changing data: the original Catbox MP4 downloads successfully (H.264/AAC), but sandbox Chromium cannot decode it even when its original bytes are served locally; responsive playback checks used a temporary WebM transcode via browser interception, not an app URL or upload change. Authenticated admin-to-feed playback remains unverified.