# BookWormAI — current state

- **Goal:** one complete reader, retaining book import, Gutenberg discovery, narration,
  provider settings and resume. The simplified UI is now the only app at `/` and `/simple/`.
- **Active feature:** `feature/book-recommendations` adds Add book → For you for
  free Gutenberg matches via server-side Exa. Local API key loaded; setup and
  acceptance are in `docs/BOOK_RECOMMENDATIONS.md`. User authorized merge to main;
  Git/PR history identifies delivery. Deployment remains separate.
  Typecheck, both builds, 32 app tests and 7 Worker tests passed; fixture browser
  recommendation → picker → shelf → chapter plus error/cancel/retry checks passed.
  Feature preview: http://127.0.0.1:4393/ (`PORT=4393 pnpm start`).
  Preview restarted after the user saved `EXA_API_KEY`; config reports `configured: true`.
  Live Exa acceptance passed: the Sherlock Holmes query returned six relevant
  Gutenberg books. Next manual acceptance: import a live result. Hosted search
  stays disabled pending per-user keys.
- **Source delivery:** single-reader cleanup based on main `151f36a`, prepared on
  `refactor/simple-reader-only`. The user authorized push and merge to main; Git and
  pull-request history identify the delivered revision. Deployment is separate.
- **Source:** `src/simple/`, `src/books/`, `src/audio/`, `src/server/`.
  Local Node and Cloudflare share the reader and speech module. Root `wrangler.jsonc`
  and `migrations/` retain the existing deployment identity and schema history.
- **Run/check:** `pnpm dev` → http://127.0.0.1:4310/ ; `pnpm check`.
  Local server is running. Typecheck/build, 27 app tests, six Worker tests and
  Wrangler dry-run passed. Browser import, chapter order, real Fish playback,
  automatic passage advance and pause/reload/resume passed. See `docs/VERIFICATION.md`.
- **Cleanup:** retired UI, standalone search app, old plans/reports and duplicate
  deployment tree removed from active source. Untracked originals and prior state
  archived under ignored `output/cleanup-archive-20260912/`. Existing credentials,
  browser libraries, presentation work and generated media preserved.
- **Live boundary:** existing public Cloudflare version remains
  `1b97d88f-60c6-4387-a9e2-40944729f71c` at
  https://bookworm-simple-reader.ericq-dev.workers.dev/ . This cleanup is not deployed.
- **Next:** deploy the merged cleanup when requested. Follow README and
  `docs/DEPLOYMENT.md`; hosted real-key playback needs acceptance after deployment.
- **Do not:** commit secrets/books/audio/output, expose the local server publicly,
  add alternate UIs or overwrite existing D1 migration history.
- **Open limits:** broad EPUB compatibility, exact resume offset after cache changes,
  live OpenAI speech, mobile/background playback and hosted narration remain unverified.
  The portable profile ID may regenerate old local audio while retaining book/passage.
