# BookWormAI agent notes

BookWormAI is a hackathon project: an Expo Web/React Native client plus a
shared TypeScript web runtime that turns a user's own EPUB into an audiobook-
like reading experience. The first demo should be one complete flow:

1. import a user-owned EPUB;
2. show the parsed book and chapter list;
3. open a chapter in read mode;
4. generate or stream narration for the current passage;
5. pause, resume, and retain the reading position.

Read these files before making broad changes:

- `README.md` for setup, scope, provenance, and team workflow;
- `hackathon-overview.md` and `hackathon-rules.md` for event constraints;
- `apps/mobile/README.md` for Expo and device networking;
- `apps/web/README.md` for the shared runtime and approval boundaries;
- `using-sponsor-tools.md` only when adding a sponsor integration.

## Architecture constraints

- `apps/mobile` is intentionally not a root npm workspace. Keep its Expo,
  React, and React Native dependency tree isolated.
- The web runtime in `apps/web` serves both the web app and
  `/api/mobile-copilotkit` for the mobile client.
- Keep provider credentials server-side. Never put `OPENAI_API_KEY`, provider
  keys, or tokens in Expo public environment variables, source files, logs, or
  commits.
- Use the existing CopilotKit headless/native patterns for mobile app context,
  rendered tool UI, and human approval. Do not invent a new tool protocol.
- Any external or persistent write must be proposed first and committed only
  after an explicit user approval. A narrated claim that a write happened is
  not evidence.
- Preserve the starter's tested CopilotKit/runtime versions and the root
  `@ag-ui/client` override unless a change is tested across the affected apps.

## Implementation guidance

- Keep EPUB parsing, chapter extraction, reading position, and audio playback
  behind small typed modules so web and mobile can share behavior without
  sharing platform-specific UI.
- Treat imported books as user data. Validate file type/size, avoid logging
  book contents, and make the local-vs-server storage boundary explicit.
- Keep the initial demo narrow. Do not add accounts, cloud libraries, OCR,
  search, or a second surface unless the team explicitly chooses them as part
  of the demonstrated interaction.
- Use `.tsx` for files containing JSX. Prefer existing project conventions and
  avoid broad formatting-only changes.
- Distinguish inherited starter code from BookWormAI code in PR descriptions
  and in `SUBMISSION.md`.

## Verification

From the repository root:

```bash
npm run typecheck
npm test
npm run build --workspace web
```

For the Expo app:

```bash
npm ci --prefix apps/mobile
npm test --prefix apps/mobile
npm run typecheck --prefix apps/mobile
npm run bundle:ios --prefix apps/mobile
npm run bundle:android --prefix apps/mobile
```

When credentials or a device are unavailable, report those live checks as
unverified; do not replace them with a claim based only on static checks.

## Collaboration

- Use a short-lived branch per feature and open a focused pull request.
- Keep commits small enough to cherry-pick during the hackathon.
- Do not commit `.env`, EPUB files, generated audio, personal data, or large
  build output.
- Before merging, include the exact verification commands run and note any
  missing account/device-dependent checks.
