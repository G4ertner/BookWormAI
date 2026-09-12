# BookWormAI

BookWormAI is an Expo Web/React Native hackathon project with a TypeScript
runtime and an optional Go service boundary. It turns a user's own EPUB files
into an audiobook-like reading experience: import a book, choose a chapter,
listen to AI narration, and continue from the last reading position.

> Status: initialized from the Agents, Everywhere starter kit. The
> BookWormAI product flow is the team's event work and is not implemented yet.

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

## Starting architecture

| Surface | Responsibility |
| --- | --- |
| `apps/mobile` | Expo app for library, reader, import, playback, and native agent UI |
| `apps/web` | Next.js runtime and web surface; also serves the mobile CopilotKit endpoint |
| `packages/agent-core` | Shared agent factory, prompts, and provider configuration |
| `SUBMISSION.md` | Hackathon evidence, provenance, and final demo checklist |

The whiteboard also mentions Go. The starter kit is TypeScript-first today; add
a Go service only when the team has a concrete boundary for it. Keep the first
working interaction inside the existing web/mobile runtime so the demo has one
clear process to start and verify.

## What is inherited vs. new

Inherited from [`CopilotKit/agents-everywhere-starter-kit`](https://github.com/CopilotKit/agents-everywhere-starter-kit):

- Expo/React Native shell and headless CopilotKit integration;
- Next.js web runtime, provider plumbing, and mobile endpoint;
- sample agent tools, UI patterns, tests, and verification scripts;
- hackathon rules, sponsor notes, and submission scaffolding.

BookWormAI event work:

- EPUB import and parsing;
- library and reader experience;
- narration/audio pipeline and playback state;
- bookmark/position persistence;
- book-aware agent context and the final demo workflow.

Keep this distinction current in [`SUBMISSION.md`](SUBMISSION.md) and in pull
requests. Renaming the sample finance app is not, by itself, a new project.

## Local setup

Prerequisites: Node.js 22+ and npm. Go is optional until the team adds a Go
service.

```bash
git clone <your-bookwormai-repository-url>
cd BookWormAI
npm ci
Copy-Item .env.example .env   # PowerShell
```

For the Expo app, install its isolated dependencies once:

```bash
npm ci --prefix apps/mobile
```

## Publish the team repository

The team repository is published at
`https://github.com/G4ertner/BookWormAI`. For a fresh checkout before the
initial publication, authenticate GitHub, create the repository, and repoint
`origin` before pushing:

```bash
gh auth login -h github.com
gh repo create BookWormAI --public
git remote set-url origin https://github.com/<your-github-owner>/BookWormAI.git
git add .
git commit -m "Initialize BookWormAI from hackathon starter kit"
git push -u origin main
```

Use `--private` instead of `--public` if the team does not want the source
public yet. Add teammates from the repository's GitHub Settings after the first
push.

Add credentials to `.env` locally. Do not commit that file or put server keys
in `EXPO_PUBLIC_*` variables.

At minimum, choose one provider:

```dotenv
MODEL_PROVIDER=openai
OPENAI_API_KEY=your-key
MODEL=gpt-5.6-sol
```

OpenRouter is supported by the starter's shared provider settings if the team
chooses it instead. CopilotKit Intelligence, Exa, Auth0, and Ambiguous AI are
optional integrations; add them only when a demonstrated BookWormAI workflow
needs them.

## Run the apps

Start the shared web runtime:

```bash
npm run dev:web
```

Open `http://127.0.0.1:3100` for the web surface. In another terminal, start
Expo:

```bash
npm start --prefix apps/mobile
```

The default mobile runtime is
`http://localhost:3100/api/mobile-copilotkit`. For an Android emulator use
`http://10.0.2.2:3100/api/mobile-copilotkit`; for a physical phone, configure a
deliberately reachable runtime URL in `apps/mobile/.env` and keep the network
boundary trusted.

## Verify changes

```bash
npm run typecheck
npm test
npm run build --workspace web
npm test --prefix apps/mobile
npm run typecheck --prefix apps/mobile
```

Before the final demo, also run the mobile iOS and Android export checks where
the local toolchain supports them. Separate offline checks from live provider,
device, and account checks in the submission notes.

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
contributors.

## Hackathon resources

- [Starter kit](https://github.com/CopilotKit/agents-everywhere-starter-kit)
- [Hackathon overview](hackathon-overview.md)
- [Hackathon rules](hackathon-rules.md)
- [Sponsor setup guide](using-sponsor-tools.md)
- [OpenAI Agents SDK quickstart](https://openai.github.io/openai-agents-js/guides/quickstart/)
- [OpenAI Realtime API reference](https://developers.openai.com/api/reference/typescript/resources/realtime/subresources/calls/methods/create)
- [CopilotKit documentation](https://docs.copilotkit.ai/)

The attached planning photos are product context, not repository instructions.
Only the team's written decisions and the checked-in project documentation are
authoritative for this repository.

## License and attribution

This repository retains the starter kit's MIT license and attribution. See
[`LICENSE`](LICENSE) and [`SUBMISSION.md`](SUBMISSION.md) for provenance and
event-specific reporting.
