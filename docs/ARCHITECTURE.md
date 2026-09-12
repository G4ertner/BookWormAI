# Architecture

There is one browser application in `src/simple/`. Both `/` and `/simple/` serve it;
`/simple/` is retained so existing bookmarks and same-origin libraries keep working.
No separate main UI, chat demo or browser-speech prototype is shipped.

The UI connects to `AudioController` through small callbacks. EPUB parsing and the
Gutenberg catalog live in `src/books/`; library persistence remains browser-local.
Catalog results use bounded, escaped metadata and pinned Gutenberg URLs. Browser
CORS can require download followed by file selection when adding Gutenberg books.

`src/server/speech.ts` is shared by both runtimes. It sends credentials only to their
selected provider and returns bounded MP3 responses with sanitized errors. There is
no automatic provider fallback. The portable profile identity matches the deployed
Cloudflare format; the first local run after this cleanup may regenerate previously
cached audio, while retaining the book and passage position.

Local Node binds only to loopback. Settings are persisted atomically in ignored
`.data/` files with owner-only permissions. An explicit removed key disables its
`.env` fallback. Cloudflare uses the existing D1 tables and a random HttpOnly cookie
whose hash identifies a browser session. The shared settings UI reads `keyStorage`
from the config endpoint to show the correct local or hosted retention explanation.

`pnpm build` produces one browser bundle, a Node server and a Cloudflare Worker.
The Worker embeds the same HTML and JavaScript. Rebuilding removes obsolete bundles;
there is no second dependency lockfile or copied frontend to synchronize.

Narrator-direction preview, prepared chat responses, old UI assets and alternate
prototypes were retired. Chapter navigation, speed, bookmarks, import, narration,
provider selection and resume remain. The existing simplified-reader storage key
and book IDs are preserved. No stored user books or credentials are migrated/deleted.
