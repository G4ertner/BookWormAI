# Book recommendations

Scope: Gutenberg book recommendations through Exa, locally and on Cloudflare.
The hosted repair lives on `fix/hosted-for-you`. Source delivery is tracked in Git
and `PROJECT_STATE.md`. Gutenberg books are free; Exa API usage may require credits.

## Use and connect

1. In Library, open **Add book → For you**.
2. Open **Recommendation settings**, enter your **Exa API key**, and **Save Exa key**.
   Close settings and return to **Add book → For you**. Describe a topic or mood,
   or select a reading idea, then **Find books**.
3. Read the source excerpt/link and **Choose book**. The Gutenberg tab presents
   that book; **Add** uses the existing EPUB download and file-picker flow.
4. Open the imported book from the shelf to read/listen as usual.

No API key is needed to inspect the UI. Searches show a missing-connection message
until a key is saved. Locally, settings persist in ignored `.data/exa-settings.json`
with owner-only file permissions. Developers can also use server-only `EXA_API_KEY`
in `.env` and restart; a saved key takes precedence and Remove disables that fallback.
On Cloudflare, the key is scoped to the current secure browser session and expires
24 hours after saving. It is stored server-side in D1 and is readable to database
administrators. The API never returns it. Remove the key on shared devices.
Never place keys in frontend code, browser storage, URLs or commits. Narration keys
are independent and are not used for search.

The Exa plugin in Codex is a development research tool; connecting it does not give
the running BookWormAI application an API credential.

## Contract and limits

- `GET /api/books/recommendations/config` returns only `{ configured: boolean }`.
- `PUT /api/books/recommendations/key` saves `{ apiKey: string }`; `DELETE` with `{}`
  removes it. Both require JSON and the existing client header. Keys are write-only.
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
- Cloudflare uses only the requesting browser session’s unexpired Exa key. No shared
  Worker key is used. Migration `0002_recommendation_keys.sql` creates independent
  settings; saving renews the same HttpOnly cookie. Hourly cleanup deletes expired
  rows. Same-origin, rate-limit and CSP guards apply; concurrent searches are bounded
  per session within a Worker isolate. This is not a global usage budget.

API source: [Exa Search reference](https://exa.ai/docs/reference/search), retrieved
through the Exa plugin on September 12, 2026. The integration uses native `fetch`.

## Verification

Run `pnpm check`: typecheck, local and Worker builds, application and Worker tests.
HTTP tests require permission to bind loopback sockets. Tests cover input validation,
provider errors, session isolation, write-only keys, removal, expiry, search concurrency,
local persistence and disabling the environment fallback.

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

### Hosted repair — September 12, 2026

`pnpm check` passed: 33 application tests and 10 Worker tests, typecheck and both
builds. Wrangler dry run passed. Fixture browser checks exercised the new settings
shortcut, save, successful search, removal and missing-key guidance with no real key.
Migration `0002_recommendation_keys.sql` was applied and Worker version
`8e568d91-6d48-4659-80b3-fe2fa1ec9a5c` deployed. Live checks confirmed exact asset
matching, settings UI, isolated disposable-session key save/remove, narration
independence, and missing-key errors. Dummy test data was removed. No hosted real
Exa call was made; the user must save their own Exa key and submit Find books.
