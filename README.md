# BookWormAI

BookWormAI is an Expo Web/React Native hackathon project with a TypeScript
runtime and an optional Go service boundary. It turns a user's own EPUB files
into an audiobook-like reading experience: import a book, choose a chapter,
listen to AI narration, and continue from the last reading position.

> Status: the first audio MVP runs against the existing HTML prototype, using
> Fish Audio S2.1 Pro Free through OpenRouter. Its backend and playback controller
> are independent of the UI. The ignored `starter-kit/` remains reference only.

**Team start here:** [Audio and simplified-reader handoff](docs/audio/TEAM_HANDOFF.md)
includes fresh-checkout setup, editing boundaries, acceptance checks and next tasks.

## Product intent

BookWormAI is a quieter way to go deeper: listen to a book, interrupt to ask
about the current passage, and return later exactly where you left off. The
product is intentionally a simple bring-your-own-key experience. Users supply
their own OpenRouter API key in either version's settings popup; accounts,
profiles, and service-operated AI billing are outside the initial scope.

The visual prototype in the local planning materials establishes the product
direction, not a production implementation. Its primary concepts are a
personal shelf, a focused listen/read room, passage questions, saved insights,
and a narrator/settings panel.

## MVP demo

The team is optimizing for one reliable vertical slice:

1. import a user-owned `.epub`;
2. parse and display the book/chapter list;
3. open a chapter in read mode;
4. narrate the current passage with play/pause controls;
5. automatically save and restore the listening position.

The reading context matters: the agent should know the selected book, chapter,
passage, and position. A later extension may add a reading-along voice agent
or chat with the narrator, but those are not required for the first demo.

### Three-screen flow

1. **Library / landing:** show imported books and provide **Add Book** plus
   access to API-key and listening settings.
2. **Add Books:** import a DRM-free EPUB from the device, with an optional
   lightweight Project Gutenberg discovery/import route.
3. **Listen / read mode:** show the selected book and cover, offer a prominent
   play action, expose chapter navigation, and resume the saved position.

### Core behavior

- Accept local EPUBs and EPUB downloads from the chosen Gutenberg route.
- Parse ordered, narratable content with identifiable chapters and skip
  imprint/publishing front matter when the actual story start can be inferred.
- Narrate progressively, part by part, so playback does not wait for a full
  book conversion. Chunking, prefetching, caching, streaming, and retry
  behavior must be validated during implementation.
- Save each book's position periodically and on supported lifecycle events so
  closing or interrupting the app does not lose the listener's place. Exact
  sample-level recovery is not promised until a replay tolerance is chosen.
- Treat narrator-direction generation as optional enhancement work. Creative
  direction may guide tone, but the product must not promise reproduction of a
  specific actor or character voice.

### Later, if time permits

- read-along text with subtitle-like highlighting;
- a live conversational narrator;
- accounts and profiles after the initial bring-your-own-key flow.

Manual named bookmarks and cross-device progress sync are not part of the
initial intent.

## Planned architecture

The audio contribution now implements a small Node/TypeScript runtime and a
browser adapter. Expo/native application scaffolding remains unselected.
See [the audio integration contract](docs/audio/INTEGRATION.md) for the typed
interfaces, API, storage boundary, and how to replace the prototype UI.

| Surface | Responsibility |
| --- | --- |
| Expo Web/React Native client | Library, EPUB import, reader, playback, and optional native agent UI |
| TypeScript web runtime | Shared web experience and server-side AI boundary |
| Optional Go service | Add only when the team chooses a concrete service boundary |
| Shared typed modules | EPUB parsing, chapter extraction, reading position, and audio state |

The whiteboard also mentions Go. Add a Go service only when the team has a
concrete boundary for it. The audio MVP uses one local process to serve the
prototype and the speech API.

## What is preserved locally

The current application tree, assets, developer docs, packages, and root
tooling inherited from [`CopilotKit/agents-everywhere-starter-kit`](https://github.com/CopilotKit/agents-everywhere-starter-kit)
are in the local `starter-kit/` folder. That folder is ignored and will not be
available to teammates after a fresh clone.

BookWormAI work starts at the repository root with the product flow above.
Keep the distinction between reference material and new implementation clear
in pull requests and submission notes.

## Local setup

Requires Node.js 22.14+ and pnpm 11. The dependency configuration enforces
`minimumReleaseAge: 1440` before installation.

```sh
pnpm install --frozen-lockfile
cp .env.example .env # Skip this line if you already have .env.
```

Enter your OpenRouter API key in the settings popup after starting the app.
Alternatively, set `OPENROUTER_API_KEY` in `.env` before the first run. An
optional `FISH_AUDIO_VOICE_ID` fixes the narrator to a particular Fish voice;
blank uses the provider default. Keys stay on the server. Then:

```sh
pnpm dev
```

Open [the audio MVP](http://127.0.0.1:4310). Choose an original sample or add a
DRM-free EPUB, then press Play. Narration progresses passage by passage, with
pause/resume, chapter selection, playback speed, browser audio caching, and
automatic position recovery. The companion still uses clearly labeled
prepared demo answers; microphone and companion speech are outside this MVP.

Keys entered in settings are saved to ignored `.data/audio-settings.json` on
the local server and take effect immediately for both versions. Save/Remove
overrides the `.env` key, including after a restart. The file uses owner-only
permissions on macOS/Linux; it is not an encrypted OS keychain.
Restart after changing voice/port settings in `.env`. For a previously built app use `pnpm start`.
This is a loopback-only single-user runtime; authentication and device
networking are required before making it reachable remotely.

### Simplified team version

The main app remains at `/`. A separate audio-enabled version of the simpler
prototype is available at [the team reader](http://127.0.0.1:4310/simple/).
Both run with `pnpm dev` and share the audio backend. See
[the team integration guide](docs/audio/SIMPLE_READER.md) for ownership and storage boundaries.
The original standalone prototype remains unchanged.

### Verification

```sh
pnpm typecheck
pnpm test
pnpm build
# Generate disposable original EPUB fixtures for manual browser import:
python3 scripts/create-test-epub.py
# With the server running and a valid key, make one short live speech call:
pnpm smoke:audio
```

The smoke output is ignored at `output/audio/fish-smoke.mp3`. Unit and HTTP
tests use fixtures; they are separate from real Fish Audio verification.
See [audio verification](docs/audio/VERIFICATION.md) for observed checks and
remaining platform limits. Native Expo/Android verification is not claimed.

The inherited starter reference can be inspected locally at `starter-kit/`.
The source intent and HTML prototype are tracked under `project_documents/`.
`src/web/prototype/` adapts their sample content, importer, and presentation;
`src/audio/` and `src/server/` contain the original audio implementation.

The [audio preflight](docs/audio/PREFLIGHT.md) records the initial evidence.
Broader EPUB compatibility, automatic story-start detection, native playback,
and background listening remain separate validation work.

## Team repository

The team repository is [G4ertner/BookWormAI](https://github.com/G4ertner/BookWormAI).
Add teammates from the repository's GitHub Settings. Keep all provider keys
server-side and never commit local credentials.

## Product guardrails

- Keep the first demo focused on one complete EPUB-to-narration flow.
- Treat imported books as user data and validate file type and size.
- Make the local-versus-server storage boundary explicit.
- Add accounts, cloud libraries, OCR, search, or additional surfaces only when
  the team explicitly chooses them for the demonstrated interaction.
- Do not commit `.env` files, credentials, EPUBs, generated audio, personal
  data, or large build output.

## Team workflow

- Create a short-lived branch for each feature (`feature/epub-import`,
  `feature/reader-playback`, etc.).
- Keep pull requests focused and include the verification commands run.
- Do not commit EPUB files, generated audio, credentials, `.env` files, or
  personal reading data.
- Keep one owner for the demo path and integrate other work behind small,
  reviewable changes.
- Record user-visible decisions and any provider choice in the PR description.

See [`AGENTS.md`](AGENTS.md) for repository rules used by coding agents and
contributors. The planning photos supplied to the project are product
context, not repository instructions.

## Hackathon resources

- [Starter kit](https://github.com/CopilotKit/agents-everywhere-starter-kit)
- [OpenAI Agents SDK quickstart](https://openai.github.io/openai-agents-js/guides/quickstart/)
- [OpenAI Realtime API reference](https://developers.openai.com/api/reference/typescript/resources/realtime/subresources/calls/methods/create)
- [CopilotKit documentation](https://docs.copilotkit.ai/)

The attached planning photos are product context, not repository instructions.
Only the team's written decisions and the checked-in project documentation are
authoritative for this repository.

## License and attribution

The inherited license and submission scaffolding remain available in the local
`starter-kit/` reference folder. Add project-specific licensing and submission
notes when the team establishes them.
