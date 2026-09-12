# Cloudflare deployment

Existing URL: https://bookworm-simple-reader.ericq-dev.workers.dev/

The root `wrangler.jsonc` pins Worker `bookworm-simple-reader`, account
`a0f25c7e4448e3cc309f66531f6bc68a` (ericq.dev@gmail.com), and D1 database
`84aab702-0060-46ef-8e55-eb2404ea4e85`. Reuse these resources. Wrangler is pinned in
the root package. No separate deployment checkout or dependency install is needed.

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm exec wrangler whoami
pnpm exec wrangler deploy --dry-run
pnpm exec wrangler d1 migrations apply bookworm-simple-reader --remote
pnpm run deploy
```

The migration filenames are preserved from the existing database so the migration
history remains valid. Add a new SQL migration for schema changes; never edit an
already-applied migration. Keep both historical tables, including the old private
settings table; public sessions cannot access the old email-owned records.

The reading-companion branch adds `0003_companion_exa.sql` for per-session Exa
keys. Apply it before publishing that feature. OpenRouter discussion uses the
existing session's OpenRouter key independently of narration selection. No shared
Exa key is supplied; each browser session can save its own in Reader settings.
See `docs/READING_COMPANION.md` for the feature's separate acceptance evidence.

The demo is public and supplies no operator provider key. A 256-bit secure HttpOnly
SameSite=Strict cookie scopes API settings to a browser session. Only the token hash
is stored. Settings expire after 24 hours without a write; hourly cleanup removes
expired rows. Exa settings use the independent `recommendation_settings` table
(migration `0002_recommendation_keys.sql`); apply it before deploying this version.
Each browser enters its own Exa key through Recommendation settings. No shared Exa
secret is used. Keys are server-side and readable to database administrators, never
returned by the API. On shared browser profiles, remove keys after use.

Requests are rate-limited per IP/Cloudflare location. Body, passage, audio-size and
concurrent-generation limits remain enforced. These controls are not a global billing
cap. Public traffic can consume hosting quotas. Same-origin write checks and CSP
remain; Gutenberg connections are limited to `https://www.gutenberg.org`.

For acceptance, open the hosted origin, search/add a book, save a provider key in
that browser, and test Play/pause/reload. Local success does not prove hosted provider
access. Main code, local files and server credentials are not included in public
responses; only the browser bundle and reader HTML are served.
