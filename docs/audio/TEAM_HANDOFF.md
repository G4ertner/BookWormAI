# Team handoff: main app and simplified audio reader

Updated 2026-09-12. Continue from branch `feature/eric-audio`.
The main app remains the primary version; the simplified reader is an additional
team collaboration surface. Do not replace the main app when developing it.

## Start here

Requires Node.js 22.14+ and pnpm 11 (package manager pinned to 11.0.9).
For a new checkout:

```sh
git clone --branch feature/eric-audio https://github.com/G4ertner/BookWormAI.git
cd BookWormAI
pnpm install --frozen-lockfile
cp .env.example .env
```

In an existing checkout, fetch and switch to this branch without discarding local
changes. Do not overwrite an existing `.env`. Run the app, then enter the selected provider’s key in either version’s settings popup:

```sh
pnpm dev
```

| Version | URL | UI source |
| --- | --- | --- |
| Main, preserved | http://127.0.0.1:4310/ | `src/web/` |
| Simplified team reader | http://127.0.0.1:4310/simple/ | `src/simple/` |

Both are served by one process. `pnpm dev` builds once and starts the server;
there is no file watcher. Stop and rerun after source or `.env` changes, then
reload the browser. `pnpm start` serves the last build. Keep the origin consistent:
`localhost` and `127.0.0.1` have separate browser storage. Close or pause the other
version before listening so two tabs do not compete for the two generation slots.

The original standalone simplified HTML is local reference material. Everything
needed to run the team version is committed under `src/simple/`; neither
`prototypes/`, local TIE/planning notes, nor ignored `starter-kit/` is required.
Opening a `file://` prototype does not use this audio service.

## Current configuration

- Default model: `fish-audio/s2.1-pro-free:free`. Settings also offers direct OpenAI `gpt-4o-mini-tts` with 13 built-in voices. See [OpenAI setup and storage](OPENAI.md).
- Providers: OpenRouter for Fish; direct OpenAI for GPT-4o Mini TTS. Separate keys, explicit selection, no automatic fallback.
- API key: use Save/Remove in the settings popup. Keys persist server-side in ignored `.data/audio-settings.json` (owner-only file permissions on macOS/Linux, plaintext rather than OS keychain). The saved value overrides `OPENROUTER_API_KEY` in `.env`; an empty saved value keeps narration disabled after restart. Both versions share this local setting. Cached audio remains playable after removal.
- `FISH_AUDIO_VOICE_ID`: optional; blank uses the provider default. No fixed voice
  has been auditioned, and the UI's narrator-direction preference is preview only.
- `HOST=127.0.0.1`, `PORT=4310`: loopback demo. Remote-device/public access is not
  implemented. Do not enable public binding without choosing authentication.
- MP3, one passage playing plus one prefetched; no full-book conversion,
  within-passage streaming, automatic paid fallback, or automatic retry loop.
- The free endpoint is rate limited and has no production availability guarantee.
  These are the [listing's terms checked September 12](https://openrouter.ai/fish-audio/s2.1-pro-free:free), not a promise about uninterrupted playback.

## Where to work

| Work lane | Files / contract | Keep stable |
| --- | --- | --- |
| Simplified layout | `src/simple/index.html` | Main route and `src/web/` |
| Simplified interactions | `src/simple/ui.js` | Stable book/chapter/passage IDs; visible error and pause states |
| Audio/UI integration | `src/simple/client.ts` | Consume shared controller; keep credentials out of UI |
| Queue, cancel, resume | `src/audio/controller.ts`, `types.ts` | No DOM/provider dependencies in controller |
| Browser playback/cache | `src/audio/browser.ts` | Exact-rendition offset recovery; visible storage errors |
| Provider and server | `src/server/`, `src/audio/key-settings.ts` | Fixed model/profile validation, same-origin checks, private-file allowlist |
| EPUB importer | `src/web/prototype/epub.js` | Shared by both surfaces; test both after changing it |

The repository does not select individual teammate assignments. Pick a lane and
coordinate shared-file changes. The HTML and legacy UI JavaScript are bundled,
but are not covered by TypeScript's typecheck; verify UI edits in the browser.

## Audio integration contract

Import the types and controller from `src/audio/`, not either UI. The importer
provides ordered `Passage[]` with `{ bookId, chapterId, passageId, text }`.
Preserve IDs across reopening and do not cross chapter boundaries when splitting.
The current UI calls `splitPassage(text, 1000)` (UTF-8 bytes).

Instantiate `AudioController(media, assets, savePosition)`. Call
`load(passages, savedPosition, initialIndex)` before playback; bind `play`, `pause`,
`seek(index)`, `setRate` and `subscribe`. Save/checkpoint on lifecycle events.
See `src/simple/client.ts` for the small working adapter and
[INTEGRATION.md](INTEGRATION.md) for the HTTP request/response and limit details.

Books and positions live in browser storage. Only narration passages go to the
backend/provider. The simplified library uses `bookworm-simple-audio-v1` and
audio book IDs start with `simple:`; main and simplified progress do not overwrite
each other. Audio cache blobs are shared by content/profile. Clearing the main
app's audio cache may evict simplified audio too; missing audio restarts a passage
with a notice. Neither surface offers cross-device storage or backup.

## Acceptance and remaining work

Already observed: live Fish Free synthesis, progressive simplified-reader
playback, pause/reload/resume, speed change, EPUB spine order and completion,
and chapter selection. Automated coverage: 24 unit/HTTP tests, typecheck and
build. See [VERIFICATION.md](VERIFICATION.md) and
[SIMPLE_READER.md](SIMPLE_READER.md) for the scope of each observation.

Run these before handing off a change:

```sh
pnpm typecheck
pnpm test
pnpm build
python3 scripts/create-test-epub.py
```

Then run `pnpm start` and import `output/fixtures/audio-deflated.epub` at
`/simple/`. Play to the end, jump chapters, pause and reload, reopen and resume,
change speed, and switch books. Check that `/` still opens its own main UI.
For one short live provider check, run `pnpm smoke:audio` while the server runs.
It writes ignored `output/audio/fish-smoke.mp3`; tests themselves use fixtures.

Next bounded tasks, in order:

1. **Long listening acceptance:** listen for 20 minutes in `/simple/`; record
   gaps, pronunciation, narrator consistency, resume position and rate-limit
   failures. This is not yet verified. Do not equate HTTP success with voice quality.
2. **Team UI changes:** edit only `src/simple/` for the first iteration. Repeat
   the browser flow above; preserve the main version and shared contracts.
3. **Import coverage:** try representative user-owned EPUBs, especially front
   matter and long chapters. Automatic story-start detection is not reliable.
4. **Platform decision:** choose an Expo/native adapter only when the team needs
   it. Physical Android, Expo Go and background/screen-off playback are unverified.

Live questions/chat, narrator-direction synthesis, Gutenberg discovery, accounts,
and cloud storage are not implemented by this contribution.

## Troubleshooting

| Symptom | Next action |
| --- | --- |
| Key missing/rejected | Save a replacement in narrator settings, then press Play. Never paste the key into an issue or commit. |
| Narrator settings changed | Reload; the request's profile must match the restarted server. |
| Rate limited / two passages preparing | Pause other tabs, wait, then press Play to retry. Do not silently switch to paid narration. |
| Saved audio unavailable | Continue from the current passage start; verify browser storage permissions. |
| Changes do not appear | Rebuild/restart; `pnpm dev` does not watch files. |
| Port in use | Stop the previous server, or set `PORT` in `.env`; use that origin consistently. |

Keep feature commits focused. Never commit `.env`, `.data/`, keys, personal EPUBs, generated
audio, `output/`, `dist/`, dependencies, or `starter-kit/`. This handoff is a branch
delivery only; no PR, merge or deployment is part of it.
