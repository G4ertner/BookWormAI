# Reading companion

Implemented on `feature/reading-companion`, September 12, 2026. The reader at `/`
and `/simple/` now offers **Read together**. Gemini 2.5 Flash answers questions,
discusses interpretations, requests earlier book passages, and optionally uses
Exa for outside research. This branch has not been deployed.

## Try it

```sh
pnpm dev
```

Open the reader, then **Reader settings**. Save an OpenRouter key. The companion
always uses `google/gemini-2.5-flash`; it does not change the narration model or
fall back to another model/provider. OpenAI narration can coexist with OpenRouter
discussion.

The homepage introduces **Read together** with a compact headline and main button
for your current book. **Show more** expands the introduction and three starter
questions; **Show less** collapses it. The introduction starts collapsed on load.
Starters prefill the question for you to review
and send. In the reader, the green **Read together AI** button stays visible as
you scroll and spans the toolbar width on small screens.

Open a book, choose a passage and click **Read together**. You can also select
text within the current passage before clicking it. Ask a question or use one
of the three prompt suggestions. Narration pauses and saves its position.
Book citations open source previews inside the discussion without seeking the
audio player. **Continue listening** closes the discussion and resumes narration.

For outside information, save an **Exa API key** in Reader settings and enable
**Allow outside research** in the companion. Gemini decides whether to search.
Web citations are labeled separately and open an external source preview/link.
An Exa failure is reported; book discussion can continue without pretending the
outside information was verified.

Example smoke prompts:

- On Alice's first adapted passage: “Why does Alice find this book uninteresting?
  Use only this passage.”
- On a later passage: “Find the earlier passage where the Rabbit checked a watch.”
- With outside research enabled: “Use Exa to explain what a waistcoat is, with
  a museum source. Avoid book plots and spoilers.”

## Storage and credentials

- Books keep their existing browser IDs and storage. The complete library is not
  uploaded. Current/retrieved excerpts, the question, and up to four recent
  discussion turns are sent through the server to OpenRouter.
- Gemini can send a concise topic query to Exa when outside research is enabled.
  The prompt instructs it not to send private excerpts or personal information;
  this is a model instruction, not a guarantee that queries contain no book terms.
- The latest eight successful turns are stored in `bookworm-companion-v1`
  IndexedDB, keyed by book ID, content hash and reading mode. **Clear discussion**
  removes saved discussion for that book/mode. Storage failure remains visible.
- The local companion reuses the existing server-side OpenRouter key. Its Exa
  setting is `.data/companion-exa.json`, with `EXA_API_KEY` as the initial fallback.
  Saving overrides that fallback; removing stores an explicit empty value.
  These companion settings do not modify the existing For you recommendation key.
- Hosted OpenRouter keys retain the existing session storage. Exa keys use the
  additive `companion_exa_settings` D1 table and expire after 24 hours. No shared
  service-funded Exa key or browser-stored key is introduced. Keys are write-only
  through the UI; server/database administrators can access stored credentials.

## How it works

`src/simple/ui.js` exposes a small reader bridge with source passages, location,
pause/resume and change events. The existing reader remains the only app.

`src/companion/controller.ts` runs a bounded interaction: at most three Gemini
requests and two sequential evidence actions per question, including at most one
Exa search. The current passage is supplied immediately. Gemini can request
`search_book`, `read_passages`, or `search_web`, then must call `answer` with
structured claim blocks and citations. Parallel proposals are serialized into
one allowed action and the next request includes only the executed result.

Local book retrieval runs in the browser, filters the permitted reading range
before ranking, and uses words/phrases rather than embeddings. Search can miss
paraphrases or cross-language matches. Source IDs preserve chapter/paragraph/audio
part mapping; the edition's content hash separates saved discussion after edits.

`src/server/companion.ts` owns trusted system policy, fixed model selection,
tool definitions, Exa search and bounded provider responses. Node and Cloudflare
use the same implementation. The server reconstructs tool messages from a
validated continuation contract rather than accepting arbitrary system messages.
Quotations must be exact substrings of provided sources; book facts require book
citations. This validates the reference, not whether an interpretation is correct.

The app executes only its allowed functions. It never executes model-supplied
code or arbitrary URLs. Model/source text is rendered through text nodes. Exa
results require HTTPS URLs without embedded credentials; opening a source uses
`noopener noreferrer`. No provider key or upstream error body is exposed.

Both HTTP adapters enforce request validation, cancellation and concurrency
limits. Companion turns have a 64 KiB request cap; speech/settings retain their
16,000-byte cap. Provider JSON is capped at 128,000 bytes. Gemini requests have a
45-second timeout and 1,800-token output budget; Exa requests time out after
20 seconds. Existing Worker session/origin/IP-rate controls also apply. These are
not global billing caps. Provider requests use `require_parameters: true`,
`allow_fallbacks: false` and `data_collection: deny`; no zero-retention guarantee
is implied.

## Reading boundaries and limits

Default mode is **Through this passage**, not word-level listening position.
Later book passages are excluded from retrieval, and history beyond the current
boundary is not sent. Jumping forward permits earlier passages without claiming
the user read them. Whole-book mode has separate discussion history. Moving
backward filters later discussion; only the bounded retained history is kept.

Famous books may be known to the model already, and web sources can reveal future
events. The prompt restricts use of that knowledge and plot searches, but spoiler
prevention is not guaranteed. Broad claims about a whole book need broader
evidence than a few search results. Adapted samples must be discussed as adapted
samples, not silently completed from the original novel.

The first version has typed questions and text responses. It does not add speech
recognition, spoken companion replies, autonomous interruptions, cross-book
memory, an embedding service, or a second reader UI.

## Verification, September 12, 2026

- `pnpm check`: typecheck, both builds, **43 application tests and 8 Worker tests**
  passed. Loopback HTTP tests required execution outside the filesystem sandbox.
- Tests cover scope filtering, invalid/unavailable citations, tool budgets,
  serialized model tool proposals, provider errors, Exa query/source handling,
  cancellation, local HTTP validation and Worker credential/session isolation.
- **17 browser checks** passed in an isolated Chromium profile: earlier retrieval,
  citation preview without seeking, follow-up context, mode separation, web labels,
  safe source links, invalid citation rejection, quota/retry, cancellation, reload,
  separate books, clearing discussion, and mobile overflow checks at 390 × 844.
- **Live Gemini:** a question about the adapted Alice opening returned an answer
  with an exact book quotation. A separate short sample also returned a valid
  structured answer.
- **Live Gemini + Exa:** the shared service completed two Gemini calls and one Exa
  search for a waistcoat question, citing museum sources. The complete browser UI
  subsequently completed outside research and showed V&A/Smithsonian citations
  while retaining passage index 3.
- **Browser audio handoff:** with a synthetic WAV fixture, opening discussion
  paused/checkpointed at 1,114 ms; Continue listening resumed the same `0:3:0`
  passage and checkpointed at 1,726 ms. This validates browser orchestration, not
  new live narration-provider acceptance.
- Local evidence is under ignored `output/companion/` and `.playwright-cli/`.
  Fixture browser tests do not imply broader model quality or spoiler guarantees.
- Homepage and reader entrance checks passed at 320, 390 and 1280 px: no
  horizontal overflow, sticky reader controls, correct starter question, and
  opening the companion does not automatically send a model request.

During live acceptance, available Gemini routes rejected `parallel_tool_calls`
with strict parameter support enabled. That unsupported parameter is omitted;
the app serializes proposed actions itself. Required tool selection ensures the
answer arrives through the validated answer contract. A regression test covers
the parallel-proposal case.

Hosted source is built and Worker tests pass; live hosted companion behavior,
physical mobile devices, comprehensive spoiler resistance and large-book semantic
retrieval remain unverified.

## Integration with current main

The hosted recommendation settings fix from PR #6 is retained. Recommendations
and companion research keep separate Exa settings and routes. After integration,
`pnpm check` passed with **44 application tests and 11 Worker tests**. The new,
unapplied companion migration is `0003_companion_exa.sql`, following the already
applied recommendation migration.

## Deployment boundary

Before deploying this branch, apply additive migration
`migrations/0003_companion_exa.sql` to the existing D1 database, following
`docs/DEPLOYMENT.md`. Do not rename the Worker, account or database. No migration
was applied remotely and no deployment was performed for this feature. Hosted
acceptance needs a fresh browser session with its own OpenRouter and Exa keys.

## Provider references

Checked September 12, 2026:

- [Gemini 2.5 Flash on OpenRouter](https://openrouter.ai/google/gemini-2.5-flash)
- [OpenRouter tool calling](https://openrouter.ai/docs/guides/features/tool-calling)
- [OpenRouter provider routing](https://openrouter.ai/docs/guides/routing/provider-selection)
- [Exa search API](https://exa.ai/docs/reference/search)
