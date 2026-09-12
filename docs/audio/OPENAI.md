# OpenAI narration option

Added 2026-09-12. Both settings popups support Fish Free through OpenRouter and
OpenAI GPT-4o Mini TTS through the direct OpenAI API. Fish Free remains the default.

## Use

1. Open settings in `/` or `/simple/`.
2. Enter your OpenAI API key and press **Save OpenAI key**.
3. Select **GPT-4o Mini TTS · OpenAI (paid)** and a voice.
4. Press **Apply model and voice**. Playback pauses and the page reloads with the
   new profile. Reload other open reader tabs before continuing there.
5. Press Play to verify real narration. Saving a key does not verify the account.

Built-in voices: Marin (default OpenAI choice), Cedar, Alloy, Ash, Ballad, Coral,
Echo, Fable, Onyx, Nova, Sage, Shimmer and Verse. OpenAI is a paid API option;
no automatic fallback to another provider is enabled.

## Backend and storage

- OpenAI requests go to `https://api.openai.com/v1/audio/speech`, model
  `gpt-4o-mini-tts`, with the selected voice and MP3 format.
- Fish requests continue to use the OpenRouter endpoint and only the OpenRouter key.
- `.data/openai-settings.json` stores the OpenAI key, with `OPENAI_API_KEY` as the
  initial environment fallback. Existing `.data/audio-settings.json` and
  `OPENROUTER_API_KEY` continue to apply only to OpenRouter.
- `.data/narration.json` stores the active provider/voice. All settings files are
  ignored and written with owner-only permissions on macOS/Linux. They are local
  plaintext, not an encrypted OS keychain. No key is returned to the browser.
- Removing one provider key leaves the other intact. An empty saved key disables
  that provider's environment fallback on future restarts.
- `PUT /api/audio/key` now accepts a `provider` field (`openrouter` or `openai`),
  defaulting to OpenRouter for compatibility. DELETE takes the same provider field.
- `PUT /api/audio/selection` accepts `{ "provider": "openai", "voice": "cedar" }`
  or `{ "provider": "openrouter", "voice": "" }`. It shares the existing origin,
  header, body and in-flight-generation protections. Fish's custom voice remains
  configured by `FISH_AUDIO_VOICE_ID` on the server.
- `GET /api/audio/config` includes the selection and boolean key-readiness flags.
  Profile IDs change with model or voice. The existing cache keys include the
  profile; old-tab generation requests receive a profile-change error until reload.

Shared catalog: `src/audio/catalog.ts`. Provider selection/persistence:
`src/server/narration.ts`. Shared popup: `src/audio/key-settings.ts`.

## Evidence and limits

Typecheck, build and 24 unit/HTTP tests passed. Tests verify exact OpenAI endpoint,
voice and key routing, separate key removal, settings restoration, voice validation,
profile changes, and refusal to fall back when the OpenAI key is missing.
Browser checks on an isolated dummy-key server verified saving an OpenAI key,
selecting Cedar in the simplified popup, automatic reload, and the same selection
and separate key statuses in the main popup, without browser warnings/errors.

Live OpenAI generation and audible voice quality are **unverified**; no real OpenAI
key was entered or used during these checks. Existing live Fish evidence remains
in `VERIFICATION.md`. The working local app retains Fish Free as its selection.

Official sources checked 2026-09-12:
- [Speech API and supported voices](https://developers.openai.com/api/reference/cli/resources/audio/subresources/speech/methods/create)
- [GPT-4o Mini TTS model](https://developers.openai.com/api/docs/models/gpt-4o-mini-tts)
