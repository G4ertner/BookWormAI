import type { BookRecommendation } from '../server/recommendations.ts';

/** The browser receives book metadata only. Keys and Exa requests stay server-side. */
export function mountRecommendations(host: {
  select(book: BookRecommendation): void;
  shelvedIds(): ReadonlySet<number>;
}): { cancel(): void; refresh(): Promise<void> } {
  const pick = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const form = pick<HTMLFormElement>('recommend-form');
  const query = pick<HTMLInputElement>('recommend-query');
  const submit = pick<HTMLButtonElement>('recommend-submit');
  const cancelButton = pick<HTMLButtonElement>('recommend-cancel');
  const status = pick<HTMLParagraphElement>('recommend-status');
  const list = pick<HTMLDivElement>('recommend-results');
  let request: AbortController | null = null;
  let configRequest: AbortController | null = null;

  function cancel(): void {
    request?.abort(); request = null;
    configRequest?.abort(); configRequest = null;
    submit.disabled = false; cancelButton.hidden = true;
    list.setAttribute('aria-busy', 'false');
  }

  async function refresh(): Promise<void> {
    if (request) return;
    configRequest?.abort();
    const controller = new AbortController(); configRequest = controller;
    status.textContent = 'Checking book search…';
    try {
      const response = await fetch('/api/books/recommendations/config', { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]) });
      if (!response.ok) throw new Error();
      const config = await response.json();
      if (configRequest !== controller) return;
      status.textContent = config.configured ? 'Describe what you would enjoy reading next.' : 'Book recommendations are not connected yet. You can still use the Project Gutenberg tab.';
    } catch {
      if (configRequest === controller) status.textContent = 'Could not check book search. Try Find books to retry.';
    } finally { if (configRequest === controller) configRequest = null; }
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const term = query.value.trim();
    if (term.length < 3) { status.textContent = 'Describe a topic or mood in at least 3 characters.'; query.focus(); return; }
    cancel();
    const controller = new AbortController(); request = controller;
    submit.disabled = true; cancelButton.hidden = false;
    list.replaceChildren(); list.setAttribute('aria-busy', 'true');
    status.textContent = 'Finding books for you…';
    try {
      const response = await fetch('/api/books/recommendations', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Bookworm-Client': 'audio-v1' },
        body: JSON.stringify({ query: term }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(25_000)]),
      });
      const data = await response.json();
      if (request !== controller) return;
      if (!response.ok) throw new Error(data.error?.message || 'Book search failed. Please retry.');
      const books: BookRecommendation[] = data.books;
      const shelved = host.shelvedIds();
      for (const book of books) {
        const row = document.createElement('article'); row.className = 'recommend-card';
        const title = document.createElement('h3'); title.textContent = book.title;
        const source = document.createElement('a'); source.href = book.url;
        source.textContent = 'View on Project Gutenberg'; source.target = '_blank'; source.rel = 'noopener noreferrer';
        row.append(title);
        if (book.excerpt) {
          const excerpt = document.createElement('p'); excerpt.textContent = book.excerpt;
          const label = document.createElement('small'); label.textContent = 'From the source page';
          row.append(label, excerpt);
        }
        const actions = document.createElement('div'); actions.className = 'recommend-actions';
        const select = document.createElement('button'); select.type = 'button'; select.className = 'btn secondary';
        select.textContent = shelved.has(book.gid) ? 'In library' : 'Choose book'; select.disabled = shelved.has(book.gid);
        select.addEventListener('click', () => host.select(book));
        actions.append(source, select); row.append(actions); list.append(row);
      }
      status.textContent = books.length ? `${books.length} book matches for “${term}”. Search matches may vary in relevance.` : 'No matching book pages found. Try a broader topic or search by title in Project Gutenberg.';
    } catch (error) {
      if (request !== controller) return;
      status.textContent = error instanceof Error && error.name === 'TimeoutError' ? 'Book search took too long. Please retry.' : error instanceof TypeError ? 'Could not reach book search. Check your connection and retry.' : error instanceof Error ? error.message : 'Book search failed. Please retry.';
    } finally { if (request === controller) cancel(); }
  });
  cancelButton.addEventListener('click', () => { cancel(); status.textContent = 'Search cancelled. You can try another topic.'; query.focus(); });
  document.querySelectorAll<HTMLButtonElement>('[data-reading-interest]').forEach(button => {
    button.addEventListener('click', () => { query.value = button.dataset.readingInterest!; query.focus(); });
  });
  return { cancel, refresh };
}
