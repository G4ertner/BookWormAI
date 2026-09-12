# Verification — single reader cleanup

Validated locally on September 12, 2026, on `refactor/simple-reader-only` based on
main `151f36a`. This report describes the cleanup build, not a new production release.

## Commands

| Check | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | Passed with the root lockfile and 24-hour release-age policy |
| `pnpm check` | Typecheck, browser/Node/Workers builds, 27 application tests and six Worker tests passed |
| `pnpm test:cloudflare` after adding build-parity assertions | Six passed; Worker HTML and JS exactly match local reader artifacts |
| `pnpm exec wrangler deploy --dry-run` | Passed; existing D1 and rate-limit bindings resolved; nothing published |
| Canonical TIE validation | Passed |

Tests cover passage splitting, cache/resume and cancellation, provider routing, key
save/remove and sanitization, missing/rejected/quota errors, body/audio limits, origin
checks, catalog URL/parsing safeguards, hosted session isolation/expiry and rate limits.
The retired main bundles/routes return 404; root and legacy simple URLs serve one app.
Provider responses in automated tests are fixtures, not live speech.

## Browser acceptance

In the Codex in-app browser at http://127.0.0.1:4310/:

- Existing four-book library and saved Alice chapter survived the route/source cleanup.
- Narrator dialog showed Fish/OpenAI selection, separate key inputs, accurate local key
  retention text, and no retired direction-preview controls. Existing keys were untouched.
- Imported a deflated original test EPUB through the file picker. The shelf gained the
  test book with two chapters. The parser respected spine order: “The quiet garden” then
  “A new morning”, despite the manifest listing the second chapter first.
- Existing Gutenberg Alice EPUB remained readable with 13 sections. Real Fish narration
  reached “Listening”, advanced from passage 11 to 12, and paused normally.
- Reload restored chapter 2/passage 11 at the tested pause point and resumed playback.
  The test confirms chapter/passage retention; it does not measure exact audio offset.
- Live Gutenberg search for Alice returned results and retained duplicate-import protection.
  No browser console errors were reported during these checks.

One disposable test book was added; existing personal books and settings were preserved.
No key values or book contents were logged. Narration sent public-domain Alice passages
through the configured OpenRouter provider; no new credentials were entered.

## Limits and handoff

The local narration profile now uses the portable Cloudflare identity. Existing local
cached audio may regenerate once; book and passage IDs are unchanged. Gutenberg import
can require download followed by explicit file selection because of browser CORS.
EPUB front matter is preserved; select a story chapter when necessary.

At validation time, this cleanup had not been pushed, merged or deployed. The Cloudflare dry run and mocked
Worker tests do not prove live hosted narration. After deployment, test in that hosted
browser with its own key. Live OpenAI synthesis, physical mobile devices, background or
screen-off playback, long listening sessions and broad EPUB compatibility remain open.
