import './prototype/books.js';
import './prototype/epub.js';
import { AudioController } from '../audio/controller.ts';
import { BrowserAssets, BrowserMedia, readPosition, writePosition } from '../audio/browser.ts';
import { MODEL, splitPassage, type NarrationProfile, type Passage } from '../audio/types.ts';

let config: { configured: boolean; profile: NarrationProfile } = {
  configured: false, profile: { id: 'unconfigured', model: MODEL, voice: null },
};
let connectionError = '';
try {
  const response = await fetch('/api/audio/config', { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error('The audio server is unavailable.');
  config = await response.json();
} catch { connectionError = 'The audio server could not be reached. Start it with pnpm dev, then reload.'; }
let warning = '';
const banner = document.querySelector<HTMLDivElement>('#audio-status')!;
const assets = new BrowserAssets(config.profile, message => { warning = message; renderStatus(); });
const controller = new AudioController(new BrowserMedia(), assets, position => {
  try { writePosition(position); }
  catch { warning = 'Your browser cannot save listening position. Keep this tab open or enable storage.'; renderStatus(); }
});
function renderStatus(): void {
  const state = controller.snapshot();
  banner.textContent = state.error || state.notice || warning || connectionError ||
    (!config.configured ? 'Add OPENROUTER_API_KEY to the server .env file, restart with pnpm dev, and reload. You can still read your books.' :
      state.status === 'preparing' ? 'Preparing your next passage… You can pause or choose another passage.' :
      config.profile.model === 'test/fixture' ? 'Test audio fixture · not Fish Audio narration.' : 'Fish Audio narration · your place is saved automatically.');
  banner.classList.toggle('error', Boolean(state.error || connectionError || !config.configured));
}
controller.subscribe(renderStatus);

const bridge = {
  split: (text: string) => splitPassage(text, 1000), // Short coherent passages; no chapter crossings.
  load: (passages: Passage[], index = 0, restore = true) => {
    const resume = restore && passages[0] ? readPosition(passages[0].bookId) : undefined;
    controller.load(passages, resume, index);
  },
  play: () => controller.play(),
  pause: () => controller.pause(),
  seek: (index: number) => controller.seek(index),
  snapshot: () => controller.snapshot(),
  subscribe: controller.subscribe.bind(controller),
  checkpoint: () => controller.checkpoint(),
  setRate: (rate: number) => controller.setRate(rate),
  setMuted: (muted: boolean) => controller.setMuted(muted),
  clear: async () => {
    controller.load([]); // Detach the old selection before removing its saved position.
    try {
      for (const key of Object.keys(localStorage)) if (key.startsWith('bookworm-audio-position:')) localStorage.removeItem(key);
      await assets.clear();
    } catch { warning = 'Some browser data could not be cleared. Clear this site’s storage in browser settings.'; renderStatus(); }
  },
};
declare global { interface Window { bookwormAudio: typeof bridge } }
window.bookwormAudio = bridge;
await import('./prototype/ui.js');
