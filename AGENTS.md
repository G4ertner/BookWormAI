# BookWormAI agent notes

BookWormAI has one application: the simplified reader in `src/simple/`. Both `/`
and `/simple/` serve it. Do not reintroduce the retired main UI or a separate hosted
frontend. Read `README.md`, `PROJECT_STATE.md` and canonical root `TIE.md` first.

## Product and architecture

- Keep the complete add-book → shelf → chapter → narration → pause/resume flow reliable.
- Support device EPUB/TXT import and the existing Gutenberg search/download/import path.
- `src/books/` owns catalog and parsing; `src/audio/` owns shared playback/cache/settings;
  `src/server/` has shared speech plus thin local Node and Cloudflare adapters.
- Build local and hosted output from the same UI, parser and speech source.
- Keep local and hosted storage boundaries explicit. Never put provider keys in client
  bundles, browser storage, public environment variables, source, logs or commits.
- Preserve existing browser library IDs, `.data/` settings and cloud database history.
- OpenRouter and OpenAI are explicit independent choices with separate keys and no fallback.
- Treat absent/rejected keys, quota, network and generation failures as user-visible states.
- Do not add chat, OCR, accounts, native/mobile or narrator-direction previews without scope.
- Validate file sizes/types, EPUB reading order and browser behavior. Do not claim live
  provider, hosted or device acceptance based only on static checks.

## Workflow

- Use pnpm, the root lockfile and `minimumReleaseAge: 1440`. Pin native dependency-build
  allowances to exact versions. No nested package installation is needed.
- Use an isolated branch for cleanup/refactors and preserve unrelated user work.
- Run `pnpm check` after meaningful changes. It typechecks and builds both runtimes,
  then runs local and Cloudflare tests. Repeat only for new changes or failures.
- For imports/playback/UI changes, check the actual browser flow. `pnpm smoke:audio`
  calls the selected live provider; distinguish it from mocked tests and respect scope.
- Save durable architecture/deployment/verification guidance in `docs/`. Keep live progress
  in the short root `PROJECT_STATE.md`; use `tie-project-memory` for durable TIE changes.
- Treat `output/`, `.data/`, `.env`, local archives, starter-kit and presentation assets as
  local artifacts, not application source. Do not commit credentials, EPUBs, generated
  audio, large build output, personal data or copied prototype/reference trees.
- Reuse the existing Worker/account/D1 in `wrangler.jsonc`. Keep security controls and
  migrations intact. Publishing, merging and deployment must be within user authorization.
- Keep PRs focused and include exact checks plus any unverified live/device behavior.
