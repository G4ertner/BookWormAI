# BookWormAI

BookWormAI is an Expo Web/React Native hackathon project with a TypeScript
runtime and an optional Go service boundary. It turns a user's own EPUB files
into an audiobook-like reading experience: import a book, choose a chapter,
listen to AI narration, and continue from the last reading position.

> Status: clean-slate project setup. The inherited starter tree is preserved
> locally in the ignored `starter-kit/` folder for reference and is not part
> of the collaborative source tree.

## MVP demo

The team is optimizing for one reliable vertical slice:

1. import a user-owned `.epub`;
2. parse and display the book/chapter list;
3. open a chapter in read mode;
4. narrate the current passage with play/pause controls;
5. bookmark and restore the current position.

The reading context matters: the agent should know the selected book, chapter,
passage, and position. A later extension may add a reading-along voice agent
or chat with the narrator, but those are not required for the first demo.

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
