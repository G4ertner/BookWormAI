/**
 * Bookworm — Project Gutenberg catalogue, fetched directly from gutenberg.org.
 *
 * No third-party mirror. Search uses Project Gutenberg's own OPDS feed, which
 * is the only endpoint on the site that sends `Access-Control-Allow-Origin: *`
 * and is therefore the only one a browser may read cross-origin. Every measured
 * fact below was checked against the live site rather than assumed.
 *
 * Verified 2026-09-12:
 *
 *   GET /ebooks/search.opds/?query=austen
 *     200, ~400 ms, ~62 KB, `access-control-allow-origin: *`
 *
 *   GET /ebooks/1342.opds                 200, `access-control-allow-origin: *`
 *   GET /ebooks/1342.epub.noimages        200, 558 KB, no CORS header
 *   GET /cache/epub/1342/pg1342.epub      200, 558 KB, no CORS header
 *   GET /cache/epub/1342/pg1342.txt       200, 772 KB, no CORS header
 *   GET /ebooks/1342.epub3.images         200,  24.8 MB, no CORS header
 *   GET /ebooks/1342.txt.utf-8            redirects to a path with no header
 *   GET /ebooks/1342.html.images          redirects to a path with no header
 *   GET mirrors.xmission.com/gutenberg/…  200, no CORS header
 *
 * Only `.opds` documents carry the header. No route to a book's text is
 * readable by a web page, so a browser cannot silently import one; a packaged
 * build, having no same-origin policy, can. The design below follows from that
 * rather than pretending otherwise.
 *
 * Two consequences shape this whole file:
 *
 * 1. Book files cannot be read by `fetch` from a web page — no CORS header,
 *    on any path shape tried. A *download*, though, is a navigation, not an
 *    XHR, and navigations ignore CORS entirely. So "Add" starts a real browser
 *    download and then imports the saved file. Two steps, no proxy, no server.
 *    `tryDirectFetch` still runs first so that a packaged/native build — where
 *    there is no same-origin policy — imports in one step automatically.
 *
 * 2. Always request `.epub.noimages`. The illustrated build of Pride and
 *    Prejudice is 24.8 MB against 558 KB for the same text: 44x the bytes for
 *    pictures a narrator never reads.
 *
 * Built with `npm run build`, which compiles this and inlines the output into
 * index.html. It deliberately has no import/export, so TypeScript emits a
 * classic script: an inline ES module would be invisible to the page's other
 * script, and an external one would not load from file:// at all.
 */

interface ParagraphData {
  text: string;
}

interface ChapterData {
  title: string;
  paragraphs: ParagraphData[];
}

/** A book in the shape the existing reader and player already consume. */
interface ImportedBook {
  id: string;
  title: string;
  author: string;
  chapters: ChapterData[];
  gutenbergId?: number;
  style?: string;
  art?: string;
  sample?: boolean;
  cover?: string;
}

/** One search hit, parsed out of the OPDS feed. */
interface CatalogBook {
  readonly gid: number;
  readonly title: string;
  readonly author: string;
  /** data: URL for the cover, carried inside the feed at no extra cost. */
  readonly thumbnail: string;
}

interface SearchPage {
  readonly books: readonly CatalogBook[];
  readonly nextUrl: string;
}

/** Everything the module needs from the page, so it touches no globals. */
interface CatalogHost {
  escapeHTML(value: string): string;
  parseEpub(file: File): Promise<ImportedBook>;
  shelvedIds(): ReadonlySet<number>;
  addToLibrary(book: ImportedBook): void;
  isReadable(book: ImportedBook): boolean;
}

interface CatalogController {
  render(): void;
  search(query: string, append?: boolean): Promise<void>;
  add(gid: number): void;
  download(gid: number): void;
  cancelPending(): void;
  importPending(file: File): Promise<void>;
  reset(): void;
  /** Called when the Gutenberg tab opens, to learn early whether this runtime
   *  may read book files. Knowing before the first click is what lets Add stay
   *  inside the user's gesture and open the file picker itself. */
  probe(): void;
}

(function () {
  'use strict';

  const ORIGIN = 'https://www.gutenberg.org';
  /** Trailing slash included: without it the site 301s, and a redirect without
   *  a CORS header is fatal to a cross-origin request. */
  const SEARCH_URL = `${ORIGIN}/ebooks/search.opds/`;
  const SEARCH_TIMEOUT = 20_000;
  const DIRECT_FETCH_TIMEOUT = 8_000;
  const EPUB_LIMIT = 10 * 1024 * 1024;
  const TEXT_LIMIT = 3 * 1024 * 1024;
  const MAX_PARAGRAPH = 1400;
  const CACHE_LIMIT = 24;

  const GUTENBERG_HOST = /(^|\.)gutenberg\.org$/i;

  /** Smallest EPUB Gutenberg publishes for a book: text without illustrations. */
  const epubUrl = (gid: number): string => `${ORIGIN}/ebooks/${gid}.epub.noimages`;
  /** Same bytes by another route; used if the first 404s on an odd record. */
  const epubMirrorUrl = (gid: number): string => `${ORIGIN}/cache/epub/${gid}/pg${gid}.epub`;
  const textUrl = (gid: number): string => `${ORIGIN}/cache/epub/${gid}/pg${gid}.txt`;
  const bookPageUrl = (gid: number): string => `${ORIGIN}/ebooks/${gid}`;

  /* ---------------------------------------------------------------------- */
  /* Parsing the feed                                                        */
  /* ---------------------------------------------------------------------- */

  /** Re-parse any URL the feed hands us and pin it to gutenberg.org. */
  function pinnedUrl(value: string | null): string {
    if (!value) return '';
    let url: URL;
    try {
      url = new URL(value, ORIGIN);
    } catch {
      return '';
    }
    if (url.protocol === 'http:') url.protocol = 'https:';
    if (url.protocol !== 'https:') return '';
    return GUTENBERG_HOST.test(url.hostname) ? url.href : '';
  }

  const firstText = (entry: Element, tag: string): string =>
    entry.getElementsByTagName(tag)[0]?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

  /**
   * Parse one OPDS entry. Real entries look like:
   *
   *   <entry>
   *     <id>https://www.gutenberg.org/ebooks/1342.opds</id>
   *     <title>Pride and Prejudice</title>
   *     <content type="text">Jane Austen</content>
   *     <link rel="http://opds-spec.org/image/thumbnail" href="data:image/png;base64,…"/>
   *   </entry>
   *
   * The feed also carries navigation entries (an "Authors" row, for instance)
   * whose ids are not book ids; requiring `/ebooks/<digits>.opds` drops them.
   */
  function parseEntry(entry: Element): CatalogBook | null {
    const id = firstText(entry, 'id');
    const match = /\/ebooks\/(\d+)(?:\.opds)?$/.exec(id);
    if (!match) return null;

    const gid = Number(match[1]);
    const title = firstText(entry, 'title');
    if (!Number.isInteger(gid) || gid <= 0 || !title) return null;

    // The thumbnail is a data: URL already inside the response — about four
    // fifths of its bytes. Rendering it costs no request and no extra byte;
    // ignoring it would waste what we already paid for.
    let thumbnail = '';
    for (const link of Array.from(entry.getElementsByTagName('link'))) {
      const rel = link.getAttribute('rel') ?? '';
      const href = link.getAttribute('href') ?? '';
      if (rel.includes('image/thumbnail') && href.startsWith('data:image/')) {
        thumbnail = href;
        break;
      }
    }

    return {
      gid,
      title: title.slice(0, 180),
      author: (firstText(entry, 'content') || 'Project Gutenberg').slice(0, 180),
      thumbnail,
    };
  }

  function parseFeed(xml: string): SearchPage {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) {
      throw new Error('Project Gutenberg sent a search result this app could not read.');
    }

    const books: CatalogBook[] = [];
    for (const entry of Array.from(doc.getElementsByTagName('entry'))) {
      const book = parseEntry(entry);
      if (book) books.push(book);
    }

    let nextUrl = '';
    for (const link of Array.from(doc.getElementsByTagName('link'))) {
      if (link.getAttribute('rel') === 'next') {
        nextUrl = pinnedUrl(link.getAttribute('href'));
        break;
      }
    }

    return { books, nextUrl };
  }

  /* ---------------------------------------------------------------------- */
  /* Plain text -> chapters                                                  */
  /* ---------------------------------------------------------------------- */

  /**
   * Gutenberg brackets every work with a licence header and footer and marks
   * both. Cutting at its own markers is exact, not heuristic — which is what
   * makes a book open on its first real line rather than on publishing notes.
   */
  function trimBoilerplate(text: string): string {
    const opening = /\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[\s\S]{0,300}?\*\*\*/i.exec(text);
    if (opening) text = text.slice(opening.index + opening[0].length);
    const closing = /\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK/i.exec(text);
    if (closing) text = text.slice(0, closing.index);
    return text.trim();
  }

  function splitLong(text: string): string[] {
    const pieces: string[] = [];
    while (text.length > MAX_PARAGRAPH) {
      let cut = text.lastIndexOf(' ', MAX_PARAGRAPH - 100);
      if (cut < 1) cut = MAX_PARAGRAPH - 100;
      pieces.push(text.slice(0, cut).trim());
      text = text.slice(cut).trim();
    }
    if (text) pieces.push(text);
    return pieces;
  }

  function chaptersFromText(text: string): ChapterData[] {
    const chapters: ChapterData[] = [];
    let current: ChapterData | null = null;
    let total = 0;

    const blocks = text
      .split(/\n\s*\n/)
      .map((block) => block.replace(/\s+/g, ' ').trim())
      .filter(Boolean);

    for (const block of blocks) {
      if (block.length <= 90 && /^(chapter|part|book|canto|letter|act|scene)\b[\s.]*[ivxlcdm\d]/i.test(block)) {
        current = { title: block, paragraphs: [] };
        chapters.push(current);
        continue;
      }
      if (!current) {
        current = { title: 'Opening', paragraphs: [] };
        chapters.push(current);
      }
      total += block.length;
      if (total > TEXT_LIMIT) {
        throw new Error('This book has more than 3 MB of text. Please use a shorter book or excerpt.');
      }
      for (const piece of splitLong(block)) current.paragraphs.push({ text: piece });
    }

    return chapters.filter((chapter) => chapter.paragraphs.length > 0);
  }

  function bookFromPlainText(text: string, title: string, author: string): ImportedBook {
    const chapters = chaptersFromText(trimBoilerplate(text));
    if (!chapters.length) throw new Error('No readable text was found.');
    return {
      id: 'upload-' + crypto.randomUUID(),
      title: String(title).slice(0, 180),
      author: String(author).slice(0, 180),
      chapters,
    };
  }

  /* ---------------------------------------------------------------------- */
  /* Controller                                                              */
  /* ---------------------------------------------------------------------- */

  function mount(host: CatalogHost): CatalogController {
    const pick = <T extends HTMLElement>(selector: string): T =>
      document.querySelector(selector) as T;

    const listEl = pick<HTMLDivElement>('#catalog');
    const statusEl = pick<HTMLParagraphElement>('#catalog-status');
    const pendingEl = pick<HTMLDivElement>('#catalog-pending');

    let request: AbortController | null = null;
    let results: CatalogBook[] = [];
    let nextUrl = '';
    let query = '';
    let busy = false;
    let pending: CatalogBook | null = null;

    /**
     * Whether this runtime may read a book file across origins: true in a
     * packaged app, false in a browser, null until measured. Measured once
     * against the smallest book in the catalogue (id 1, a few KB) so the probe
     * costs almost nothing, and in a browser costs nothing at all — CORS
     * refuses it before a byte moves.
     */
    let directAllowed: boolean | null = null;
    let probing: Promise<boolean> | null = null;

    function probeDirect(): Promise<boolean> {
      if (directAllowed !== null) return Promise.resolve(directAllowed);
      if (probing) return probing;
      probing = (async () => {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 6000);
          try {
            const response = await fetch(epubUrl(1), { signal: controller.signal });
            directAllowed = response.ok;
          } finally {
            clearTimeout(timer);
          }
        } catch {
          directAllowed = false;
        }
        return directAllowed ?? false;
      })();
      return probing;
    }

    /**
     * Results keyed by request URL. Searching is the one thing a reader does
     * repeatedly — type, backspace, retype, page back — and every repeat here
     * is a round trip and ~62 KB saved.
     */
    const cache = new Map<string, SearchPage>();

    function remember(url: string, page: SearchPage): void {
      cache.set(url, page);
      if (cache.size > CACHE_LIMIT) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
      }
    }

    function setStatus(message: string, loading = false, error = false): void {
      statusEl.textContent = message;
      statusEl.classList.toggle('error', error);
      listEl.setAttribute('aria-busy', String(loading));
    }

    function render(): void {
      const shelved = host.shelvedIds();
      const rows = results
        .map((book) => {
          const on = shelved.has(book.gid);
          const cover = book.thumbnail
            ? `<img class="catalog-cover" src="${book.thumbnail}" alt="" width="36" height="52">`
            : '<span class="catalog-cover"></span>';
          return (
            `<div class="catalog-row">${cover}` +
            `<div class="meta"><strong>${host.escapeHTML(book.title)}</strong>` +
            `<span>${host.escapeHTML(book.author)}</span>` +
            `<span class="row-links">` +
            `<a href="${bookPageUrl(book.gid)}" target="_blank" rel="noopener noreferrer">Details</a>` +
            `<button type="button" class="link-btn" data-download-gutenberg="${book.gid}">Download EPUB</button>` +
            `</span></div>` +
            `<div class="actions">` +
            `<button class="btn secondary" data-add-gutenberg="${book.gid}"${on || busy ? ' disabled' : ''}>` +
            `${on ? 'In library' : 'Add'}</button></div></div>`
          );
        })
        .join('');
      const more = nextUrl
        ? `<button class="btn secondary catalog-more" id="catalog-more"${busy ? ' disabled' : ''}>Show more results</button>`
        : '';
      listEl.innerHTML = rows + more;
    }

    function renderPending(): void {
      if (!pending) {
        pendingEl.hidden = true;
        pendingEl.innerHTML = '';
        return;
      }
      pendingEl.hidden = false;
      pendingEl.innerHTML =
        `<p><strong>${host.escapeHTML(pending.title)}</strong> is downloading. Choose the saved file to finish adding it — usually <code>pg${pending.gid}.epub</code> in Downloads.</p>` +
        `<input id="catalog-file" type="file" accept=".epub" aria-label="Choose the EPUB you just downloaded">` +
        `<button class="text-btn" id="catalog-cancel">Cancel</button>`;
    }

    async function search(rawQuery: string, append = false): Promise<void> {
      const trimmed = rawQuery.trim().slice(0, 120);

      request?.abort();
      if (!append) {
        results = [];
        nextUrl = '';
        query = trimmed;
        render();
      }
      if (!trimmed) {
        setStatus('');
        return;
      }

      const url = append && nextUrl ? nextUrl : `${SEARCH_URL}?${new URLSearchParams({ query: trimmed })}`;

      const cached = cache.get(url);
      if (cached) {
        const seen = new Set(results.map((book) => book.gid));
        results = append ? results.concat(cached.books.filter((b) => !seen.has(b.gid))) : cached.books.slice();
        nextUrl = cached.nextUrl;
        render();
        setStatus(summary(trimmed));
        return;
      }

      const controller = new AbortController();
      request = controller;
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, SEARCH_TIMEOUT);

      setStatus(append ? 'Loading more…' : 'Searching Project Gutenberg…', true);

      try {
        const response = await fetch(url, {
          signal: controller.signal,
          headers: { Accept: 'application/atom+xml' },
        });

        // A newer search is already on screen; this reply must not repaint it.
        if (controller !== request) return;
        if (!response.ok) {
          throw new Error(`Project Gutenberg answered with error ${response.status}.`);
        }

        const page = parseFeed(await response.text());
        if (controller !== request) return;

        remember(url, page);
        const seen = new Set(results.map((book) => book.gid));
        results = append ? results.concat(page.books.filter((b) => !seen.has(b.gid))) : page.books.slice();
        nextUrl = page.nextUrl;

        render();
        setStatus(summary(trimmed));
      } catch (error) {
        if (controller !== request) return;
        if (isCancelled(error) && !timedOut) return;
        setStatus(describeSearchFailure(error, timedOut), false, true);
      } finally {
        clearTimeout(timer);
        if (controller === request) {
          request = null;
          listEl.setAttribute('aria-busy', 'false');
        }
      }
    }

    function summary(term: string): string {
      if (!results.length) return `No books matched “${term}”. Try another title or author.`;
      return `${results.length} result${results.length === 1 ? '' : 's'} for “${term}”${nextUrl ? ' so far' : ''}.`;
    }

    const isCancelled = (error: unknown): boolean =>
      error instanceof Error && error.name === 'AbortError';

    function describeSearchFailure(error: unknown, timedOut: boolean): string {
      if (timedOut) {
        return 'Project Gutenberg did not answer in time. Try again, or open gutenberg.org in a tab to check it is reachable from your network.';
      }
      // fetch rejects with TypeError when no response arrived at all; its own
      // message is browser jargon, so it is never shown as-is.
      if (error instanceof TypeError) {
        return 'Could not reach Project Gutenberg. Check your connection — and if this page is open inside an app preview pane, save it and open it in a browser instead.';
      }
      return error instanceof Error ? error.message : 'The search failed. Try again.';
    }

    /**
     * Read the EPUB directly. This succeeds only where there is no same-origin
     * policy (a packaged app, a WebView with web security off, an extension).
     * In an ordinary browser it fails immediately with a TypeError, which costs
     * a few milliseconds and buys a one-step import everywhere else.
     */
    async function tryDirectFetch(book: CatalogBook): Promise<ImportedBook | null> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), DIRECT_FETCH_TIMEOUT);
      try {
        let response = await fetch(epubUrl(book.gid), { signal: controller.signal });
        if (!response.ok) response = await fetch(epubMirrorUrl(book.gid), { signal: controller.signal });
        if (!response.ok) return null;

        const blob = await response.blob();
        if (blob.size > EPUB_LIMIT) return null;
        return await host.parseEpub(new File([blob], `pg${book.gid}.epub`, { type: 'application/epub+zip' }));
      } catch {
        return null; // expected in a browser; the download path takes over
      } finally {
        clearTimeout(timer);
      }
    }

    function finish(book: ImportedBook, source: CatalogBook): void {
      // Catalogue metadata beats what is embedded in the file, which often
      // carries subtitles, translators and "(Illustrated)".
      book.gutenbergId = source.gid;
      book.title = source.title;
      book.author = source.author;
      book.style = ['', 'blue', 'ochre', 'clay'][source.gid % 4];
      book.art = 'book';
      book.sample = false;
      pending = null;
      renderPending();
      setStatus('');
      host.addToLibrary(book);
    }

    /** Start a plain browser download. A navigation, not a read, so CORS does
     *  not apply — this is also the only way a page can obtain the file at all. */
    function startDownload(gid: number): void {
      const anchor = document.createElement('a');
      anchor.href = epubUrl(gid);
      anchor.rel = 'noopener';
      anchor.download = `pg${gid}.epub`; // ignored cross-origin, harmless
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    }

    /** The separate download action: fetch nothing, import nothing. */
    function download(gid: number): void {
      const book = results.find((entry) => entry.gid === gid);
      startDownload(gid);
      setStatus(book ? `Downloading “${book.title}” from Project Gutenberg.` : 'Downloading…');
    }

    async function addDirectly(book: CatalogBook): Promise<void> {
      busy = true;
      render();
      setStatus(`Adding “${book.title}”…`, true);
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), DIRECT_FETCH_TIMEOUT);
        let parsed: ImportedBook;
        try {
          let response = await fetch(epubUrl(book.gid), { signal: controller.signal });
          if (!response.ok) response = await fetch(epubMirrorUrl(book.gid), { signal: controller.signal });
          if (!response.ok) throw new Error(`Project Gutenberg returned error ${response.status}.`);
          const blob = await response.blob();
          if (blob.size > EPUB_LIMIT) throw new Error('This book is larger than this prototype reads.');
          parsed = await host.parseEpub(new File([blob], `pg${book.gid}.epub`, { type: 'application/epub+zip' }));
        } finally {
          clearTimeout(timer);
        }
        if (!host.isReadable(parsed)) throw new Error('No readable text was found in this book.');
        finish(parsed, book);
      } catch (error) {
        // Direct reading turned out to be unavailable after all; fall back
        // rather than dead-ending, and remember for next time.
        directAllowed = false;
        setStatus(
          error instanceof Error && !(error instanceof TypeError)
            ? error.message
            : 'Downloading instead — your browser will not let this page read the file.',
          false,
          !(error instanceof TypeError),
        );
        pending = book;
        renderPending();
        startDownload(book.gid);
      } finally {
        busy = false;
        render();
      }
    }

    /**
     * One click, straight into the library where the runtime allows it.
     *
     * In a packaged build the file is read and imported with no further step.
     * In a browser that is impossible, so the click — while it still carries
     * the user's activation — starts the download and opens the file picker
     * itself, which is the fewest steps the platform permits. Deliberately not
     * async up front: awaiting anything first would spend the activation and
     * the picker would be blocked.
     */
    function add(gid: number): void {
      const book = results.find((entry) => entry.gid === gid);
      if (!book || busy || host.shelvedIds().has(gid)) return;

      if (directAllowed === true) {
        void addDirectly(book);
        return;
      }

      if (directAllowed === false) {
        pending = book;
        renderPending();
        setStatus('');
        startDownload(gid);
        const input = document.querySelector<HTMLInputElement>('#catalog-file');
        input?.click(); // still inside the click gesture, so this is allowed
        return;
      }

      // Capability not measured yet (the probe normally settles before any
      // click). Measure, then take whichever path applies.
      void probeDirect().then((allowed) => {
        if (allowed) return addDirectly(book);
        pending = book;
        renderPending();
        setStatus('');
        startDownload(gid);
        return undefined;
      });
    }

    async function importPending(file: File): Promise<void> {
      const book = pending;
      if (!book) return;
      setStatus(`Opening “${book.title}”…`, true);
      try {
        const parsed = await host.parseEpub(file);
        if (!host.isReadable(parsed)) throw new Error('No readable text was found in that file.');
        finish(parsed, book);
      } catch (error) {
        setStatus(
          error instanceof Error ? error.message : 'That file could not be opened.',
          false,
          true,
        );
      }
    }

    function cancelPending(): void {
      pending = null;
      renderPending();
      setStatus('');
    }

    return {
      render,
      search,
      add,
      download,
      probe: () => void probeDirect(),
      cancelPending,
      importPending,
      reset() {
        if (!results.length) setStatus('');
        renderPending();
      },
    };
  }

  (window as unknown as Record<string, unknown>).BookwormCatalog = { mount, bookFromPlainText };
})();
