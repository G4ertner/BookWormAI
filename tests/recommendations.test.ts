import test from 'node:test';
import assert from 'node:assert/strict';
import { ExaRecommendations, parseRecommendations } from '../src/server/recommendations.ts';
import { createAudioServer } from '../src/server/app.ts';
import { OpenRouterSpeech, SpeechError } from '../src/server/speech.ts';

const hit = { title: 'A book by An Author | Project Gutenberg', url: 'https://www.gutenberg.org/ebooks/123', highlights: ['A source excerpt.'] };
test('Exa search sends only the explicit interest and keeps its key server-side', async () => {
  const service = new ExaRecommendations('fixture-key', async function(this: unknown, url, init) {
    assert.equal(this, undefined);
    assert.equal(url, 'https://api.exa.ai/search');
    assert.equal(new Headers(init?.headers).get('x-api-key'), 'fixture-key');
    const body = JSON.parse(String(init?.body));
    assert.deepEqual(body.includeDomains, ['gutenberg.org/ebooks/']);
    assert.equal(body.type, 'auto');
    assert.equal(body.query, 'A Project Gutenberg ebook matching this reading interest: Gentle adventure');
    assert.equal(body.numResults, 12);
    return Response.json({ results: [hit] });
  });
  const result = await service.search({ query: ' Gentle adventure ', shelf: 'not forwarded' }, new AbortController().signal);
  assert.equal(result.books[0]?.gid, 123);
  assert.equal(result.books[0]?.title, 'A book by An Author');
  assert(!JSON.stringify(result).includes('fixture-key'));
});

test('only safe canonical book pages survive; duplicates and non-book results are discarded', () => {
  const books = parseRecommendations({ results: [hit, hit, ...[
    'javascript:alert(1)', 'https://gutenberg.org.evil.test/ebooks/2',
    'https://user:pass@www.gutenberg.org/ebooks/2', 'https://www.gutenberg.org:8443/ebooks/2',
    'https://www.gutenberg.org/ebooks/search', 'https://www.gutenberg.org/ebooks/0',
    'https://www.gutenberg.org/ebooks/123.epub.noimages',
  ].map(url => ({...hit, url})), {...hit, url: 'http://gutenberg.org/ebooks/42?tracking=yes#x'}] });
  assert.deepEqual(books.map(b => b.url), ['https://www.gutenberg.org/ebooks/123', 'https://www.gutenberg.org/ebooks/42']);
  assert.throws(() => parseRecommendations({ error: 'bad' }));
  assert.deepEqual(parseRecommendations({ results: [] }), []);
  assert.equal(parseRecommendations({ results: Array.from({length:20}, (_,i)=>({...hit,url:`https://www.gutenberg.org/ebooks/${i+1}`})) }).length, 6);
});

test('missing keys and invalid queries never call Exa', async () => {
  let calls = 0;
  const service = new ExaRecommendations('', async () => { calls++; throw new Error(); });
  for (const body of [null, [], {}, {query:2}, {query:'ab'}, {query:'x'.repeat(301)}, {query:'a\u0000b'}]) {
    await assert.rejects(service.search(body, new AbortController().signal), (e: unknown) => e instanceof SpeechError && e.status === 400);
  }
  await assert.rejects(service.search({query:'adventure'}, new AbortController().signal), (e: unknown) => e instanceof SpeechError && e.code === 'SEARCH_KEY_MISSING');
  assert.equal(calls, 0);
});

test('provider failures, malformed data, timeouts and cancellation are safe and actionable', async () => {
  for (const [status, code] of [[401,'SEARCH_KEY_REJECTED'],[403,'SEARCH_KEY_REJECTED'],[402,'SEARCH_CREDIT_REQUIRED'],[429,'SEARCH_RATE_LIMITED'],[500,'SEARCH_UNAVAILABLE']] as const) {
    const service = new ExaRecommendations('private-fixture-key', async()=>new Response('private-fixture-key private query',{status}));
    await assert.rejects(service.search({query:'adventure'},new AbortController().signal), (e: unknown)=>e instanceof SpeechError && e.code===code && !e.message.includes('private'));
  }
  for (const [fetcher, code] of [
    [async()=>Response.json({bad:true}), 'INVALID_SEARCH_RESPONSE'],
    [async()=>new Response('not json'), 'SEARCH_UNAVAILABLE'],
    [async()=>{throw new TypeError('private network data');}, 'SEARCH_UNAVAILABLE'],
    [async()=>{throw new DOMException('timeout','TimeoutError');}, 'SEARCH_TIMEOUT'],
  ] as const) await assert.rejects(new ExaRecommendations('fixture',fetcher).search({query:'adventure'},new AbortController().signal),(e: unknown)=>e instanceof SpeechError && e.code===code);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(new ExaRecommendations('fixture',async(_url, init)=>{init?.signal?.throwIfAborted();throw new Error();}).search({query:'adventure'},controller.signal),(e: unknown)=>e instanceof SpeechError && e.code==='SEARCH_CANCELLED');
});

test('local HTTP search enforces origin, request limits and a single concurrent search', async t => {
  let finish: (()=>void) | undefined;
  let calls=0;
  const service = new ExaRecommendations('fixture',async()=>{calls++;await new Promise<void>(resolve=>{finish=resolve;});return Response.json({results:[hit]});});
  const server=createAudioServer(new OpenRouterSpeech(''),'/tmp/no-public-files',undefined,undefined,service);
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise<void>(resolve=>{server.closeAllConnections();server.close(()=>resolve());}));
  const address=server.address();assert(address && typeof address!=='string');
  const origin=`http://127.0.0.1:${address.port}`;
  const headers={'Content-Type':'application/json','X-Bookworm-Client':'audio-v1'};
  const request=(body:string,extra={})=>fetch(origin+'/api/books/recommendations',{method:'POST',headers:{...headers,...extra},body});
  assert.deepEqual(await (await fetch(origin+'/api/books/recommendations/config')).json(),{configured:true});
  assert.equal((await request('{"query":"adventure"}',{Origin:'https://evil.test'})).status,403);
  assert.equal((await request('null')).status,400);
  assert.equal((await request('{')).status,400);
  assert.equal((await request('x'.repeat(16001))).status,413);
  assert.equal(calls,0);
  const first=request('{"query":"adventure"}');
  for(let i=0;!finish && i<100;i++)await new Promise(resolve=>setTimeout(resolve,5));
  assert(finish);
  assert.equal((await request('{"query":"mystery"}')).status,429);
  finish();assert.equal((await first).status,200);assert.equal(calls,1);
});
