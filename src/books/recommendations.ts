import type { BookRecommendation } from '../server/recommendations.ts';

/** An interest built from the reader's own shelf: titles and authors, newest first.
 * Book text is never sent. Kept free of the DOM so it can be tested directly. */
export function shelfQuery(books: readonly { title: string; author: string }[]): string {
  // Imported metadata can carry newlines and run to 180 characters per field, which the
  // 3-300 character server contract rejects. Trim each field rather than drop the book,
  // then stop at the first entry that would overflow.
  const clean = (value: string, max: number) =>
    value.replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max).trim();
  let text = '';
  for (const book of books.slice(-3).reverse()) {
    const title = clean(book.title, 80);
    if (!title) continue;
    const author = clean(book.author, 60);
    const entry = author ? `${title} by ${author}` : title;
    const next = text ? `${text}; ${entry}` : `Books like ${entry}`;
    if (next.length > 300) break;
    text = next;
  }
  return text;
}

/** The browser receives book metadata only. Keys and Exa requests stay server-side. */
export function mountRecommendations(host: {
  select(book: BookRecommendation): void;
  settings(): void;
  shelvedIds(): ReadonlySet<number>;
  shelfBooks(): readonly { title: string; author: string }[];
}): { cancel(): void; refresh(): Promise<void> } {
  const pick = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const form = pick<HTMLFormElement>('recommend-form');
  const query = pick<HTMLInputElement>('recommend-query');
  const submit = pick<HTMLButtonElement>('recommend-submit');
  const shelf = pick<HTMLButtonElement>('recommend-shelf');
  const cancelButton = pick<HTMLButtonElement>('recommend-cancel');
  const status = pick<HTMLParagraphElement>('recommend-status');
  const list = pick<HTMLDivElement>('recommend-results');
  const setup = document.createElement('button'); setup.type = 'button'; setup.className = 'text-btn';
  setup.textContent = 'Recommendation settings'; setup.addEventListener('click', () => { cancel(); host.settings(); });
  status.after(setup);
  let request: AbortController | null = null;
  let configRequest: AbortController | null = null;

  function cancel(): void {
    request?.abort(); request = null;
    configRequest?.abort(); configRequest = null;
    submit.disabled = false; shelf.disabled = false; cancelButton.hidden = true;
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
      status.textContent = config.configured ? 'Describe what you would enjoy reading next.' : 'Add your Exa key in Recommendation settings to use For you. Gutenberg search still works without a key.';
    } catch {
      if (configRequest === controller) status.textContent = 'Could not check book search. Try Find books to retry.';
    } finally { if (configRequest === controller) configRequest = null; }
  }

  /** Shared by the typed form and the shelf button, so every caller is validated. */
  async function runSearch(term: string): Promise<void> {
    if (term.length < 3) { status.textContent = 'Describe a topic or mood in at least 3 characters.'; query.focus(); return; }
    cancel();
    const controller = new AbortController(); request = controller;
    submit.disabled = true; shelf.disabled = true; cancelButton.hidden = false;
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
  }

  form.addEventListener('submit', event => { event.preventDefault(); void runSearch(query.value.trim()); });
  // The interest lands in the same field, so the reader sees exactly what was sent.
  shelf.addEventListener('click', () => {
    const term = shelfQuery(host.shelfBooks());
    if (!term) { status.textContent = 'Add one of your own books to the shelf first, then try this again.'; return; }
    query.value = term;
    void runSearch(term);
  });
  cancelButton.addEventListener('click', () => { cancel(); status.textContent = 'Search cancelled. You can try another topic.'; query.focus(); });
  document.querySelectorAll<HTMLButtonElement>('[data-reading-interest]').forEach(button => {
    button.addEventListener('click', () => { query.value = button.dataset.readingInterest!; query.focus(); });
  });
  return { cancel, refresh };
}
