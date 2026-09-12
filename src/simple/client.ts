import '../books/epub.js';
import { mountKeySettings } from '../audio/key-settings.ts';
import { mountSimpleReader } from './ui.js';
import { AudioController } from '../audio/controller.ts';
import { BrowserAssets, BrowserMedia, readPosition, writePosition } from '../audio/browser.ts';
import { MODEL, splitPassage, type NarrationProfile, type Passage } from '../audio/types.ts';

let profile: NarrationProfile = { id: 'unconfigured', model: MODEL, voice: null };
let connection = '';
try {
  const response = await fetch('/api/audio/config', { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error();
  const config = await response.json();
  profile = config.profile;
  if (!config.configured) connection = 'Add the selected provider’s API key in narrator settings to listen. Reading is still available.';
} catch { connection = 'The audio service is unavailable. Reload to retry.'; }
let warning = '';
const banner = document.querySelector<HTMLElement>('#audio-status')!;
const assets = new BrowserAssets(profile, message => { warning = message; renderStatus(); });
const controller = new AudioController(new BrowserMedia(), assets, position => {
  try { writePosition(position); }
  catch { warning = 'Listening position could not be saved. Enable browser storage to resume after reopening.'; renderStatus(); }
});
function renderStatus(): void {
  const state = controller.snapshot();
  banner.textContent = state.error || state.notice || warning || connection ||
    (state.status === 'preparing' ? 'Preparing your next passage…' : `${profile.model === 'gpt-4o-mini-tts' ? 'OpenAI' : 'Fish Free'} narration · your place is saved automatically.`);
}
controller.subscribe(renderStatus);
mountSimpleReader({
  split: (text: string) => splitPassage(text, 1000),
  load: (passages: Passage[], index = 0) => controller.load(passages, passages[0] ? readPosition(passages[0].bookId) : undefined, index),
  play: () => controller.play(),
  pause: () => controller.pause(),
  seek: (index: number) => controller.seek(index),
  setRate: (rate: number) => controller.setRate(rate),
  snapshot: () => controller.snapshot(),
  subscribe: controller.subscribe.bind(controller),
});
mountKeySettings(() => controller.pause(), configured => { connection = configured ? '' : 'Add the selected provider’s API key in narrator settings to listen.'; renderStatus(); });
