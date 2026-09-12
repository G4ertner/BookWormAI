# Bookworm — Project Gutenberg, direct

Rebuilt from your original `index.html`. No Gutendex, no third-party mirror: search goes straight to Project Gutenberg.

```
index.html          open this — your prototype with the compiled feature inlined
src/gutenberg.ts    the maintained source
build.mjs           compiles src/ and inlines it into index.html
test-catalog.mjs    40 browser tests
```

```
npm install && npm run build     # only if you edit the .ts
npm test                         # needs: npx playwright install chromium
```

Nothing needs building to try it — just open `index.html` in a browser.

## What I measured on the live site first

Everything below is from real requests to gutenberg.org, not assumption:

| endpoint | result |
|---|---|
| `/ebooks/search.opds/?query=austen` | 200, ~400 ms, ~62 KB, **`access-control-allow-origin: *`** |
| `/ebooks/1342.epub.noimages` | 200, **558 KB**, no CORS header |
| `/cache/epub/1342/pg1342.epub` | 200, 558 KB, no CORS header |
| `/cache/epub/1342/pg1342.txt` | 200, 772 KB, no CORS header |
| `/ebooks/1342.epub3.images` | 200, **24.8 MB**, no CORS header |

Two things follow, and they shape the whole design.

**Search works directly.** The OPDS feed is the one endpoint on the site that sends the CORS header, so a browser may read it. That's what the app now uses.

**Downloads can't be read by a page — ever.** No CORS header on any file path, and I checked every one that exists: `.epub`, `.txt`, `/cache/`, `/files/`, the `.txt.utf-8` and `.html.images` routes (both redirect to headerless paths), and an official mirror (xmission). Only `.opds` documents carry the header. I also tried two public CORS proxies as a workaround — both were down (Cloudflare 522), which is reason enough not to route your books through a stranger's server.

So **Add** does the most direct thing the browser permits:

- A one-time capability probe runs when you open the Gutenberg tab — a single cheap request against the smallest book in the catalogue. In a browser CORS refuses it before a byte moves, so it costs nothing.
- If reading is allowed (a packaged app, no same-origin policy), **Add imports in one click**, straight into My library.
- If it isn't (any browser), the Add click — while it still holds your click activation — starts the download *and* opens the file picker itself. You click Add, then pick the file that just landed in Downloads. Two clicks, no proxy, no server, no typing.

That second path is a platform limit, not a shortcut I took: a page cannot read a file the user hasn't handed it. The code is structured so that if you ever wrap this in a packaged app, the one-click path turns on by itself.

**Download EPUB** is a separate link on every row: it downloads the file and imports nothing.

**And always `.epub.noimages`.** The illustrated build of *Pride and Prejudice* is 24.8 MB against 558 KB for the same text — 44× the bytes for pictures a narrator never reads. That 24.8 MB file is what a Gutendex-driven build would have handed you, which is why real books were blowing past the 10 MB cap.

## Why this is faster than going through Gutendex

- **One request per search**, direct to the source — no intermediary hop.
- **Covers cost nothing.** The OPDS feed embeds each thumbnail as a base64 `data:` URL; about four fifths of the 62 KB response is images you've already paid for. The app renders them. Through Gutendex those same covers would each be a separate HTTP request.
- **Repeat searches cost zero requests.** Results are cached by URL (24 entries), so backspacing and retyping — the thing people actually do in a search box — is instant.
- **Typing costs one request, not six**: 350 ms debounce, and every new search aborts the one in flight.
- **No `mime_type` round trip.** The download URL is derived from the book id by convention, so there's no second lookup to find the EPUB.

Trade-off, stated honestly: the OPDS feed gives less metadata than Gutendex's JSON — no download counts, no subject tags, no language filter. If you later want faceted browsing, Gutendex is the better source. For a search box, this is leaner.

## Conventions in `src/gutenberg.ts`

- **Validate, don't trust.** Feed entries are shape-checked; navigation rows (an "Authors" entry Gutenberg mixes into results) are dropped by requiring `/ebooks/<digits>`.
- **Pin URLs.** The `next` link from the feed is re-parsed and pinned to gutenberg.org before it's followed; http is upgraded to https.
- **Escape everything rendered.** A feed title containing markup is shown as text — tested with an escaped `<img onerror=…>`.
- **Handle the race, both halves.** Abort the in-flight request *and* discard replies from superseded ones, or a slow reply for "ja" repaints over "jane austen".
- **Never show `fetch`'s raw message.** "Failed to fetch" is jargon; timeout, cancellation, HTTP error and unreadable-feed each say something specific.
- Emits a classic script with no `import`/`export` so it can be inlined — an external ES module won't load from `file://`.

## Tests

40 checks run the real page in headless Chromium against an OPDS fixture shaped like the live feed. They cover parsing and nav-row filtering, embedded covers, request count, the cache, pagination, the stale-response race, escaping, malformed XML, every error state, the no-images URL choice, the capability probe (once, cheapest book, not repeated), the download-then-pick flow (building a real EPUB in-page and parsing it), the separate Download action, landing in My library rather than the reader, catalogue metadata overriding embedded metadata, de-duplication, reload persistence, and the one-step direct-fetch path.

Two bugs surfaced while writing them — both in my test fixtures rather than the code, which is its own small reassurance: an unescaped `<` made the fixture feed malformed, and a page reload was wiping the injected stub.

## Still unverified

I couldn't make a live cross-origin request from a real page — my sandbox can't reach gutenberg.org, and the browser I can drive intercepts cross-origin calls. The CORS headers above were read from real responses, so the reasoning is sound, but the first genuine end-to-end proof will be you opening the file. If search fails, the status line will say whether it couldn't reach the site at all.
