# Audio MVP verification

Observed locally on 2026-09-12, branch `feature/eric-audio`.

## Fish Free switch — 2026-09-12

- User selected `fish-audio/s2.1-pro-free:free`; the running local server was restarted with that exact model. No paid-model fallback is configured.
- Typecheck, build, and all 17 unit/HTTP tests passed after the switch.
- `pnpm smoke:audio` returned `audio/mpeg`, 125,804 bytes, in 2,459 ms using the existing server key and the provider-default voice. The ignored smoke output now contains this free-model sample, replacing the earlier paid-model sample.
- This verifies one real free-model generation. Earlier browser flow evidence below used the paid model; long-session playback and free-tier availability remain unverified.

## Simplified team reader

A separate `/simple/` surface now reuses the same audio controller and provider.
The current main surface remains `/`. All 18 tests passed; live simplified-reader
playback, reload recovery, speed, EPUB completion and chapter selection were
observed. See [team reader acceptance](SIMPLE_READER.md#observed-acceptance--2026-09-12).

## Initial audio MVP automated checks (before adding the simplified reader)

- `pnpm typecheck` — passed.
- `pnpm test` — 17 tests passed: Unicode passage limits; ordered generation and one-passage prefetch; pause, cancellation, retry, seek and exact-rendition resume; corrupt-cache invalidation; playback speed/mute; OpenRouter payload and sanitized failures; HTTP origin/body/profile validation, concurrency and disconnect cancellation.
- `pnpm build` — passed; separate browser and server bundles produced.
- Local project-intent validation also passed; that workstation-specific check is not a teammate setup requirement.

HTTP tests need permission to bind a loopback port in a restricted sandbox. The initial sandbox-only attempt could not bind; the permitted run passed. Tests use fixtures and do not call the paid provider.

## Live provider and browser evidence

- With the root `.env` configured, `pnpm start` served the app at `http://127.0.0.1:4310`.
- `pnpm smoke:audio` successfully synthesized an original short passage through OpenRouter using `fish-audio/s2.1-pro`. The MP3 response contained 115,355 bytes and arrived in 3,554 ms in this single run. `afinfo output/audio/fish-smoke.mp3` identified a valid 7.209688-second mono MP3 at 44,100 Hz. This is one observation, not a latency guarantee.
- The optional voice field was omitted; the provider default worked. A fixed Fish voice ID and narrator consistency across future generations have not been auditioned.
- In the browser, Play generated and advanced through original sample passages into chapter two. Pause showed approximately 0:09; after reload, Continue resumed from that displayed offset using cached audio and advanced normally.
- `python3 scripts/create-test-epub.py` created disposable original fixtures. The deflated fixture imported as **Audio MVP Test Book**. Its chapter order followed the spine despite the deliberately reversed manifest order. Playback completed all three passages across two chapters and reached End of book at approximately 0:13.
- Browser warning/error logs were empty after the exercised playback and import flows.

The original source prototype remains unchanged. Generated audio, EPUB fixtures, `.env`, dependencies, and build outputs are ignored and must not be committed.

## Still unverified

- Physical Android, Expo Go, screen-off/background playback, and native lifecycle recovery.
- A 20-minute listening session, audible transition quality, and fixed-narrator audition. Passage generation is progressive, but within-passage streaming and sample-perfect gaplessness are not implemented.
- Broad EPUB compatibility, reliable story-start detection, and browser storage-pressure behavior. Only the bounded inherited importer and the stated representative fixture were exercised here.
- Actual rejected/exhausted OpenRouter keys and provider outages were simulated in tests, not intentionally triggered against a paid account.

Next acceptance step: listen to a user-owned chapter for 20 minutes, exercise pause/reload/chapter changes, and choose a stable Fish voice if the provider default is unsuitable. See [the integration contract](INTEGRATION.md) to connect a different UI.

## Team handoff reproducibility — 2026-09-12

Exported the complete staged Git checkout into a clean temporary directory,
without `.env`, `prototypes/`, local planning notes, `starter-kit/`, or existing
build output. Installed with `pnpm install --offline --frozen-lockfile` using
the workstation's existing pnpm store. Typecheck, all 18 tests and build passed
from that directory. This proves the checked-in application is self-contained;
it does not claim a fresh network download or another operating system was tested.
A scan of all staged files found no occurrence of the configured OpenRouter key.

## Settings API-key entry — 2026-09-12

- Both versions now use the same settings form and local server endpoint. Key
  files have owner-only permissions on macOS/Linux and are excluded by `.data/`.
- Typecheck, build and 21 tests passed. Added coverage for saved-key reload,
  removal overriding environment fallback, restrictive file permissions, invalid
  input, active-provider replacement, cross-origin/header rejection, and absence
  of secrets in API responses.
- Browser checks used a dummy key on an isolated port 4311 server with a temporary
  settings directory. Save in `/simple/` cleared the input and showed success;
  `/` recognized the configured key, and Remove showed generation disabled.
  No warning/error logs appeared. The working server's actual key was not changed.
- Saving validates local input and persistence, not the OpenRouter account. Real
  key validity is checked when the user presses Play. Earlier live Fish narration
  evidence remains separate from these dummy-key setup checks.
