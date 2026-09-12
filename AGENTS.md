# BookWormAI agent notes

BookWormAI is intentionally a clean-slate hackathon project. The local
`starter-kit/` directory is an ignored reference copy of the inherited
`agents-everywhere-starter-kit`; do not treat it as application source or add
it to commits.

The first demo should be one complete flow:

1. import a user-owned EPUB;
2. show the parsed book and chapter list;
3. open a chapter in read mode;
4. generate or stream narration for the current passage;
5. automatically save and restore the listening position.

## Product intent

- BookWormAI is a personal shelf plus listen/read room: users listen to their
  own books, ask about the current passage, and continue where they stopped.
- The primary flow has three screens: Library, Add Books, and Listen/read mode.
  Settings, including API-key management and narrator preferences, are reached
  from the Library rather than becoming a fourth primary screen.
- Accept DRM-free local EPUBs. A Project Gutenberg discovery/import route is
  optional and must remain a lightweight catalog experience.
- Use the user's own OpenAI API key. Do not add accounts, profiles, or
  service-operated billing to the initial build.
- Narration should be progressive, part by part, and playback should not wait
  for a full-book conversion. Automatically save progress during playback and
  on supported lifecycle events; manual named bookmarks are not an MVP
  requirement.
- Read-along highlighting, a conversational narrator, and accounts are later
  extensions. Do not let them displace reliable import, playback, and resume.

The HTML prototype is UX reference material. Preserve its useful interaction
direction—personal shelf, prominent play action, passage questions, saved
insights, and listening settings—without treating its browser-only demo logic
as the production architecture.

Read `README.md` before making broad changes. The inherited event notes and
starter implementation can be consulted under `starter-kit/` when needed, but
they are reference material rather than current project source.

## Architecture guidance

- Keep EPUB parsing, chapter extraction, reading position, and audio playback
  behind small typed modules that can be shared across web and mobile.
- Keep provider credentials server-side. Never place API keys or tokens in Expo
  public environment variables, source files, logs, or commits.
- `.env.example` may contain only empty or clearly fake placeholders for
  `OPENAI_API_KEY`. Real `.env` and `.env.local` files are ignored and must
  never be committed.
- Validate imported file type and size, avoid logging book contents, and make
  the local-versus-server storage boundary explicit.
- Do not assume EPUB reading order, story-start detection, background audio,
  browser persistence, or TTS limits. Validate each against representative
  books and the current platform/API documentation.
- Handle absent/rejected keys, network failures, and generation falling behind
  playback as first-class user-visible states.
- Add an optional Go service only after the team chooses a concrete boundary.
- Use `.tsx` for files containing JSX and preserve existing conventions once the
  application scaffold is added.

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
- Distinguish inherited starter reference material from BookWormAI code in PR
  descriptions and submission notes.
- When JavaScript dependencies are introduced, use pnpm and configure
  `minimumReleaseAge: 1440` before installing packages, as required by the
  project intent.

## Verification

The application scaffold has not been selected yet. Document its exact
typecheck, test, build, and device commands in `README.md` when it is added.
Before scaffolding, record validation findings for EPUB parsing/story start,
Expo Web/Expo Go import and playback, API-key storage/removal, progressive TTS,
and lifecycle resume. When credentials or a device are unavailable, report
those live checks as unverified; do not replace them with a claim based only on
static checks.

## Collaboration

- Use a short-lived branch per feature and open a focused pull request.
- Keep commits small enough to cherry-pick during the hackathon.
- Keep `starter-kit/` local-only and ignored.
- Do not commit real `.env` files, EPUB files, generated audio, personal data,
  or large
  build output.
- Before merging, include the exact verification commands run and note any
  missing account/device-dependent checks.
