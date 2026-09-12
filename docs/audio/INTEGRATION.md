# Audio MVP integration contract

Implemented on `feature/eric-audio`, 2026-09-12. The current browser shell comes from the tracked HTML prototype. It is replaceable: neither the server nor `src/audio/controller.ts` imports it.

## Run

```sh
pnpm install --frozen-lockfile
cp .env.example .env  # Only if you do not already have .env.
# Add your OpenRouter key in either UI settings popup after starting.
pnpm dev
```

Open `http://127.0.0.1:4310`. Node 22.14+ and pnpm 11 are required. `pnpm-workspace.yaml` pins the 24-hour package-age guard and permits only the pinned esbuild build script. There is no application-framework dependency.

The server reads root `.env` at startup as an initial fallback. Keys saved in either settings popup persist in ignored `.data/audio-settings.json` with owner-only file permissions on macOS/Linux. Save and Remove take effect immediately for both versions. A saved value, including the empty value after removal, overrides `.env` across restarts. Removal disables future generation but does not delete an independently configured key from `.env`. Cached audio can still play. The file is local plaintext, not an encrypted keychain. `FISH_AUDIO_VOICE_ID` is optional; blank currently uses the provider default. Set a stable, tested Fish voice ID when choosing the production narrator. This MVP does not claim identity consistency for an unspecified provider-default voice.

## Replace the UI

1. The importer produces ordered `Passage[]`: stable `bookId`, `chapterId`, `passageId`, and exact `text`. IDs must survive reopening. Split large text with `splitPassage`; do not cross chapter boundaries.
2. Instantiate `AudioController` with a `MediaPort`, `AssetRepository`, and position-save callback. Import only from `src/audio/`; do not import the prototype shell.
3. Call `load(passages, savedPosition)`, bind `play`, `pause`, `seek(index)`, `setRate`, and `setMuted` to your UI, and render `subscribe` state updates.
4. Save positions from the callback and call `checkpoint()` on supported lifecycle events. Keep the controller above screen navigation, then dispose it when the app/player is actually torn down.
5. Browser adapters are provided in `src/audio/browser.ts`. A native client implements the same ports using native playback and storage. Native behavior has not been verified.

See `src/web/client.ts` for the bridge. `src/web/prototype/ui.js` contains presentation and inherited demo interactions. EPUB extraction remains isolated in `src/web/prototype/epub.js`; it is a browser prototype importer, not the shared production EPUB parser.

## HTTP boundary

`GET /api/audio/config` returns readiness and a narration profile. It never returns credentials. Profile IDs change when synthesis settings change.

`POST /api/audio/speech` accepts:

```json
{
  "text": "The gate opened slowly. A small bird waited beside the path.",
  "profileId": "the id returned by /api/audio/config"
}
```

Required headers: `Content-Type: application/json`, `X-Bookworm-Client: audio-v1`. Response: MP3 bytes, with optional `X-Generation-Id`. Errors are `{ "error": { "code": "...", "message": "..." } }`. Private upstream error bodies are never forwarded. The route enforces a 2,400 UTF-8 byte app cap, a 16 KB JSON body cap, two concurrent requests, 90-second upstream deadline, and an 8 MB audio response cap. These are application limits rather than claims about provider limits.

The backend defaults to `fish-audio/s2.1-pro-free:free`; users can explicitly select direct OpenAI GPT-4o Mini TTS and a built-in voice. Both request MP3. See [OpenAI configuration and API changes](OPENAI.md). There is no hidden model fallback, browser speech fallback, or automatic retry loop that can repeatedly spend credit. Play after a failure is the explicit retry.

The free endpoint is rate limited and has no production latency or availability guarantee. This selection was verified in the [OpenRouter model listing](https://openrouter.ai/fish-audio/s2.1-pro-free:free) on 2026-09-12. No automatic fallback to a paid model is configured.

`PUT /api/audio/key` accepts `{ "apiKey": "..." }`; `DELETE /api/audio/key` accepts `{}`. Both require the same JSON and `X-Bookworm-Client` headers as speech and return only `{ "configured": true/false }`. Updates are blocked while generation or another key update is active; pause other tabs and retry. Save checks input shape, not account validity; Play verifies real narration.

## Storage and privacy

- Imported books, prepared notes, and the prototype's library position stay in local browser storage. The original EPUB is not uploaded to this server.
- Current and one upcoming narration passage go through the local backend to the selected provider (OpenRouter/Fish or OpenAI) when Play is requested. Pause stops scheduling and cancels pending work where possible. An already dispatched request may still be billed upstream.
- Audio blobs and their actual SHA-256 rendition IDs are cached in IndexedDB. Four recent assets stay in memory; the persistent cache targets 64 MB and evicts older unpinned assets. No book content or audio is stored on the server.
- Resume positions use a separate browser namespace and contain IDs and milliseconds, not passage text. They are saved every two seconds during playback, on pause/seek, and on lifecycle notifications. Storage failures are visible.
- Reuse the offset only when the exact cached rendition matches. Missing/changed audio restarts the current passage with a visible notice. Browser eviction and clearing site data may remove offline assets or progress.
- The root `.env` is ignored. Keys entered into the password field are sent only to the same-origin server, cleared from the form, never returned by the API, and never written to browser storage. The server binds only to loopback, checks Host/Origin and request headers, and serves an explicit public-file allowlist. This is a local, single-user demo, not a public multi-user service. Remote/native-device access requires a reviewed authentication and networking boundary.

## Present limitations

- MP3 passages are completed before each begins; the book is generated progressively. Transitions use one HTMLAudioElement, so sample-perfect gaplessness is not promised.
- The current prototype shows approximate overall book time and highlights the current passage. It does not claim word alignment.
- The existing prepared companion remains visibly a demo; microphone and answer speech controls are disabled. No live question-answering model is added.
- EPUB support is the prototype's bounded text-only EPUB 2/3 spine parser. It rejects declared encryption, uses generated placeholder covers, and does not reliably detect story starts. The chapter list lets the user choose the start.
- Screen-off/background behavior, physical Android, Expo Go, and long-session listening quality remain separate acceptance checks.

## Verification commands

```sh
pnpm typecheck
pnpm test
pnpm build
python3 scripts/create-test-epub.py
# With pnpm start running and a valid key; one small live generation:
pnpm smoke:audio
```

Unit/HTTP tests use fixtures, not Fish narration. The smoke script writes only to ignored `output/audio/fish-smoke.mp3`. Do not commit generated audio, EPUBs, `.env`, `dist`, `output`, or `starter-kit`.

## Provenance

Original audio contribution: TypeScript controller, browser audio/cache adapter, OpenRouter provider adapter, HTTP server, tests, and build/smoke scripts. UI styles, sample writing, prepared companion, and bounded EPUB importer were adapted from `project_documents/bookwormAI-mvp.html`. The original prototype is unchanged. No starter-kit application source was copied.
