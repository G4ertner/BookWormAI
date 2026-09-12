import test from 'node:test';
import assert from 'node:assert/strict';
import { bookFromPlainText, pinnedUrl } from '../src/books/gutenberg.ts';
import { splitPassage } from '../src/audio/types.ts';

test('catalog pagination cannot leave the Gutenberg books origin', () => {
  assert.equal(pinnedUrl('/ebooks/search.opds/?query=alice&start_index=26'), 'https://www.gutenberg.org/ebooks/search.opds/?query=alice&start_index=26');
  assert.equal(pinnedUrl('http://www.gutenberg.org/ebooks/11'), 'https://www.gutenberg.org/ebooks/11');
  for (const url of ['https://evil.example/ebooks/11', 'https://www.gutenberg.org.evil.example/ebooks/11', 'https://evil.gutenberg.org/ebooks/11', 'https://user:pass@www.gutenberg.org/ebooks/11', 'https://www.gutenberg.org:8443/ebooks/11', 'javascript:alert(1)', '/admin', null]) assert.equal(pinnedUrl(url), '');
});

test('text import strips Gutenberg wrapper and preserves chapter order for audio', () => {
  const book = bookFromPlainText('License header\n*** START OF THE PROJECT GUTENBERG EBOOK TEST ***\n\nCHAPTER I. A garden\n\nAn original opening.\n\nCHAPTER II. A river\n\nAn original ending.\n\n*** END OF THE PROJECT GUTENBERG EBOOK TEST ***\nLicense footer', 'Test', 'Fixture');
  assert.equal(book.title, 'Test');
  assert.deepEqual(book.chapters.map(c=>c.title), ['CHAPTER I. A garden', 'CHAPTER II. A river']);
  assert.deepEqual(book.chapters.flatMap(c=>c.paragraphs.flatMap(p=>splitPassage(p.text,1000))), ['An original opening.', 'An original ending.']);
  assert(!JSON.stringify(book).includes('License'));
});

test('text import rejects empty and oversized books and creates distinct library identities', () => {
  assert.throws(()=>bookFromPlainText(' \n ', 'Empty', 'Fixture'), /No readable text/);
  assert.throws(()=>bookFromPlainText('x'.repeat(3*1024*1024+1), 'Large', 'Fixture'), /3 MB/);
  assert.notEqual(bookFromPlainText('A short book.', 'A', 'Fixture').id, bookFromPlainText('A short book.', 'A', 'Fixture').id);
});
