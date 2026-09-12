# Bookworm AI — initial project intent

Captured from the user's intent session on 2026-09-12. This document records requested behavior, not verified platform capabilities or an approved implementation architecture.

## Product

Bookworm AI turns user-imported EPUB e-books into an audiobook-like listening experience using OpenAI text-to-speech. Keep the first version as simple as possible. Use TypeScript / JavaScript with Expo, supporting a computer through Expo Web and an Android device, ideally through Expo Go.

Users supply their own OpenAI API key through settings accessible from the library. Accounts, profiles, and a service-operated AI billing flow are outside the initial scope.

## Three-screen flow

The screen grouping below is an interpretation of the session; exact navigation is not yet designed.

1. **Library / landing:** Display imported books and provide an Add Book entry point. Expose API-key settings here, potentially as a panel rather than a fourth primary screen.
2. **Add Books:** Import a local EPUB from the device or discover and import a book from Project Gutenberg. The Gutenberg route should feel like a lightweight catalog, without commerce.
3. **Listen / read mode:** Open a library book to its cover and a prominent play button. Provide chapter navigation and automatic restoration of listening position. Exact secondary controls remain to be designed.

## Core requirements

### Import and book structure

- Accept EPUB files from the device and EPUB downloads from the Gutenberg discovery route.
- Parse imported books into ordered, narratable content with identifiable chapters.
- Identify the actual beginning of the story so initial playback can skip imprint, publishing details, and other front matter.
- Preserve access to chapter structure for meaningful chapter-to-chapter navigation.
- Store imported books in the user's library. Storage format and persistence implementation are undecided.
- Story-start detection may be ambiguous. A correction mechanism is a proposed safeguard, not yet a user-approved interaction design.

### Progressive narration

- When Play is pressed, turn the book into audio part by part and play those parts progressively, without requiring the entire book to be generated first.
- Treat coherent, continuous listening as the outcome. Chunk size, prefetching, caching, streaming versus completed audio segments, and retry behavior need technical validation.
- Use OpenAI TTS with the user's supplied API key. Model, voice, input limits, browser access, and narration-instruction support must be verified against current official documentation before implementation.

### Narrator direction

- Desired enhancement: Generate a narrator prompt suited to the book's tone, which can guide narration where the chosen model supports it.
- The user's example was a Dumbledore-like narrator for Harry Potter. Capture this as creative direction for a fitting narrator; it does not establish the ability to reproduce a specific character or actor's voice.
- Automatic prompt generation is desirable, but its priority within the MVP remains open. Reliable import, playback, and saved position take precedence.

### Automatic bookmark / resume

- Retain each book's listening position automatically; the user should not need to create a bookmark manually.
- Restore progress after the user closes the app, after a crash, or after other lifecycle interruptions.
- Resume at the saved place when the listener returns to the book.
- Proposed implementation criterion: Save progress periodically during playback as well as on supported lifecycle events, because abrupt termination may provide no final save opportunity.
- Define the acceptable replay window and position granularity before implementation. Exact sample-level recovery is not promised by this intent capture.
- Manual named bookmarks and cross-device progress synchronization were not requested.

## Later, if time permits

- **Read-along:** Show the narrated text in a subtitle-like presentation.
- **Conversational narrator:** Let the user press a button and talk to the narrator as a live AI agent.
- **Accounts and profiles:** Add user identity and profile flows after the initial bring-your-own-key experience.

## Validation questions before building

- Establish the actual Gutenberg catalog/download interface, whether it is official or third-party, available EPUB variants, and browser download constraints. The session's reference to a Gutenberg API is an integration idea, not a verified endpoint.
- Select a supported EPUB subset and inspect representative files for reading order, chapter navigation, metadata, and story-start markers. Decide behavior for unsupported or protected files.
- Verify Expo Web and Expo Go support for file import, EPUB processing, audio playback, persistence, and lifecycle handling.
- Decide where the API key lives on each platform and how the user can remove it. Do not assume web storage has the same protections as native storage. Avoid logging keys or committing them.
- Verify current OpenAI TTS capabilities, usage costs, limits, and any additional model call needed to generate narrator instructions.
- Define behavior when the network fails, the key is absent or rejected, or generation cannot keep pace with playback.
- Clarify whether playback while the device is locked or the app is backgrounded is required initially. Saved progress is required; background playback is not yet specified.

## Acceptance scenarios

These are proposed checks derived from the requested outcome, not completed tests.

1. Import a local EPUB; confirm it appears in the library and opens with the expected title and cover when available.
2. Discover and import a Gutenberg EPUB through the Add Books flow.
3. Start a newly imported book at the actual story, and navigate through its chapters in order.
4. Press Play and hear successive generated audio segments without needing a full-book conversion first; evaluate transitions and startup delay with a listener.
5. Close and reopen the app; verify the library and per-book listening position persist.
6. Interrupt or abruptly terminate playback; verify restored position against an agreed replay tolerance.
7. Demonstrate the core flow on desktop web and an Android device.
8. Demonstrate understandable recovery from a missing/invalid API key and interrupted generation.

## Executable next step

In a separately requested implementation-planning session, validate one representative EPUB and current platform/API constraints, then specify the first vertical slice: local EPUB import → chapter/story-start extraction → one progressively narrated chapter → persisted resume on web and Android. Use the findings to choose the minimum architecture before scaffolding the app.

When JavaScript dependencies are introduced, use pnpm and configure `minimumReleaseAge: 1440` before installing packages, following the project working agreements.
