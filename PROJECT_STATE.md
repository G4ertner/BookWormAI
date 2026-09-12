# BookWormAI — current state

- **Goal:** repair hosted Add book → For you while preserving the single reader,
  Gutenberg import, narration and resume.
- **Branch/artifact:** `fix/hosted-for-you`, based on main `7abe7d8`, isolated in
  `output/hosted-for-you` so the ongoing reading-companion checkout is untouched.
  Exa keys can now be saved/removed from settings locally and on Cloudflare.
- **Hosted boundary:** no shared Exa key. Each secure browser session owns a
  write-only server-side key with a 24-hour expiry. D1 administrators can read it.
  Local keys persist in ignored `.data/exa-settings.json`; Remove masks `.env` fallback.
- **Deployment:** migration `0002_recommendation_keys.sql` applied; Worker version
  `8e568d91-6d48-4659-80b3-fe2fa1ec9a5c` deployed September 12, 2026 to
  https://bookworm-simple-reader.ericq-dev.workers.dev/ under ericq.dev@gmail.com.
- **Verification:** `pnpm check` passed (typecheck, both builds, 33 app tests,
  10 Worker tests); `pnpm exec wrangler deploy --dry-run` passed. Browser fixture:
  missing key → settings → save → search result → remove → missing-key state.
  Live: UI/settings, exact HTML/JS build match, disposable-session save/isolation/
  remove, audio independence and missing-key API verified; no console errors.
- **Next:** user saves their Exa key on the hosted origin, then submits Find books.
  Hosted real Exa provider acceptance and full import remain unverified. Source is
  on the isolated fix branch; do not include unrelated reading-companion work.
- **Commands:** `pnpm dev`; `pnpm check` (HTTP tests need loopback socket access).
  See `docs/BOOK_RECOMMENDATIONS.md` and `docs/DEPLOYMENT.md`.
- **Do not:** commit secrets/books/audio/output, expose a shared operator key,
  rewrite applied migrations, or overwrite another task’s checkout.
