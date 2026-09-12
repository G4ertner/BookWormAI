# Combined book adding and narration

The combined demo is `/simple/`, served by the root application's `pnpm dev`.
It integrates the Gutenberg feature from commit `68208cf` with the shared audio
controller and provider-key settings. The original `/` interface remains available.

## Run

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open http://127.0.0.1:4310/simple/ . From Library, open narrator settings to save
an OpenRouter or OpenAI key and select its model. A saved key is not a successful
provider check; press Play to verify narration. Keys remain on the local server.

## Add a book

- **From your device:** select a DRM-free EPUB or TXT file under 10 MB. The parsed
  book appears on your shelf; open it when ready. Text content is limited to 3 MB.
- **Project Gutenberg:** search by title or author, then click Add. The browser
  downloads an EPUB. Select that file in the visible chooser to finish importing.
  If an automatic picker does not appear, click “Choose the EPUB you just downloaded.”
  Download EPUB is also available as a separate action.
- Results already on your shelf show “In library.” Books and progress survive
  reload in the same browser/origin. Existing main and simplified libraries stay separate.

Search reads Gutenberg's OPDS feed directly. The local server CSP permits only
`https://www.gutenberg.org` in addition to same-origin connections. No open download
proxy or new provider service was added. Search caching, debounce, pagination and
stale-response handling come from the search prototype. Pagination URLs are pinned
to the expected host/path; thumbnails accept bounded base64 raster data only.

## Editing boundaries

- `src/books/gutenberg.ts`: typed catalog module with host callbacks for EPUB parsing,
  shelf lookup and adding a book. It does not manage narration or credentials.
- `src/simple/ui.js` and `index.html`: combined catalog/library/reader interface.
- `src/audio/` and `src/server/`: shared playback, caching, progress and provider layer.
- `bookworm/`: preserved standalone search prototype, not the combined audio app.
- `deployments/cloudflare-simple/`: independent local deployment source; this consolidation
  does not publish changes to the existing Cloudflare or Sites demo.

## Verification on September 12, 2026

```sh
pnpm typecheck
pnpm test
pnpm build
```

All 27 tests passed, including Gutenberg URL restrictions, TXT chapter order and
limits, per-provider credentials, fetch receiver correctness, audio ordering and
resume behavior. HTTP tests require local loopback permission. Unit/provider tests
use fixtures; they do not make live paid requests.

Observed separately in the local browser: live Alice search returned 24 results;
the 133 KB Gutenberg EPUB parsed into 13 sections and was added to the existing shelf;
Fish narration played and advanced in the first story chapter. Pause at passage 10,
reload, reopen and Play restored chapter 2/passage 10 and resumed narration. A repeat
search showed the same Gutenberg ID as disabled “In library.” No API keys were exposed.

Limits: the EPUB's front matter remains as section 1; choose the story chapter with
Next chapter or Chapters. Broad story-start detection is not established. Exact audio
offset after reload was not measured in this acceptance pass. OpenAI live generation,
native/mobile/background playback, the standalone prototype's full browser suite,
and hosted search/audio integration were not tested here.
