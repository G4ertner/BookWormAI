# BookWormAI

One reader for your own books: add a DRM-free EPUB or TXT file, discover books on
Project Gutenberg, listen with OpenRouter or OpenAI, and resume where you stopped.
The simplified reader is the only application. Local and Cloudflare builds share its source.

## Run locally

Requires Node 22.14+ and pnpm 11.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open **http://127.0.0.1:4310/**. Existing `/simple/` links open the same app.
From Library → Narrator settings, save your provider key and choose a model/voice.
Optional environment setup: copy `.env.example` to `.env` and fill in a provider key.
Never overwrite an existing `.env`. Keys saved in settings override environment keys.

## Use

- **Add book → From your device:** choose an EPUB or TXT file under 10 MB.
- **Add book → Project Gutenberg:** search by title/author, click Add, then choose
  the downloaded EPUB when prompted. If the picker does not open automatically,
  click “Choose the EPUB you just downloaded.”
- Open the book on your shelf, select a chapter, and press Play. Narration prepares
  one passage at a time; speed, chapters, and saved position remain available.
- “Key saved” means stored, not accepted by the provider. Playback reports rejected
  credentials, credit/quota limits, and service errors separately.

Books and listening position stay in the same browser/origin. Localhost and the
hosted demo have separate libraries. EPUB front matter may be the first section;
use Chapters to select the story. Unsupported or encrypted EPUBs require a text export.

## Verify

```sh
pnpm check
# Optional live provider test against the running local server:
pnpm smoke:audio
```

`check` runs type checking, both builds, application tests, and Cloudflare tests.
Automated provider tests use fixtures. `smoke:audio` generates one short passage
using the selected provider and may consume quota/credit.

## Deploy to the existing Cloudflare demo

```sh
pnpm check
pnpm exec wrangler whoami
pnpm exec wrangler d1 migrations apply bookworm-simple-reader --remote
pnpm run deploy
```

See [deployment details](docs/DEPLOYMENT.md), [architecture](docs/ARCHITECTURE.md),
and [verification evidence](docs/VERIFICATION.md). Never add shared provider keys to
this public Worker. Saved keys are isolated by browser session and expire.

## Source map

| Path | Purpose |
| --- | --- |
| `src/simple/` | The sole reader UI and audio adapter |
| `src/books/` | Gutenberg catalog and bounded EPUB parsing |
| `src/audio/` | Playback, cache, resume, models and key-settings UI |
| `src/server/` | Shared speech provider; local and Cloudflare storage/HTTP adapters |
| `migrations/` | Existing Cloudflare D1 schema history |
| `tests/`, `scripts/` | Checks, build, sample EPUB generator and optional audio smoke |

Old interfaces and planning docs are recoverable from Git history. Pre-existing
untracked artifacts were moved to ignored `output/cleanup-archive-20260912/` during
cleanup. Personal settings, books, audio, and presentation assets are not application source.
