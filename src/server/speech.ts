import { MODEL, MAX_PASSAGE_BYTES } from '../audio/types.ts';
import type { NarrationProfile } from '../audio/types.ts';

export class SpeechError extends Error {
  constructor(public code: string, message: string, public status = 502) { super(message); }
}
export interface SpeechResult { bytes: Uint8Array; contentType: string; generationId?: string }
export interface SpeechProvider {
  profile: NarrationProfile;
  configured: boolean;
  synthesize(text: string, signal: AbortSignal): Promise<SpeechResult>;
}
export function validateText(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new SpeechError('INVALID_TEXT', 'Choose a passage containing readable text.', 400);
  if (new TextEncoder().encode(value).length > MAX_PASSAGE_BYTES) throw new SpeechError('TEXT_TOO_LONG', 'This passage is too long. Split it into smaller passages.', 413);
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value)) throw new SpeechError('INVALID_TEXT', 'The passage contains unsupported control characters.', 400);
  return value;
}

export class OpenRouterSpeech implements SpeechProvider {
  readonly profile: NarrationProfile;
  get configured(): boolean { return Boolean(this.key.trim()); }
  setKey(key: string): void { this.key = key; }
  constructor(private key: string, voice?: string, private request: typeof fetch = fetch, private provider: 'openrouter' | 'openai' = 'openrouter') {
    const voiceId = voice?.trim() || null;
    const model = provider === 'openai' ? 'gpt-4o-mini-tts' : MODEL;
    this.profile = { id: btoa(JSON.stringify([model, voiceId, 'mp3', 'v1'])), model, voice: voiceId };
  }
  async synthesize(text: string, signal: AbortSignal): Promise<SpeechResult> {
    validateText(text);
    const brand = this.provider === 'openai' ? 'OpenAI' : 'OpenRouter';
    if (!this.configured) throw new SpeechError('KEY_MISSING', `Add your ${brand} API key in narrator settings to start narration.`, 503);
    const body = { model: this.profile.model, input: text, response_format: 'mp3', ...(this.profile.voice ? { voice: this.profile.voice } : {}) };
    try {
      // Workers' native fetch rejects the provider instance as its `this` value.
      const request = this.request;
      const response = await request(this.provider === 'openai' ? 'https://api.openai.com/v1/audio/speech' : 'https://openrouter.ai/api/v1/audio/speech', {
        method: 'POST', headers: { Authorization: `Bearer ${this.key}`, 'Content-Type': 'application/json', 'X-Title': 'BookWormAI' },
        body: JSON.stringify(body), signal: AbortSignal.any([signal, AbortSignal.timeout(90000)]),
      });
      if (!response.ok) {
        // Never forward untrusted upstream bodies: they may echo keys or private text.
        await response.body?.cancel();
        const errors: Record<number, [string, string, number]> = {
          400: ['VOICE_CONFIGURATION', 'The provider rejected the speech settings. Check the selected voice, then retry.', 422],
          401: ['KEY_REJECTED', `${brand} rejected the API key. Update it in narrator settings.`, 401],
          402: ['CREDIT_REQUIRED', `Your ${brand} account needs credit before narration can continue.`, 402],
          403: ['ACCESS_DENIED', `This ${brand} key cannot access the selected voice model.`, 403],
          404: ['MODEL_UNAVAILABLE', 'The selected audio model is unavailable. Your reading position is saved.', 503],
          429: ['RATE_LIMITED', `${brand} has limited requests or quota. Check your account, then press Play to retry.`, 429],
        };
        const [code, message, status] = errors[response.status] ?? ['PROVIDER_UNAVAILABLE', 'The voice provider is temporarily unavailable. Press Play to retry.', 502];
        throw new SpeechError(code, message, status);
      }
      if (!response.body || !/^audio\/(mpeg|mp3)(;|$)/i.test(response.headers.get('content-type') || '')) {
        await response.body?.cancel();
        throw new SpeechError('INVALID_AUDIO', 'The voice provider did not return MP3 audio. Please retry.');
      }
      const reader = response.body.getReader();
      const parts: Uint8Array[] = []; let length = 0;
      try {
        while (true) {
          const { value, done } = await reader.read(); if (done) break;
          length += value.length;
          if (length > 8 * 1024 * 1024) { await reader.cancel(); throw new SpeechError('AUDIO_TOO_LARGE', 'The audio response exceeded the passage limit.'); }
          parts.push(value);
        }
      } finally { reader.releaseLock(); }
      const bytes = new Uint8Array(length); let offset = 0; for (const part of parts) { bytes.set(part, offset); offset += part.length; }
      const isMp3 = new TextDecoder().decode(bytes.subarray(0, 3)) === 'ID3' || (bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0);
      if (length < 32 || !isMp3) throw new SpeechError('INVALID_AUDIO', 'The voice provider returned empty or invalid MP3 audio. Please retry.');
      return { bytes, contentType: 'audio/mpeg', generationId: response.headers.get('x-generation-id') ?? undefined };
    } catch (error) {
      if (error instanceof SpeechError) throw error;
      if (signal.aborted) throw new SpeechError('CANCELLED', 'Narration was cancelled.', 499);
      if (error instanceof Error && error.name === 'TimeoutError') throw new SpeechError('TIMEOUT', 'Narration took too long. Press Play to retry.', 504);
      throw new SpeechError('NETWORK_ERROR', `The server could not reach ${brand}. Check the connection and retry.`, 502);
    }
  }
}

export class OpenAISpeech extends OpenRouterSpeech {
  constructor(key: string, voice = 'marin', request: typeof fetch = fetch) { super(key, voice, request, 'openai'); }
}
