# Changelog

All notable changes to StudioBubble are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/).

## [v0.3.0] — Downloadable desktop app for Windows and macOS

**Highlights:** StudioBubble now ships as an installable desktop app, not just a browser tab.

### Added
- Electron wrapper with a local static server (so the PWA service worker and absolute asset
  paths behave exactly as they do in a real browser tab, unlike loading over `file://`)
- Native screen/window picker for `getDisplayMedia`, backed by Electron's `desktopCapturer`
- `npm run electron:dev` / `electron:build` / `electron:build:mac` / `electron:build:win` /
  `electron:build:linux` scripts, packaged with electron-builder
- GitHub Actions release workflow (`.github/workflows/release.yml`) — push a `v*.*.*` tag to
  build Windows (`.exe`), macOS (`.dmg`), and Linux (`.AppImage`) installers and publish them
  to a GitHub Release automatically

### Known limitations
- The macOS build is unsigned (no Apple Developer account yet) — Gatekeeper will flag it as
  from an "unidentified developer"; right-click → Open the first time to run it
- The floating Document Picture-in-Picture control deck is a browser-only feature and is not
  available in the desktop build (it already degrades gracefully — the button just doesn't
  appear)
- macOS system-audio loopback capture has the same OS-level limitation as the browser version

## [v0.2.0] — Virtual backgrounds, live zoom, and a floating deck

**Highlights:** the camera bubble grows up — blur or replace your background, punch in and
spotlight regions live, wrap the take in a styled frame, and control it all from a floating
mini window.

### Added
- Virtual background for the camera bubble: blur your room or replace it with a curated
  backdrop, powered by MediaPipe selfie segmentation with a GPU→CPU delegate fallback and
  Auto/High/Balanced/Lite quality tiers
- Scene framing — wrap the whole recording in a padded, rounded, shadowed card over a curated
  backdrop (gradients, solids, or a content-aware blur of the screen itself)
- Live zoom & spotlight — drag on the stage to punch into a region or dim everything outside
  it, baked into the recording as you go (`Esc` / `0` resets)
- Floating control deck via the Document Picture-in-Picture API, with graceful fallback on
  unsupported browsers
- Review screen: trim, export to MP4/WebM/MOV, and a one-click audio enhance pass (peak
  normalize + high-pass de-rumble)
- Installable PWA, fully offline after first load

### Changed
- Recordings library now reads thumbnails and duration directly from the file via mediabunny,
  instead of just listing filenames

### Fixed
- Mic level meter no longer drifts out of sync after a pause/resume cycle

---

## [v0.1.0] — Initial release

**Highlights:** the core recording loop — capture, composite, encode, and save, entirely
client-side.

### Added
- Three layouts: screen + camera bubble, screen only, camera only
- Draggable camera bubble — circle or rounded, snap-to-corner (`1`–`4`), size + zoom-crop slider
- Crash-safe recording: canvas compositing → WebCodecs encoding (via mediabunny) → direct
  streaming to an OPFS file from a dedicated worker holding a `FileSystemSyncAccessHandle`,
  flushed every few writes
- On stop, the take is promoted from OPFS into a folder you choose (File System Access API),
  or stays in local browser storage if you skip that step
- Microphone controls: device picker, live level meter, noise suppression / echo cancellation /
  auto-gain
- Pause/resume, 3-2-1 countdown, keyboard shortcuts (`Space` pause, `S` stop, `M` mic, `C` bubble)
- Basic recordings library and light/dark theme

[v0.3.0]: https://github.com/vinay-madan/studiobubble/releases/tag/v0.3.0
[v0.2.0]: https://github.com/vinay-madan/studiobubble/releases/tag/v0.2.0
[v0.1.0]: https://github.com/vinay-madan/studiobubble/releases/tag/v0.1.0
