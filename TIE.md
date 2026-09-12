# TIE: BookWormAI

## Intent

- One focused browser app: add an EPUB/TXT file or find a book on Project Gutenberg,
  put it on a personal shelf, read/listen chapter by chapter, and resume later.
- The simplified reader is the sole application. Its local and Cloudflare builds
  share source; the earlier main UI and standalone search prototype are retired.
- Users bring their own OpenRouter or OpenAI key. Keep providers explicit and keys
  separate, with no service-operated AI billing or silent provider fallback.
- Recommend free Project Gutenberg books from an explicit reading interest using Exa
  search, with source links and the existing import flow. Search credentials are
  independent of narration; do not send the shelf or book text for recommendations.
- Keep narration progressive; never wait for full-book conversion before playback.
- A reading companion uses Gemini 2.5 Flash through OpenRouter to explain and discuss
  the loaded book, retrieve supporting passages and preserve the reader's place.
- Outside research uses Exa when enabled by the reader, with a separate key and
  visible web sources. Distinguish book evidence, interpretation and outside context.

## Taste

- A calm personal shelf and listen/read room, with prominent play and easy chapters.
- Read together is the central AI feature: introduce it on the library page and
  give it a prominent, persistent entrance in the reader. Keep the homepage intro
  collapsed by default with a visible headline and entrance; expand for details.
- Settings are reached from Library, not a fourth primary screen.
- Add books to the shelf, then let the user open them. Avoid setup-heavy flows,
  duplicate versions, unimplemented previews and implementation details in the UI.
- Keep provider integration, parsing, playback, caching and resume behind small modules
  so future UI changes do not require rewriting the underlying behavior.

## Eval

- Prove import/search/add, chapter reading, actual narration, pause and restored position
  in the browser. Separate local, hosted, provider and device evidence.
- Preserve book reading order and user data. Where story-start detection is uncertain,
  allow chapter selection and state the limitation rather than claiming automatic success.
- Validate missing/rejected keys, quota/network errors, file limits and cancellation.
- Companion citations must resolve to supplied text. Reading boundaries constrain
  retrieval and conversation context; do not promise perfect spoiler prevention
  from pretrained knowledge or external sources. Verify discuss/source/resume in-browser.
- Local and hosted builds must use one tested reader. Never infer runtime success from
  a build alone or promote an untested provider/device to a supported demonstration.

## Non-Goals And Drift Risks

- No alternate main app, standalone generic chat, accounts, OCR, native scaffold or
  narrator-direction preview in this slice. Keep old prototypes in Git history or ignored local archives.
- Local Node stays loopback-only. Hosted public access uses isolated expiring browser
  sessions, server-side keys and API limits; never supply a public shared provider key.
- Books/audio/progress remain browser-local; `.env`, `.data/`, generated audio and personal
  files stay outside commits. Cleanup must not destroy existing user books or credentials.
- Keep development reasoning host-agent native. Scripts handle deterministic building,
  testing and artifact generation. The explicitly scoped in-app reading companion
  is a product inference capability; it does not move development reasoning into scripts.

## Open Questions

- Which additional EPUB structures need story-start or parsing improvements?
- What guarantees can be established for background playback and native devices?
- How should longer listening sessions behave when provider generation falls behind?
