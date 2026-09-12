import { SpeechError } from './speech.ts';

export interface BookRecommendation {
  gid: number;
  title: string;
  url: string;
  excerpt: string;
}

export function recommendationQuery(body: unknown): string {
  const query = body && typeof body === 'object' && !Array.isArray(body)
    ? (body as { query?: unknown }).query : undefined;
  if (typeof query !== 'string' || query.trim().length < 3 || query.length > 300 || /[\x00-\x1f\x7f]/.test(query)) {
    throw new SpeechError('INVALID_QUERY', 'Describe a topic or mood in 3–300 characters.', 400);
  }
  return query.trim();
}

/** Search matches, not generated reviews. Only canonical Gutenberg book pages
 * become importable results; Exa's page author is not a reliable book author. */
export function parseRecommendations(data: unknown): BookRecommendation[] {
  if (!data || typeof data !== 'object' || !Array.isArray((data as { results?: unknown }).results)) {
    throw new SpeechError('INVALID_SEARCH_RESPONSE', 'Book search returned an unreadable response. Please retry.', 502);
  }
  const books: BookRecommendation[] = [];
  const seen = new Set<number>();
  for (const entry of (data as { results: unknown[] }).results.slice(0, 20)) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    if (typeof row.url !== 'string' || typeof row.title !== 'string') continue;
    let url: URL;
    try { url = new URL(row.url); } catch { continue; }
    if (!['https:', 'http:'].includes(url.protocol) || !['www.gutenberg.org', 'gutenberg.org'].includes(url.hostname) || url.username || url.password || url.port) continue;
    const match = /^\/ebooks\/([1-9]\d*)\/?$/.exec(url.pathname);
    const gid = Number(match?.[1]);
    if (!Number.isSafeInteger(gid) || gid <= 0 || seen.has(gid)) continue;
    const title = row.title.replace(/\s*\|\s*Project Gutenberg\s*$/i, '').trim().slice(0, 200);
    if (!title) continue;
    const excerpt = Array.isArray(row.highlights)
      ? row.highlights.filter((v): v is string => typeof v === 'string').join(' ').replace(/\s+/g, ' ').trim().slice(0, 400) : '';
    seen.add(gid);
    books.push({ gid, title, url: `https://www.gutenberg.org/ebooks/${gid}`, excerpt });
    if (books.length === 6) break;
  }
  return books;
}

export class ExaRecommendations {
  constructor(private readonly apiKey = '', private readonly fetcher: typeof fetch = fetch) {}
  get configured(): boolean { return Boolean(this.apiKey.trim()); }

  async search(body: unknown, signal: AbortSignal): Promise<{ books: BookRecommendation[] }> {
    const query = recommendationQuery(body);
    if (!this.configured) throw new SpeechError('SEARCH_KEY_MISSING', 'Book recommendations are not connected yet. You can still find books in Project Gutenberg.', 503);
    try {
      const fetcher = this.fetcher;
      const response = await fetcher('https://api.exa.ai/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': this.apiKey.trim() },
        body: JSON.stringify({
          query: `A Project Gutenberg ebook matching this reading interest: ${query}`,
          type: 'auto', numResults: 12, includeDomains: ['gutenberg.org/ebooks/'],
          contents: { highlights: true },
        }),
        signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
      });
      if (!response.ok) {
        // Never relay an upstream body, which can contain credentials or queries.
        if ([401, 403].includes(response.status)) throw new SpeechError('SEARCH_KEY_REJECTED', 'The book search key was rejected. Update the Exa connection and retry.', 401);
        if (response.status === 402) throw new SpeechError('SEARCH_CREDIT_REQUIRED', 'The Exa connection needs credits before book search can continue.', 402);
        if (response.status === 429) throw new SpeechError('SEARCH_RATE_LIMITED', 'Book search is busy. Wait a moment and try again.', 429);
        throw new SpeechError('SEARCH_UNAVAILABLE', 'Book search is temporarily unavailable. Please retry.', 502);
      }
      return { books: parseRecommendations(await response.json()) };
    } catch (error) {
      if (error instanceof SpeechError) throw error;
      if (signal.aborted) throw new SpeechError('SEARCH_CANCELLED', 'Book search was cancelled.', 499);
      if (error instanceof Error && error.name === 'TimeoutError') throw new SpeechError('SEARCH_TIMEOUT', 'Book search took too long. Please retry.', 504);
      throw new SpeechError('SEARCH_UNAVAILABLE', 'Could not reach book search. Please retry.', 502);
    }
  }
}
