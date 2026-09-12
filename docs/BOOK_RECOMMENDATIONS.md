# Book recommendations

Feature branch: `feature/book-recommendations`. First scope: free Gutenberg books,
as requested on September 12, 2026. This feature enables local search; hosted search
remains disabled. Source delivery is tracked in Git and `PROJECT_STATE.md`.

## Use and connect

1. In Library, open **Add book → For you**.
2. Describe a topic or mood, or select a reading idea, then **Find books**.
3. Read the source excerpt/link and **Choose book**. The Gutenberg tab presents
   that book; **Add** uses the existing EPUB download and file-picker flow.
4. Open the imported book from the shelf to read/listen as usual.

No API key is needed to inspect the UI. Searches show a missing-connection message
until the local server is configured. Add `EXA_API_KEY` to the existing ignored
`.env` without replacing other settings, then restart with `pnpm dev` (or
`pnpm start` after building). Never place the key in frontend code, browser storage,
URLs or commits. Narration keys are independent and are not used for search.

The Exa plugin in Codex is a development research tool; connecting it does not give
the running BookWormAI application an API credential.

## Contract and limits

- `GET /api/books/recommendations/config` returns only `{ configured: boolean }`.
- `POST /api/books/recommendations` accepts `{ query: string }` with 3–300 characters,
  JSON content type and the existing `X-Bookworm-Client: audio-v1` header.
- The shared service uses Exa `POST /search`, `type: auto`, twelve candidates,
  `includeDomains: ["gutenberg.org/ebooks/"]`, and source highlights. It returns at
  most six unique, canonical Gutenberg book-page URLs, page titles and excerpts.
- These are search matches, not generated reviews or guaranteed personalized
  recommendations. Results can vary in relevance and omit books Exa has not indexed.
  Excerpts are labeled as source text. Exa's page-author field is not treated as a
  book author; EPUB metadata is preserved when importing a recommendation.
- Only the submitted interest is sent. There is no automatic search on typing,
  shelf upload, full-book upload, new reasoning service or additional dependency.
- Local requests use existing host/origin/body guards, a single concurrent search,
  a 20-second upstream timeout and disconnect cancellation. Upstream error bodies
  are never forwarded. Invalid/missing keys, credits, rate limits, network failures,
  malformed responses, empty results and cancellation have explicit states.
- Cloudflare serves the same UI and guarded endpoints but deliberately has no shared
  Exa key. Search is unavailable there. A future hosted per-user search-key flow
  requires separate scope; adding a Worker secret alone will not enable this feature.
  Existing session, rate-limit, CSP and database behavior is preserved.

API source: [Exa Search reference](https://exa.ai/docs/reference/search), retrieved
through the Exa plugin on September 12, 2026. The integration uses native `fetch`.

## Verification

Run `pnpm check`: typecheck, local and Worker builds, 32 application tests and
7 Worker tests passed. HTTP tests require permission to bind loopback sockets.
New tests cover filtering/deduplication, bounded input/results, request shape,
credential redaction, errors, concurrency and hosted security/disabled behavior.

Browser checks used isolated servers with no real API keys: the production missing-key
path and a fixture-backed Exa adapter. Verified recommendation prompts/results,
source links, handoff to Gutenberg, EPUB picker/import, shelf/open/chapter order,
duplicate indicator, empty results, rejected key, cancellation and retry. An original
disposable EPUB fixture was used for the import check; this does not prove live Exa
relevance or the contents of a Gutenberg download. Narrow 390×844 layout was checked
for horizontal overflow and usable scrolling; real mobile-device acceptance is pending.

Live Exa acceptance passed on September 12, 2026 after the user supplied a local
key: a search for “A clever detective mystery with Sherlock Holmes” returned six
canonical Gutenberg book pages, including The Valley of Fear (3289), The Adventure
of the Dying Detective (8631), and A Study in Scarlet (244). This establishes key
acceptance and a relevant result for that query, not broad recommendation quality.
A full import of a live recommendation, hosted search, and new live narration
acceptance remain unverified. Next manual acceptance: choose a live result, inspect
its source page, download/import its EPUB, and open it from the shelf.
