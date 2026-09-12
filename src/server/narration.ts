import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { OPENAI_VOICES, type AudioSelection, type AudioSettings, type ProviderId } from '../audio/catalog.ts';
import { OpenAISpeech, OpenRouterSpeech, SpeechError, type SpeechProvider } from './speech.ts';
import { loadApiKey, saveApiKey, saveSettingsFile } from './credentials.ts';

export function validateSelection(value: unknown): AudioSelection {
  const selection = value as Partial<AudioSelection> | null;
  if (!selection || !['openrouter', 'openai'].includes(selection.provider ?? '') || typeof selection.voice !== 'string')
    throw new SpeechError('INVALID_SELECTION', 'Choose a supported narration model and voice.', 400);
  if (selection.provider === 'openai' && !OPENAI_VOICES.some(voice => voice === selection.voice))
    throw new SpeechError('INVALID_VOICE', 'Choose an available OpenAI voice.', 400);
  if (selection.provider === 'openrouter' && selection.voice !== '')
    throw new SpeechError('INVALID_VOICE', 'Fish uses the voice configured on the server.', 400);
  return { provider: selection.provider as ProviderId, voice: selection.voice };
}

/** Credentials never cross provider endpoints. Selected provider is explicit, with no fallback. */
export class NarrationService implements SpeechProvider {
  private selection: AudioSelection = { provider: 'openrouter', voice: '' };
  private keys: Record<ProviderId, string> = { openrouter: '', openai: '' };
  private active: SpeechProvider = new OpenRouterSpeech('');
  private constructor(private directory: string, private fishVoice: string | undefined, private request: typeof fetch) {}
  static async open(directory: string, env: { openrouter?: string; openai?: string; fishVoice?: string } = {}, request: typeof fetch = fetch): Promise<NarrationService> {
    const service = new NarrationService(directory, env.fishVoice, request);
    service.keys.openrouter = await loadApiKey(join(directory, 'audio-settings.json'), env.openrouter || '');
    service.keys.openai = await loadApiKey(join(directory, 'openai-settings.json'), env.openai || '');
    try { service.selection = validateSelection(JSON.parse(await readFile(join(directory, 'narration.json'), 'utf8'))); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('Saved narration settings could not be read.'); }
    service.rebuild(); return service;
  }
  get profile() { return this.active.profile; }
  get configured() { return this.active.configured; }
  settings(): AudioSettings { return { selection: { ...this.selection }, keys: { openrouter: Boolean(this.keys.openrouter), openai: Boolean(this.keys.openai) } }; }
  synthesize(text: string, signal: AbortSignal) { return this.active.synthesize(text, signal); }
  async updateKey(key: string, provider: ProviderId = 'openrouter'): Promise<void> {
    await saveApiKey(join(this.directory, provider === 'openai' ? 'openai-settings.json' : 'audio-settings.json'), key);
    this.keys[provider] = key; this.rebuild();
  }
  async select(selection: AudioSelection): Promise<void> {
    const valid = validateSelection(selection);
    await saveSettingsFile(join(this.directory, 'narration.json'), valid);
    this.selection = valid; this.rebuild();
  }
  private rebuild(): void {
    this.active = this.selection.provider === 'openai' ? new OpenAISpeech(this.keys.openai, this.selection.voice, this.request) : new OpenRouterSpeech(this.keys.openrouter, this.fishVoice, this.request);
  }
}
