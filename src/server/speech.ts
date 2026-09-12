import { createHash } from 'node:crypto';
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
  if (Buffer.byteLength(value, 'utf8') > MAX_PASSAGE_BYTES) throw new SpeechError('TEXT_TOO_LONG', 'This passage is too long. Split it into smaller passages.', 413);
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value)) throw new SpeechError('INVALID_TEXT', 'The passage contains unsupported control characters.', 400);
  return value;
}

export class OpenRouterSpeech implements SpeechProvider {
  readonly profile: NarrationProfile;
  readonly configured: boolean;
  constructor(private key: string, voice?: string, private request: typeof fetch = fetch) {
    const voiceId = voice?.trim() || null;
    this.profile = { id: createHash('sha256').update(JSON.stringify([MODEL, voiceId, 'mp3', 'v1'])).digest('hex'), model: MODEL, voice: voiceId };
    this.configured = Boolean(key.trim());
  }
  async synthesize(text: string, signal: AbortSignal): Promise<SpeechResult> {
    validateText(text);
    if (!this.configured) throw new SpeechError('KEY_MISSING', 'Add OPENROUTER_API_KEY to the server .env file, restart the server, and reload this page.', 503);
    const body = { model: MODEL, input: text, response_format: 'mp3', ...(this.profile.voice ? { voice: this.profile.voice } : {}) };
    try {
      const response = await this.request('https://openrouter.ai/api/v1/audio/speech', {
        method: 'POST', headers: { Authorization: `Bearer ${this.key}`, 'Content-Type': 'application/json', 'X-Title': 'BookWormAI' },
        body: JSON.stringify(body), signal: AbortSignal.any([signal, AbortSignal.timeout(90000)]),
      });
      if (!response.ok) {
        // Never forward untrusted upstream bodies: they may echo keys or private text.
        await response.body?.cancel();
        const errors: Record<number, [string, string, number]> = {
          400: ['VOICE_CONFIGURATION', 'The provider rejected the speech settings. Check FISH_AUDIO_VOICE_ID on the server, then retry.', 422],
          401: ['KEY_REJECTED', 'OpenRouter rejected the server API key. Update .env and restart the server.', 401],
          402: ['CREDIT_REQUIRED', 'Your OpenRouter account needs credit before narration can continue.', 402],
          403: ['ACCESS_DENIED', 'This OpenRouter key cannot access the selected voice model.', 403],
          404: ['MODEL_UNAVAILABLE', 'The selected Fish Audio model is unavailable. Your reading position is saved.', 503],
          429: ['RATE_LIMITED', 'OpenRouter is rate limiting narration. Wait briefly, then press Play to retry.', 429],
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
      const bytes = Buffer.concat(parts);
      const isMp3 = bytes.subarray(0, 3).toString() === 'ID3' || (bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0);
      if (length < 32 || !isMp3) throw new SpeechError('INVALID_AUDIO', 'The voice provider returned empty or invalid MP3 audio. Please retry.');
      return { bytes, contentType: 'audio/mpeg', generationId: response.headers.get('x-generation-id') ?? undefined };
    } catch (error) {
      if (error instanceof SpeechError) throw error;
      if (signal.aborted) throw new SpeechError('CANCELLED', 'Narration was cancelled.', 499);
      if (error instanceof Error && error.name === 'TimeoutError') throw new SpeechError('TIMEOUT', 'Narration took too long. Press Play to retry.', 504);
      throw new SpeechError('NETWORK_ERROR', 'The server could not reach OpenRouter. Check the connection and retry.', 502);
    }
  }
}
