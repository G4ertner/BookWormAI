/** Shared settings UI; credentials are never read back or stored in the browser. */
export function mountKeySettings(pause: () => void, changed: (configured: boolean) => void): void {
  const dialog = document.querySelector<HTMLDialogElement>('#settings-dialog')!;
  const section = document.createElement('section');
  section.style.cssText = 'margin:20px 0;padding:18px 0;border-top:1px solid #ddd;border-bottom:1px solid #ddd';
  section.innerHTML = `<form id="api-key-form" autocomplete="off">
    <label for="openrouter-key" style="display:block;font-weight:600;margin-bottom:8px">OpenRouter API key</label>
    <input id="openrouter-key" type="password" autocomplete="off" spellcheck="false" autocapitalize="none" minlength="20" maxlength="512" placeholder="Paste your OpenRouter key" required style="width:100%;box-sizing:border-box;padding:12px;border:1px solid #ccc;border-radius:6px;background:transparent">
    <p style="font-size:12px;margin:8px 0">Saved on this computer’s local server, shared by both versions. Never saved in browser storage. Changes apply immediately.</p>
    <div style="display:flex;gap:12px;flex-wrap:wrap"><button type="submit" style="padding:10px 16px;background:#294d3d;color:white;border-radius:6px">Save API key</button><button type="button" id="remove-api-key" style="padding:10px 16px;border:1px solid #ccc;border-radius:6px">Remove API key</button></div>
    <p id="api-key-status" role="status" aria-live="polite" style="font-size:13px;margin-top:10px">Checking key setup…</p>
  </form>`;
  const heading = dialog.querySelector('h2')!;
  (heading.closest('header') ?? heading).after(section);
  const form = section.querySelector<HTMLFormElement>('form')!;
  const input = section.querySelector<HTMLInputElement>('input')!;
  const status = section.querySelector<HTMLElement>('#api-key-status')!;
  const remove = section.querySelector<HTMLButtonElement>('#remove-api-key')!;
  const buttons = section.querySelectorAll<HTMLButtonElement>('button');
  let busy = false;
  let epoch = 0;
  async function refresh(): Promise<void> {
    const attempt = ++epoch;
    try {
      const response = await fetch('/api/audio/config', { signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error();
      const config = await response.json();
      if (attempt !== epoch || busy) return;
      status.textContent = config.configured ? 'A key is configured. Enter another key to replace it.' : 'No key configured. Add one to enable narration.';
      remove.disabled = !config.configured;
      changed(config.configured);
    } catch { if (attempt === epoch && !busy) status.textContent = 'Cannot reach the local audio server. Restart it and reload.'; }
  }
  async function update(removing: boolean): Promise<void> {
    if (busy) return;
    const apiKey = input.value.trim();
    input.value = '';
    busy = true; epoch++; pause();
    buttons.forEach(button => { button.disabled = true; });
    status.textContent = removing ? 'Removing key…' : 'Saving key…';
    try {
      const response = await fetch('/api/audio/key', {
        method: removing ? 'DELETE' : 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Bookworm-Client': 'audio-v1' },
        body: JSON.stringify(removing ? {} : { apiKey }), signal: AbortSignal.timeout(10000),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || 'Key update failed.');
      changed(result.configured);
      status.textContent = removing ? 'Key removed. New narration is disabled; cached audio can still play.' : 'Key saved. Press Play to verify narration with OpenRouter.';
    } catch (error) { status.textContent = error instanceof Error && error.name !== 'TimeoutError' ? error.message : 'The server did not respond. Reopen settings to check whether the update completed.'; }
    finally { busy = false; buttons.forEach(button => { button.disabled = false; }); }
  }
  form.addEventListener('submit', event => { event.preventDefault(); void update(false); });
  remove.addEventListener('click', () => { void update(true); });
  dialog.addEventListener('close', () => { input.value = ''; });
  new MutationObserver(() => { if (dialog.open && !busy) void refresh(); }).observe(dialog, { attributes: true, attributeFilter: ['open'] });
  void refresh();
}
