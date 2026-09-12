# Audio MVP verification

Observed locally on 2026-09-12, branch `feature/eric-audio`.

## Automated checks

- `pnpm typecheck` — passed.
- `pnpm test` — 17 tests passed: Unicode passage limits; ordered generation and one-passage prefetch; pause, cancellation, retry, seek and exact-rendition resume; corrupt-cache invalidation; playback speed/mute; OpenRouter payload and sanitized failures; HTTP origin/body/profile validation, concurrency and disconnect cancellation.
- `pnpm build` — passed; separate browser and server bundles produced.
- `python3 /Users/ericq/.codex/skills/tie-project-memory/scripts/validate_tie.py TIE.md` — passed.

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
