# BookWormAI

BookWormAI is an Expo Web/React Native hackathon project with a TypeScript
runtime and an optional Go service boundary. It turns a user's own EPUB files
into an audiobook-like reading experience: import a book, choose a chapter,
listen to AI narration, and continue from the last reading position.

> Status: clean-slate project setup. The inherited starter tree is preserved
> locally in the ignored `starter-kit/` folder for reference and is not part
> of the collaborative source tree.

## Product intent

BookWormAI is a quieter way to go deeper: listen to a book, interrupt to ask
about the current passage, and return later exactly where you left off. The
product is intentionally a simple bring-your-own-key experience. Users supply
their own OpenAI API key through settings reachable from the library; accounts,
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

| Surface | Responsibility |
| --- | --- |
| Expo Web/React Native client | Library, EPUB import, reader, playback, and optional native agent UI |
| TypeScript web runtime | Shared web experience and server-side AI boundary |
| Optional Go service | Add only when the team chooses a concrete service boundary |
| Shared typed modules | EPUB parsing, chapter extraction, reading position, and audio state |

The whiteboard also mentions Go. The starter kit is TypeScript-first today; add
a Go service only when the team has a concrete boundary for it. Keep the first
working interaction inside the existing web/mobile runtime so the demo has one
clear process to start and verify.

## What is preserved locally

The current application tree, assets, developer docs, packages, and root
tooling inherited from [`CopilotKit/agents-everywhere-starter-kit`](https://github.com/CopilotKit/agents-everywhere-starter-kit)
are in the local `starter-kit/` folder. That folder is ignored and will not be
available to teammates after a fresh clone.

BookWormAI work starts at the repository root with the product flow above.
Keep the distinction between reference material and new implementation clear
in pull requests and submission notes.

## Local setup

The application scaffold has not been selected yet. This repository is
intentionally limited to project notes and guardrails while the team builds
from scratch. When the scaffold is added, document its exact prerequisites,
install, and development commands here.

The inherited starter reference can be inspected locally at `starter-kit/`.
The source planning notes, UI prototype, and planning photos are checked in
under `project_documents/`; the product summary above is the concise team
reference derived from those materials.

### Environment variables

Copy `.env.example` to `.env.local` (or `.env` when required by the chosen
scaffold) and set `OPENAI_API_KEY` for local development. Real environment
files are ignored by Git. Do not rename this to an `EXPO_PUBLIC_*` variable or
bundle a team key into the Expo client; the eventual product flow is
bring-your-own-key through the app's settings.

Before choosing a scaffold, validate EPUB reading order/story-start behavior,
Expo Web and Expo Go support for import, parsing, audio, and persistence, the
safe API-key storage/removal boundary on web and Android, current OpenAI TTS
limits, and behavior when the key, network, or generation pipeline fails.

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
- Do not commit real `.env` files, credentials, EPUBs, generated audio, personal
  data, or large build output.
- `.env.example` is the tracked placeholder template; it must never contain a
  real key.

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
