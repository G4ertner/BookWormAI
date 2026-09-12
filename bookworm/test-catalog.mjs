/**
 * Browser tests for the Project Gutenberg catalogue.
 *
 * Runs the real index.html in headless Chromium with window.fetch stubbed, so
 * no network is touched. The OPDS fixture mirrors the live feed's actual shape
 * (checked against gutenberg.org/ebooks/search.opds), including its navigation
 * entries and its base64 cover thumbnails.
 */
import { chromium } from 'playwright';

const PAGE = process.env.BOOKWORM_PAGE || 'file://' + new URL('./index.html', import.meta.url).pathname;

const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/** Build an OPDS feed the way gutenberg.org actually shapes one. */
const feed = (books, { withNext = true, withNav = true } = {}) => `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/">
<id>http://www.gutenberg.org/ebooks/search.opds/?query=x</id>
<title>Books: x</title>
<link rel="self" href="/ebooks/search.opds/?query=x"/>
${withNext ? '<link rel="next" title="Next Page" type="application/atom+xml" href="/ebooks/search.opds/?query=x&amp;start_index=26"/>' : ''}
<opensearch:itemsPerPage>25</opensearch:itemsPerPage>
${withNav ? `<entry><id>https://www.gutenberg.org/ebooks/authors/search.opds/?query=x</id><title>Authors</title><content type="text">nav row, not a book</content></entry>` : ''}
${books
  .map(
    ([id, title, author]) => `<entry>
<id>https://www.gutenberg.org/ebooks/${id}.opds</id>
<title>${title}</title>
<content type="text">${author}</content>
<link type="application/atom+xml;profile=opds-catalog" rel="subsection" href="/ebooks/${id}.opds"/>
<link type="image/png" rel="http://opds-spec.org/image/thumbnail" href="${PIXEL}"/>
</entry>`,
  )
  .join('\n')}
</feed>`;

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (e) => check('no uncaught page errors', false, e.message));
await page.goto(PAGE);

// --- Stub the network and window.open --------------------------------------
// Re-installable: a page reload wipes it.
const installStub = () => page.evaluate(() => {
  window.__calls = [];
  window.__opened = [];
  window.__mode = 'ok';
  window.__delay = 0;
  window.open = (url) => {
    window.__opened.push(String(url));
    return null;
  };
  // startDownload() clicks a hidden <a>; intercept so no real navigation runs.
  window.__pickerOpened = 0;
  document.addEventListener('click', (e) => {
    const a = e.target.closest?.('a[href]');
    if (a && /gutenberg\.org/.test(a.href)) {
      window.__opened.push(a.href);
      e.preventDefault();
    }
    if (e.target.matches?.('#catalog-file')) window.__pickerOpened++;
  }, true);
  window.fetch = async (url, opts = {}) => {
    const href = String(url);
    window.__calls.push(href);
    if (window.__delay) {
      await new Promise((resolve, reject) => {
        const t = setTimeout(resolve, window.__delay);
        opts.signal?.addEventListener('abort', () => {
          clearTimeout(t);
          const e = new Error('aborted');
          e.name = 'AbortError';
          reject(e);
        });
      });
    }
    if (opts.signal?.aborted) {
      const e = new Error('aborted');
      e.name = 'AbortError';
      throw e;
    }
    if (href.includes('search.opds')) {
      if (window.__mode === 'http500') return new Response('boom', { status: 500 });
      if (window.__mode === 'network') throw new TypeError('Failed to fetch');
      if (window.__mode === 'garbage') return new Response('<<<not xml', { status: 200 });
      return new Response(window.__feed, { status: 200 });
    }
    // Any book file: a browser cannot read these cross-origin.
    if (window.__mode === 'directOk') {
      return new Response(window.__epubBytes ?? 'zip', { status: 200 });
    }
    throw new TypeError('Failed to fetch');
  };
});
await installStub();

const openCatalog = () =>
  page.evaluate(() => {
    if (!document.querySelector('#add-dialog').open) {
      document.querySelector('[data-dialog="add-dialog"]').click();
    }
    document.querySelector('#catalog-tab').click();
  });

const setFeed = (xml) => page.evaluate((f) => { window.__feed = f; }, xml);

// === 1. Search renders books, skips navigation entries ======================
await setFeed(feed([[1342, 'Pride and Prejudice', 'Jane Austen'], [105, 'Persuasion', 'Jane Austen']]));
await openCatalog();
await page.fill('#catalog-query', 'austen');
await page.click('#catalog-submit');
await page.waitForFunction(() => document.querySelectorAll('#catalog .catalog-row').length > 0, null, { timeout: 5000 });

const rows = await page.$$eval('#catalog .catalog-row', (els) =>
  els.map((el) => ({
    title: el.querySelector('strong').textContent,
    author: el.querySelector('.meta span').textContent,
    cover: el.querySelector('img.catalog-cover')?.getAttribute('src')?.slice(0, 20) ?? null,
    href: el.querySelector('a').getAttribute('href'),
  })),
);
check('renders one row per book', rows.length === 2, `got ${rows.length}`);
check('drops the navigation entry', !rows.some((r) => r.title === 'Authors'));
check('reads title and author from the feed',
  rows[0].title === 'Pride and Prejudice' && rows[0].author === 'Jane Austen', JSON.stringify(rows[0]));
check('shows the cover embedded in the feed (no extra request)',
  rows[0].cover?.startsWith('data:image/png'), String(rows[0].cover));
check('Details links to the book page',
  rows[0].href === 'https://www.gutenberg.org/ebooks/1342', rows[0].href);

// === 2. One request, to the slashed OPDS path, and nothing else =============
const allCalls = await page.evaluate(() => window.__calls.slice());
const searchCalls = allCalls.filter((u) => u.includes('search.opds'));
const probeCalls = allCalls.filter((u) => !u.includes('search.opds'));
check('search costs exactly one request', searchCalls.length === 1, String(searchCalls.length));
check('requests gutenberg.org OPDS directly (no third-party mirror)',
  searchCalls[0].startsWith('https://www.gutenberg.org/ebooks/search.opds/?'), searchCalls[0]);
check('no request to gutendex', !allCalls.some((u) => u.includes('gutendex')));
// The capability probe: one cheap request, against the smallest book, once.
check('capability probe runs exactly once', probeCalls.length === 1, String(probeCalls.length));
check('probe uses the smallest book in the catalogue',
  probeCalls[0] === 'https://www.gutenberg.org/ebooks/1.epub.noimages', probeCalls[0]);

await page.evaluate(() => { window.__calls = []; });
await page.click('#device-tab');
await page.click('#catalog-tab');
await page.waitForTimeout(120);
check('probe is not repeated on later tab switches',
  (await page.evaluate(() => window.__calls.length)) === 0);

// === 3. Cache: repeating a search costs no request ==========================
await page.evaluate(() => { window.__calls = []; });
await page.fill('#catalog-query', 'something else');
await page.click('#catalog-submit');
await page.waitForTimeout(150);
await page.fill('#catalog-query', 'austen');
await page.click('#catalog-submit');
await page.waitForFunction(() => document.querySelectorAll('#catalog .catalog-row').length === 2, null, { timeout: 5000 });
const repeatCalls = await page.evaluate(() => window.__calls.filter((u) => u.includes('query=austen')));
check('a repeated search is served from cache', repeatCalls.length === 0, `${repeatCalls.length} refetches`);

// === 4. Pagination ==========================================================
check('show-more appears when the feed has a next link', (await page.$('#catalog-more')) !== null);
await setFeed(feed([[161, 'Sense and Sensibility', 'Jane Austen']], { withNext: false }));
await page.click('#catalog-more');
await page.waitForFunction(() => document.querySelectorAll('#catalog .catalog-row').length === 3, null, { timeout: 5000 });
check('next page appends without duplicating', (await page.$$('#catalog .catalog-row')).length === 3);
check('show-more disappears on the last page', (await page.$('#catalog-more')) === null);

// === 5. Stale-response race =================================================
await page.evaluate(() => { window.__delay = 300; });
await setFeed(feed([[9001, 'Slow result', 'Nobody']]));
await page.fill('#catalog-query', 'slow');
await page.click('#catalog-submit');
await page.waitForTimeout(40);
await setFeed(feed([[7001, 'Fast result', 'Nobody']]));
await page.fill('#catalog-query', 'fast');
await page.click('#catalog-submit');
await page.waitForTimeout(900);
const winner = await page.$$eval('#catalog .catalog-row strong', (els) => els.map((e) => e.textContent));
check('the newer search wins the race', JSON.stringify(winner) === JSON.stringify(['Fast result']), JSON.stringify(winner));
await page.evaluate(() => { window.__delay = 0; });

// === 6. Hostile feed content is escaped, malformed XML is caught ============
// A real feed XML-escapes its titles; DOMParser then hands back the literal
// characters, which is exactly when the renderer's escaping has to hold.
await setFeed(feed([[4242, 'Evil &lt;img src=x onerror=alert(1)&gt;', 'A &amp; B']]));
await page.fill('#catalog-query', 'evil');
await page.click('#catalog-submit');
await page.waitForFunction(() => document.querySelectorAll('#catalog .catalog-row').length === 1, null, { timeout: 5000 });
check('markup in a feed title is not executed',
  (await page.$$('#catalog .meta img')).length === 0 &&
    (await page.textContent('#catalog .meta strong')).includes('<img'));

await page.evaluate(() => { window.__mode = 'garbage'; });
await page.fill('#catalog-query', 'broken');
await page.click('#catalog-submit');
await page.waitForFunction(() => document.querySelector('#catalog-status').classList.contains('error'), null, { timeout: 5000 });
check('unparseable feed reports a readable error',
  (await page.textContent('#catalog-status')).includes('could not read'), await page.textContent('#catalog-status'));
await page.evaluate(() => { window.__mode = 'ok'; });

// === 7. Error states ========================================================
await page.evaluate(() => { window.__mode = 'http500'; });
await page.fill('#catalog-query', 'boom');
await page.click('#catalog-submit');
await page.waitForFunction(() => document.querySelector('#catalog-status').textContent.includes('error 500'), null, { timeout: 5000 });
check('HTTP error is reported plainly', true);

await page.evaluate(() => { window.__mode = 'network'; });
await page.click('#catalog-submit');
await page.waitForTimeout(250);
const netMsg = await page.textContent('#catalog-status');
check('network failure never shows "Failed to fetch"',
  !netMsg.includes('Failed to fetch') && netMsg.includes('Could not reach'), netMsg);
await page.evaluate(() => { window.__mode = 'ok'; });

// === 8. Empty results =======================================================
await setFeed(feed([], { withNext: false, withNav: true }));
await page.fill('#catalog-query', 'zzzz');
await page.click('#catalog-submit');
await page.waitForFunction(() => document.querySelector('#catalog-status').textContent.includes('No books matched'), null, { timeout: 5000 });
check('empty result set explains itself', (await page.$$('#catalog .catalog-row')).length === 0);

// === 9. Add in a browser: downloads and opens the picker, in one click =====
await setFeed(feed([[1342, 'Pride and Prejudice', 'Jane Austen']], { withNext: false }));
await page.fill('#catalog-query', 'austen2');
await page.click('#catalog-submit');
await page.waitForFunction(() => document.querySelectorAll('#catalog .catalog-row').length === 1, null, { timeout: 5000 });

// The probe runs when the tab is chosen, so the capability is known by now.
await page.waitForTimeout(200);
await page.evaluate(() => { window.__calls = []; window.__opened = []; window.__pickerOpened = 0; });
await page.click('[data-add-gutenberg="1342"]');
await page.waitForFunction(() => !document.querySelector('#catalog-pending').hidden, null, { timeout: 5000 });

const opened = await page.evaluate(() => window.__opened.slice());
check('Add starts the download itself', opened.length === 1, String(opened[0]));
check('downloads the 558 KB no-images EPUB, not the 24.8 MB one',
  opened[0].endsWith('/ebooks/1342.epub.noimages'), opened[0]);
check('Add opens the file picker inside the same click',
  (await page.evaluate(() => window.__pickerOpened)) === 1);
check('no book file is fetched in a browser',
  (await page.evaluate(() => window.__calls.filter((u) => u.includes('.epub')).length)) === 0);
check('pending panel names the file to choose',
  (await page.textContent('#catalog-pending')).includes('pg1342.epub'));

// === 9b. The separate Download action imports nothing =======================
await page.evaluate(() => { window.__opened = []; });
await page.click('[data-download-gutenberg="1342"]');
await page.waitForTimeout(120);
check('Download is a separate action that only downloads',
  (await page.evaluate(() => window.__opened.length)) === 1 &&
    (await page.evaluate(() => window.__opened[0])).endsWith('.epub.noimages'));
check('Download does not start an import',
  (await page.evaluate(() => document.querySelector('#catalog-pending').hidden)) === false);

// === 10. Finishing the import from the picked file ==========================
const epub = await page.evaluate(async () => {
  // Build a tiny valid EPUB in the page so the real parser runs on real bytes.
  const files = {};
  const enc = new TextEncoder();
  files['mimetype'] = enc.encode('application/epub+zip');
  files['META-INF/container.xml'] = enc.encode(
    '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
  files['OEBPS/content.opf'] = enc.encode(
    '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="2.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Embedded Title</dc:title><dc:creator>Embedded Author</dc:creator></metadata><manifest><item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c1"/></spine></package>');
  files['OEBPS/c1.xhtml'] = enc.encode(
    '<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><body><h1>Chapter 1</h1><p>It was a bright cold day in April, and the clocks were striking thirteen.</p><p>Winston Smith pushed through the glass doors.</p></body></html>');

  // Minimal stored-only ZIP writer (no compression) — enough for the parser.
  const crcTable = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (buf) => { let c = 0xFFFFFFFF; for (const b of buf) c = crcTable[(c ^ b) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const parts = [], central = []; let offset = 0;
  const u16 = (n) => [n & 255, (n >> 8) & 255];
  const u32 = (n) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
  for (const [name, data] of Object.entries(files)) {
    const nameBytes = enc.encode(name), crc = crc32(data);
    const local = [...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nameBytes.length), ...u16(0)];
    parts.push(new Uint8Array(local), nameBytes, data);
    central.push([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nameBytes.length),
      ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)], nameBytes);
    offset += local.length + nameBytes.length + data.length;
  }
  const centralBytes = [];
  for (let i = 0; i < central.length; i += 2) { centralBytes.push(...central[i], ...central[i + 1]); }
  const total = parts.reduce((n, p) => n + p.length, 0);
  const end = [...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(Object.keys(files).length),
    ...u16(Object.keys(files).length), ...u32(centralBytes.length), ...u32(total), ...u16(0)];
  const blob = new Blob([...parts, new Uint8Array(centralBytes), new Uint8Array(end)]);
  const buf = await blob.arrayBuffer();
  return Array.from(new Uint8Array(buf));
});

await page.setInputFiles('#catalog-pending input[type=file]', {
  name: 'pg1342.epub',
  mimeType: 'application/epub+zip',
  buffer: Buffer.from(epub),
});
await page.waitForFunction(() => books.some((b) => b.gutenbergId === 1342), null, { timeout: 8000 });

const added = await page.evaluate(() => {
  const b = books.find((x) => x.gutenbergId === 1342);
  return {
    title: b.title, author: b.author, gid: b.gutenbergId,
    chapter: b.chapters[0].title,
    first: b.chapters[0].paragraphs[0].text.slice(0, 30),
    onLibraryScreen: !document.querySelector('#library').hidden,
    dialogClosed: !document.querySelector('#add-dialog').open,
    onShelf: [...document.querySelectorAll('#shelf .book-card h3')].some((h) => h.textContent === 'Pride and Prejudice'),
  };
});
check('picked file is parsed', added.chapter === 'Chapter 1', added.chapter);
check('lands in My library, not the reader', added.onLibraryScreen, String(added.onLibraryScreen));
check('the add dialog closes', added.dialogClosed);
check('the book appears on the shelf', added.onShelf);
check('catalogue title wins over the embedded one', added.title === 'Pride and Prejudice', added.title);
check('catalogue author wins over the embedded one', added.author === 'Jane Austen', added.author);
check('gutenberg id recorded for de-duplication', added.gid === 1342, String(added.gid));
check('book opens on its real first line', added.first.startsWith('It was a bright'), added.first);

// === 11. De-duplication and persistence =====================================
await openCatalog();
check('an added book shows as already in the library',
  (await page.textContent('[data-add-gutenberg="1342"]')).trim() === 'In library');
check('an added book cannot be added twice', !(await page.isEnabled('[data-add-gutenberg="1342"]')));

await page.reload();
check('the added book survives a reload',
  (await page.evaluate(() => books.filter((b) => b.gutenbergId === 1342).length)) === 1);
await installStub(); // the reload discarded the injected stub

// === 12. Direct fetch path (packaged app, no same-origin policy) ============
await page.evaluate((bytes) => {
  window.__mode = 'directOk';
  window.__epubBytes = new Uint8Array(bytes);
  window.__opened = [];
}, epub);
await setFeed(feed([[105, 'Persuasion', 'Jane Austen']], { withNext: false }));
await openCatalog();
await page.fill('#catalog-query', 'persuasion');
await page.click('#catalog-submit');
await page.waitForFunction(() => document.querySelectorAll('#catalog .catalog-row').length === 1, null, { timeout: 5000 });
await page.evaluate(() => { window.__pickerOpened = 0; });
await page.click('[data-add-gutenberg="105"]');
await page.waitForFunction(() => books.some((b) => b.gutenbergId === 105), null, { timeout: 8000 });
check('where fetch is allowed, Add imports in one step',
  (await page.evaluate(() => window.__opened.length)) === 0 &&
    (await page.evaluate(() => window.__pickerOpened)) === 0);

await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
