import { OPENAI_VOICES, type AudioSettings, type ProviderId } from './catalog.ts';

/** Shared settings UI. Secrets are write-only; profile changes reload the audio adapter. */
export function mountKeySettings(pause: () => void, changed: (configured: boolean) => void): void {
  const dialog = document.querySelector<HTMLDialogElement>('#settings-dialog')!;
  const section = document.createElement('section');
  section.style.cssText = 'margin:20px 0;padding:18px 0;border-top:1px solid #ddd;border-bottom:1px solid #ddd';
  const fieldStyle = 'width:100%;box-sizing:border-box;padding:12px;border:1px solid #ccc;border-radius:6px;background:transparent';
  section.innerHTML = `<form id="narration-settings-form">
    <label for="narration-model">Narration model</label>
    <select id="narration-model" style="${fieldStyle}"><option value="openrouter">Fish S2.1 Pro Free · OpenRouter</option><option value="openai">GPT-4o Mini TTS · OpenAI (paid)</option></select>
    <label for="narration-voice" style="display:block;margin-top:12px">Narration voice</label>
    <select id="narration-voice" style="${fieldStyle}"></select>
    <p style="font-size:12px;margin:8px 0">OpenAI uses your OpenAI API key and sends narration passages directly to OpenAI. Both versions share this choice.</p>
    <button type="submit" style="padding:10px 16px;background:#294d3d;color:white;border-radius:6px">Apply model and voice</button>
  </form>
  ${(['openrouter', 'openai'] as const).map(id => {
    const name = id === 'openai' ? 'OpenAI' : 'OpenRouter';
    return `<form data-key-provider="${id}" autocomplete="off" style="margin-top:22px">
      <label for="${id}-key" style="display:block;font-weight:600;margin-bottom:8px">${name} API key</label>
      <input id="${id}-key" type="password" autocomplete="off" spellcheck="false" autocapitalize="none" minlength="20" maxlength="512" placeholder="Paste your ${name} key" required style="${fieldStyle}">
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:8px"><button type="submit" style="padding:10px 16px;background:#294d3d;color:white;border-radius:6px">Save ${name} key</button><button type="button" data-remove="${id}" style="padding:10px 16px;border:1px solid #ccc;border-radius:6px">Remove ${name} key</button></div>
      <p data-key-state="${id}" style="font-size:12px;margin-top:8px">Checking setup…</p>
    </form>`;
  }).join('')}
  <p style="font-size:12px;margin:12px 0">Keys stay on this computer’s local server, survive restarts, and are never saved in browser storage. Each key is sent only to its own provider.</p>
  <p id="api-key-status" role="status" aria-live="polite" style="font-size:13px;margin-top:10px"></p>`;
  const heading = dialog.querySelector('h2')!;
  (heading.closest('header') ?? heading).after(section);
  const model = section.querySelector<HTMLSelectElement>('#narration-model')!;
  const voice = section.querySelector<HTMLSelectElement>('#narration-voice')!;
  const status = section.querySelector<HTMLElement>('#api-key-status')!;
  const controls = section.querySelectorAll<HTMLButtonElement | HTMLSelectElement>('button,select');
  let busy = false;
  let epoch = 0;
  function voices(selected = 'marin'): void {
    voice.replaceChildren(...(model.value === 'openai' ? [...OPENAI_VOICES] : ['']).map(id => new Option(id ? id[0]!.toUpperCase() + id.slice(1) : 'Server-configured Fish voice', id)));
    voice.value = model.value === 'openai' ? selected : '';
    voice.disabled = model.value !== 'openai';
  }
  model.addEventListener('change', () => voices());
  voices();
  async function refresh(): Promise<void> {
    const attempt = ++epoch;
    const response = await fetch('/api/audio/config', { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error('Cannot reach the local audio server.');
    const config = await response.json() as AudioSettings & { configured: boolean };
    if (attempt !== epoch) return;
    if (!config.selection || !config.keys) throw new Error('Restart the audio server to enable model selection.');
    model.value = config.selection.provider; voices(config.selection.voice || 'marin');
    for (const id of ['openrouter', 'openai'] as const) section.querySelector<HTMLElement>(`[data-key-state="${id}"]`)!.textContent = config.keys[id] ? 'Key configured. Enter a key to replace it.' : 'No key configured.';
    changed(config.configured);
  }
  async function update(path: string, method: string, body: unknown, message: string, reload = false): Promise<void> {
    if (busy) return;
    busy = true; epoch++; pause(); controls.forEach(control => { control.disabled = true; });
    status.textContent = 'Saving…';
    try {
      const response = await fetch(path, { method, headers: { 'Content-Type': 'application/json', 'X-Bookworm-Client': 'audio-v1' }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || 'Settings could not be saved.');
      if (reload) { location.reload(); return; }
      await refresh(); status.textContent = message;
    } catch (error) { status.textContent = error instanceof Error && error.name !== 'TimeoutError' ? error.message : 'The server did not respond. Reopen settings to check whether the update completed.'; }
    finally { busy = false; controls.forEach(control => { control.disabled = false; }); voice.disabled = model.value !== 'openai'; }
  }
  section.querySelector<HTMLFormElement>('#narration-settings-form')!.addEventListener('submit', event => {
    event.preventDefault(); void update('/api/audio/selection', 'PUT', { provider: model.value, voice: voice.value }, 'Narration updated.', true);
  });
  for (const form of section.querySelectorAll<HTMLFormElement>('[data-key-provider]')) {
    const provider = form.dataset.keyProvider as ProviderId;
    const input = form.querySelector<HTMLInputElement>('input')!;
    form.addEventListener('submit', event => { event.preventDefault(); const apiKey = input.value.trim(); input.value = ''; void update('/api/audio/key', 'PUT', { provider, apiKey }, 'Key saved. Select its model and press Play to verify narration.'); });
    form.querySelector('button[type="button"]')!.addEventListener('click', () => { input.value = ''; void update('/api/audio/key', 'DELETE', { provider }, 'Key removed for this provider. Cached audio can still play.'); });
  }
  dialog.addEventListener('close', () => section.querySelectorAll<HTMLInputElement>('input').forEach(input => { input.value = ''; }));
  const refreshSafely = () => { if (!busy) void refresh().catch(() => { status.textContent = 'Cannot load settings. Restart the server and reload.'; }); };
  new MutationObserver(() => { if (dialog.open) refreshSafely(); }).observe(dialog, { attributes: true, attributeFilter: ['open'] });
  refreshSafely();
}
