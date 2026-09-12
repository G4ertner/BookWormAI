import { digest } from '../audio/browser.ts';
import type { ReaderContext, Source } from './types.ts';
import { companionRequest, discuss } from './controller.ts';
import type { Discussion } from './controller.ts';
import { loadDiscussion, saveDiscussion } from './storage.ts';

export interface ReaderBridge {
  snapshot(): { bookId: string; title: string; author: string; sample: boolean; index: number; sources: Source[] };
  open(): void;
  pause(): void;
  resume(): void;
  subscribe(listener: (bookId: string, index: number) => void): () => void;
}
export function mountCompanion(reader: ReaderBridge): void {
  const dialog = document.querySelector<HTMLDialogElement>('#companion-dialog')!;
  const find = <T extends HTMLElement>(id: string) => dialog.querySelector<T>(`#${id}`)!;
  const messages = find('companion-messages'), status = find('companion-status'), location = find('companion-location');
  const input = find<HTMLTextAreaElement>('companion-question'), form = find<HTMLFormElement>('companion-form');
  const scope = find<HTMLSelectElement>('companion-scope'), web = find<HTMLInputElement>('companion-web');
  const send = find<HTMLButtonElement>('companion-send'), cancel = find<HTMLButtonElement>('companion-cancel');
  const clear = find<HTMLButtonElement>('companion-clear'), preview = find('companion-source');
  let context: ReaderContext | undefined, pool: Source[] = [], history: Discussion[] = [], storageKey = '', epoch = 0, job: AbortController | undefined, selection = '';
  let remembered = '', storageWarning = '';
  function stop(): void { epoch++; job?.abort(); job = undefined; send.disabled = false; input.disabled = false; cancel.hidden = true; scope.disabled = false; web.disabled = false; clear.disabled = false; messages.setAttribute('aria-busy', 'false'); }
  function text(tag: string, content: string, className = ''): HTMLElement { const el = document.createElement(tag); el.textContent = content; el.className = className; return el; }
  function showSource(s: Source): void {
    preview.replaceChildren(text('p', s.kind === 'book' ? 'From your book · ' + s.title : 'Outside research · ' + s.title, 'eyebrow'), text('blockquote', s.text));
    if (s.kind === 'web' && s.url) { const a = document.createElement('a'); a.href = s.url; a.textContent = 'Open source website'; a.target = '_blank'; a.rel = 'noopener noreferrer'; preview.append(a); }
    const close = document.createElement('button'); close.className = 'text-btn'; close.textContent = 'Return to discussion'; close.onclick = () => { preview.hidden = true; input.focus(); }; preview.append(close); preview.hidden = false; preview.scrollIntoView({ block: 'nearest' });
  }
  function render(): void {
    messages.replaceChildren();
    if (!history.length) messages.append(text('p', 'A little company for your reading. Ask about this passage, revisit an earlier scene, or share what you think.', 'companion-empty'));
    for (const h of history) {
      const question = text('p', h.question, 'companion-question');
      const answer = document.createElement('article'); answer.className = 'companion-answer';
      if (h.notice) answer.append(text('p', h.notice, 'error'));
      for (const block of h.answer.blocks) {
        if (block.kind !== 'book') answer.append(text('small', block.kind === 'interpretation' ? 'One interpretation' : 'Outside the book', 'companion-kind'));
        answer.append(text('p', block.text));
        for (const citation of block.citations) {
          const s = h.sources.find(s => s.id === citation.id); if (!s) continue;
          const button = document.createElement('button'); button.className = 'companion-citation'; button.textContent = `${s.kind === 'book' ? 'Book' : 'Web'} · ${s.title}`; button.title = citation.quote; button.onclick = () => showSource(s); answer.append(button);
        }
      }
      if (h.answer.followUp) answer.append(text('p', h.answer.followUp, 'companion-followup'));
      messages.append(question, answer);
    }
  }
  async function refresh(): Promise<void> {
    stop(); const attempt = epoch; storageWarning = ''; preview.hidden = true; status.textContent = 'Opening your discussion…';
    const snapshot = reader.snapshot(); pool = snapshot.sources;
    const current = pool[snapshot.index]; if (!current) return;
    context = { bookId: snapshot.bookId.slice(0, 120), title: snapshot.title.slice(0, 250), author: snapshot.author.slice(0, 250), sample: snapshot.sample, boundary: snapshot.index, scope: scope.value === 'whole' ? 'whole' : 'position', current, selection: current.text.includes(selection) ? selection.slice(0, 1600) : '' };
    location.textContent = `${snapshot.title} · ${current.title}${snapshot.sample ? ' · Adapted sample' : ''}`;
    find('companion-selection').textContent = context.selection ? `Selected: “${context.selection}”` : `Discussing: “${current.text.slice(0, 170)}${current.text.length > 170 ? '…' : ''}”`;
    send.disabled = true; clear.disabled = true;
    try {
      const hash = await digest(JSON.stringify(pool.map(s => [s.id, s.text])));
      if (attempt !== epoch) return;
      storageKey = `${context.bookId}:${hash}:${context.scope}`;
      const loaded = await loadDiscussion(storageKey);
      if (attempt !== epoch) return;
      history = loaded.filter(h => context!.scope === 'whole' || h.boundary <= context!.boundary);
    } catch { if (attempt !== epoch) return; history = []; storageWarning = 'Discussion is available for this session; browser storage is unavailable.'; }
    if (attempt !== epoch) return;
    render(); send.disabled = false; clear.disabled = false; status.textContent = storageWarning || 'Your listening place is saved. Responses use Gemini 2.5 Flash.';
    void fetch('/api/companion/config', { signal: AbortSignal.timeout(5000) }).then(async response => {
      if (!response.ok) throw new Error(); const config = await response.json(); if (attempt !== epoch) return;
      if (!config.configured) status.textContent = 'Add an OpenRouter key in Reader settings to start a discussion.';
      find('companion-web-note').textContent = config.webConfigured ? 'Exa is connected. Outside research sends a topic query to Exa and may reveal spoilers.' : 'Outside research needs an Exa key in Reader settings. Book discussion works without it.';
    }).catch(() => { if (attempt === epoch) status.textContent = 'Cannot reach the companion service. Close and reopen to retry.'; });
  }
  const open = document.querySelector<HTMLButtonElement>('#companion-open')!;
  open.addEventListener('pointerdown', () => {
    const selected = window.getSelection(); selection = selected?.anchorNode && document.querySelector('#prose')?.contains(selected.anchorNode) ? selected.toString().trim().slice(0, 1600) : '';
  });
  open.onclick = () => { reader.pause(); dialog.showModal(); void refresh().then(() => input.focus()); };
  const introToggle = document.querySelector<HTMLButtonElement>('#companion-intro-toggle')!;
  const introBody = document.querySelector<HTMLElement>('#companion-intro-body')!;
  introToggle.onclick = () => {
    const expanded = introToggle.getAttribute('aria-expanded') !== 'true';
    introToggle.setAttribute('aria-expanded', String(expanded));
    introBody.hidden = !expanded;
    introToggle.innerHTML = `${expanded ? 'Show less' : 'Show more'} <span aria-hidden="true">${expanded ? '⌃' : '⌄'}</span>`;
  };
  for (const entrance of document.querySelectorAll<HTMLButtonElement>('[data-home-companion]')) {
    entrance.onclick = () => {
      selection = ''; reader.pause(); reader.open();
      input.value = entrance.dataset.homeCompanion || '';
      dialog.showModal(); void refresh().then(() => input.focus());
    };
  }
  scope.onchange = () => { selection = ''; void refresh(); };
  web.onchange = () => { status.textContent = web.checked ? 'The companion may use Exa for background research. Search results can contain spoilers.' : 'Discussion will use the book and general model knowledge, without web search.'; };
  find('companion-close').onclick = () => dialog.close();
  find('companion-resume').onclick = () => { dialog.close(); reader.resume(); };
  dialog.addEventListener('close', () => { stop(); selection = ''; preview.hidden = true; });
  cancel.onclick = () => { stop(); status.textContent = 'Discussion cancelled. Your listening place is unchanged.'; input.focus(); };
  clear.onclick = async () => {
    stop(); history = []; render(); preview.hidden = true;
    try { await saveDiscussion(storageKey, []); status.textContent = 'Discussion cleared for this book and reading mode.'; } catch { status.textContent = 'Discussion cleared in this session; browser storage could not be updated.'; }
  };
  for (const button of dialog.querySelectorAll<HTMLButtonElement>('[data-companion-prompt]')) button.onclick = () => { input.value = button.dataset.companionPrompt!; input.focus(); };
  reader.subscribe((bookId, index) => { const current = `${bookId}:${index}`; if (remembered && current !== remembered && dialog.open) { selection = ''; void refresh(); } remembered = current; });
  form.onsubmit = async event => {
    event.preventDefault(); if (!context || job || send.disabled) return;
    const question = input.value.trim(); if (!question) return;
    const attempt = ++epoch; job = new AbortController(); const signal = job.signal;
    send.disabled = true; cancel.hidden = false; scope.disabled = true; web.disabled = true; clear.disabled = true; messages.setAttribute('aria-busy', 'true'); preview.hidden = true;
    try {
      const result = await discuss(context, pool, question, history, web.checked, signal, message => { if (attempt === epoch) status.textContent = message; });
      if (attempt !== epoch) return;
      history = [...history, result].slice(-8); input.value = ''; render();
      try { await saveDiscussion(storageKey, history); } catch { storageWarning = 'This discussion could not be saved. It will last for this session.'; }
      if (attempt !== epoch) return;
      status.textContent = storageWarning || 'Check the cited passages together. Your listening place is unchanged.';
      messages.lastElementChild?.scrollIntoView({ block: 'nearest' });
    } catch (error) { if (attempt === epoch) status.textContent = error instanceof Error ? error.message : 'The companion could not answer. Please retry.'; }
    finally { if (attempt === epoch) { job = undefined; send.disabled = false; cancel.hidden = true; scope.disabled = false; web.disabled = false; clear.disabled = false; messages.setAttribute('aria-busy', 'false'); input.focus(); } }
  };
  mountCompanionSettings();
}

function mountCompanionSettings(): void {
  const settings = document.querySelector<HTMLDialogElement>('#settings-dialog')!;
  const section = document.createElement('section'); section.className = 'companion-settings';
  section.innerHTML = `<h3>Reading companion</h3><p>Gemini 2.5 Flash uses your saved OpenRouter key, independently of the narration model. Questions, relevant book excerpts and recent discussion go through this server to OpenRouter.</p><form id="companion-exa-form" autocomplete="off"><label class="field" for="companion-exa-key">Exa API key · optional outside research</label><input id="companion-exa-key" type="password" minlength="20" maxlength="512" required autocomplete="off" spellcheck="false" placeholder="Paste your Exa key"><div class="companion-actions"><button type="submit" class="btn secondary">Save Exa key</button><button type="button" id="companion-exa-remove" class="text-btn">Remove Exa key</button></div></form><p id="companion-setup-status" role="status"></p>`;
  settings.append(section);
  const input = section.querySelector<HTMLInputElement>('input')!, status = section.querySelector<HTMLElement>('#companion-setup-status')!;
  let busy = false;
  async function refresh() {
    try { const r = await fetch('/api/companion/config', { signal: AbortSignal.timeout(5000) }); if (!r.ok) throw new Error(); const c = await r.json(); status.textContent = `${c.configured ? 'OpenRouter key saved.' : 'Save an OpenRouter key above.'} ${c.webConfigured ? 'Exa key configured.' : 'No Exa key configured.'} Keys stay on the server; saved does not mean verified.`; }
    catch { status.textContent = 'Companion settings are unavailable. Reopen to retry.'; }
  }
  async function update(remove: boolean) {
    if (busy) return; busy = true;
    const key = input.value.trim(); input.value = '';
    section.querySelectorAll<HTMLButtonElement>('button').forEach(b => { b.disabled = true; }); status.textContent = 'Saving…';
    try { await companionRequest('exa-key', remove ? {} : { apiKey: key }, new AbortController().signal, remove ? 'DELETE' : 'PUT'); await refresh(); }
    catch (error) { status.textContent = error instanceof Error ? error.message : 'Could not save the search key.'; }
    finally { busy = false; section.querySelectorAll<HTMLButtonElement>('button').forEach(b => { b.disabled = false; }); }
  }
  section.querySelector<HTMLFormElement>('form')!.onsubmit = e => { e.preventDefault(); void update(false); };
  section.querySelector<HTMLButtonElement>('#companion-exa-remove')!.onclick = () => { void update(true); };
  settings.addEventListener('close', () => { input.value = ''; });
  new MutationObserver(() => { if (settings.open && !busy) void refresh(); }).observe(settings, { attributes: true, attributeFilter: ['open'] });
}
