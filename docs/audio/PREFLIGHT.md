# Audio MVP preflight — 2026-09-12

The user authorized implementation on the existing `feature/eric-audio` branch, chose `fish-audio/s2.1-pro` through OpenRouter, and requested a replaceable UI. This takes precedence over the shared notes' earlier OpenAI-direct choice. The ignored `starter-kit/` is reference only.

## Scope selected from current evidence

Use the current HTML prototype as the first browser integration surface. Add a small TypeScript Node backend and framework-independent audio modules. Do not select or scaffold an Expo application for teammates as part of this audio contribution. Native playback remains a later adapter with device verification outstanding.

- EPUB: inspected the prototype's bounded ZIP/XHTML parser. It follows linear spine order and extracts text without mounting imported HTML. It rejects declared encryption, limits archive/text sizes, and uses browser DecompressionStream. Story-start heuristics and broad EPUB compatibility are not established; manual chapter/passage navigation is the fallback. Retain this as prototype import code, separate from audio.
- Web playback: replace browser speech with generated audio files and an HTMLAudioElement adapter. Actual loading, pause, resume, persistence, and transitions must be exercised after implementation.
- Expo Web/Expo Go: not tested; not part of this browser audio build. Do not infer native acceptance from browser checks.
- Credentials: server-side `OPENROUTER_API_KEY` in ignored root `.env`; optional `FISH_AUDIO_VOICE_ID`. The browser receives readiness metadata only. Remove the key from `.env` and restart to remove it from the process. No key-entry form or persistent key database.
- Progressive TTS: short text passages, one passage playing plus one prefetched, bounded cache, explicit error/retry. No full-book conversion before Play and no automatic model fallback.
- Resume: checkpoint actual audio asset identity and milliseconds periodically and on lifecycle events; if the asset is missing, disclose passage-start recovery.

## Provider sources checked today

- [OpenRouter TTS](https://openrouter.ai/docs/guides/overview/multimodal/tts): speech endpoint, raw audio response, explicit MP3 format, provider-specific voice settings.
- [Fish model listing](https://openrouter.ai/fish-audio/s2.1-pro): chosen model, billed per UTF-8 byte.
- [Fish quickstart](https://docs.fish.audio/developer-guide/getting-started/quickstart): native Fish supports default voice and optional reference ID. Exact OpenRouter forwarding/default behavior requires authenticated verification.

No credentials were present in the process or root env files at initial inspection. Live Fish synthesis is pending user key setup. Automated tests will use an explicitly identified fixture provider and must not be reported as live narration proof.
