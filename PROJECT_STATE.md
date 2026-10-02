# BookWormAI — current state

- **Goal:** let For you recommend from the reader's own shelf in one click, without
  adding a second recommendation path, credential or stored history.
- **Branch:** `feature/shelf-recommendations`, based on main `43a0707`.
- **Shape:** `shelfQuery` in `src/books/recommendations.ts` composes an interest from
  the titles and authors of the three most recently added books, newest first, and
  `runSearch` submits it through the existing `POST /api/books/recommendations`.
  Bundled samples are excluded, so a shelf holding only samples is reported rather
  than searched. No server, Worker, route, migration or key change: the saved Exa key
  and its `/config` gate are reused exactly as they are. Placeholder authors written by
  the importers (`ui.js` for TXT, `epub.js` for an EPUB with no creator) are dropped, so
  "Your personal library" is never sent as if it were an author.
- **Out of scope but included:** `scripts/build.mjs` used `new URL(...).pathname`, which
  on Windows yields `/D:/...` and made the Worker build fail with `D:\D:\...`. It now
  uses `fileURLToPath`, matching `src/server/index.ts`. Without this the project does not
  build on Windows at all; it is unrelated to recommendations and could be split out.
- **Boundary:** the shelf was previously never sent. It now leaves the browser only on
  an explicit button press, as titles and authors capped to 80/60 characters per field
  and 300 overall, written into the visible query field so the reader sees it. Book
  text, chapter text and book identifiers are still never sent. `TIE.md` intent and
  the For you panel copy were updated to match; the old "your shelf stays private"
  claim is gone.
- **Verification:** `pnpm check` passed — typecheck, both builds, 45 application tests
  (the shelf interest is one of them) and 11 Worker tests. Browser checks passed against
  the local server with no Exa key: samples-only shelf reports instead of searching and
  sends no request; two imported TXT books produced `Books like Flatland; The Country of
  the Blind` (newest first, samples excluded) and the POST body contained only that
  `query`; the missing-key error surfaced; both buttons disabled in flight with Cancel
  visible; Cancel and closing Add book mid-search both aborted and re-enabled them; the
  three idea chips still only prefill. The nowrap label needs 184px against 312px
  available at a 390px viewport, so it cannot overflow; a true narrow-viewport render
  was not captured because window resizing did not change the viewport on this display.
- **Not verified:** a live Exa search with a real key, Choose book → Gutenberg EPUB
  import from a live result, EPUB (rather than TXT) author metadata in the query, and
  anything hosted.
- **Next:** save an Exa key in Reader settings and press Find books like my shelf, then
  Choose book on a result to confirm the Gutenberg import handoff.
- **Deployment:** unchanged from main. Migration `0002_recommendation_keys.sql` is
  applied; `0003_companion_exa.sql` remains unapplied. Worker version
  `8e568d91-6d48-4659-80b3-fe2fa1ec9a5c` is deployed to
  https://bookworm-simple-reader.ericq-dev.workers.dev/ under ericq.dev@gmail.com.
  This branch is not deployed and hosted behavior was not re-verified.
- **Commands:** `pnpm dev`; `pnpm check` (HTTP tests need loopback socket access).
  See `docs/BOOK_RECOMMENDATIONS.md` and `docs/DEPLOYMENT.md`.
- **Do not:** commit secrets/books/audio/output, expose a shared operator key,
  rewrite applied migrations, send book text for recommendations, or overwrite
  another task's checkout.
