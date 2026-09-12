# Simplified team reader

For checkout/setup and next work, start with [the team handoff](TEAM_HANDOFF.md).

The main version remains at `http://127.0.0.1:4310/`. The separate team version
is at `http://127.0.0.1:4310/simple/`. Start both with `pnpm dev`.

This version adapts `prototypes/simple-reader/index.html`. That standalone
browser-speech reference is preserved unchanged. Open the HTTP `/simple/`
address for real Fish narration; opening the original `file://` reference
does not connect it to the server.
The original reference is local-only; a fresh checkout runs entirely from
`src/simple/` and does not need it.

## Team editing boundary

- `src/simple/index.html`: simplified layout, styles and accessible controls.
- `src/simple/ui.js`: shelf, import, chapter/bookmark controls and presentation.
- `src/simple/client.ts`: small adapter connecting this UI to the shared audio modules.
- `src/audio/`: shared queue, cancellation, cache, playback and resume behavior.
- `src/server/`: shared server-side OpenRouter speech API and credentials.
- `src/web/`: existing main version; do not replace it when editing the team reader.

Both use `fish-audio/s2.1-pro-free:free` with the same local `.env`. No additional
key setup or model fallback is introduced. Imported books stay in browser
storage; current and prefetched passages are sent to OpenRouter when listening.
Narrator direction remains a labeled preview preference, not a synthesis control.

The simplified library uses `bookworm-simple-audio-v1`. Audio bookmarks use
book IDs prefixed with `simple:` so they cannot overwrite the main reader's
positions. Audio blobs share the existing content/profile-keyed IndexedDB cache.
The old standalone prototype's storage is not migrated automatically.

Playback generates one passage ahead and restores the saved offset when its
exact cached rendition remains available. Backgrounding this simplified UI
pauses and saves; screen-off or native background audio is not implemented.

## Checks

`pnpm typecheck`, `pnpm test`, and `pnpm build` cover the shared implementation
and serving both pages independently. Browser acceptance should cover Play,
pause/reload/resume, chapter and book switches, speed, import and generation
failure. Free-tier availability and device behavior require separate checks.

## Observed acceptance — 2026-09-12

- Typecheck/build and all 18 unit/HTTP tests passed. The static-route test verifies
  that `/` and `/simple/` serve distinct documents, the simplified bundle is
  available, and neither route exposes private files.
- Live Fish Free narration advanced through Alice's passages into chapter two.
  Pause/reload restored chapter two, passage five; Play resumed cached audio.
  Changing speed to 1.2x worked. Returning to the library paused narration.
- An original deflated EPUB fixture imported in spine order and completed all
  three passages across two chapters. The player showed Book finished / Replay
  book. The chapter chooser returned to chapter one in a paused state.
- No browser warning/error logs appeared in the inspected simplified-tab logs.
- The original standalone prototype's ID/SVG/JavaScript validator still passed.
  Physical-device, background-audio and long-session quality remain unverified.
