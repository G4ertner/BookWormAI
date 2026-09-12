import test from 'node:test';
import assert from 'node:assert/strict';
import { CompanionService } from '../src/server/companion.ts';
import { COMPANION_MODEL, validateAnswer, validateTurn } from '../src/companion/types.ts';
import type { Source, Turn } from '../src/companion/types.ts';
import { bookTool } from '../src/companion/retrieval.ts';
import { discuss } from '../src/companion/controller.ts';
import { createAudioServer } from '../src/server/app.ts';
import { OpenRouterSpeech } from '../src/server/speech.ts';

const first: Source = { id: 'b:0:0:0', kind: 'book', title: 'Chapter 1', text: 'Mary found a silver key beside the robin.', order: 0 };
const current: Source = { id: 'b:0:1:0', kind: 'book', title: 'Chapter 1', text: 'She opened the door with the silver key.', order: 1 };
const future: Source = { id: 'b:1:0:0', kind: 'book', title: 'The ending', text: 'The silver key belonged to the king.', order: 2 };
const turn = (): Turn => ({ context: { bookId: 'test', title: 'Adapted story', author: '', sample: true, scope: 'position', boundary: 1, current, selection: '' }, question: 'Where did she find the key?', history: [], steps: [], allowWeb: false });
const answer = { blocks: [{ kind: 'book', text: 'She opened the door using the key.', citations: [{ id: current.id, quote: 'opened the door' }] }], followUp: '' };
const response = (name: string, args: unknown) => Response.json({ choices: [{ message: { tool_calls: [{ function: { name, arguments: JSON.stringify(args) } }] } }] });
test('local book search excludes future passages before ranking; explicit whole-book mode expands scope', () => {
  assert.deepEqual(bookTool({ name: 'search_book', query: 'silver key' }, [future, first, current], turn().context).sources.map(s => s.id), [first.id, current.id]);
  assert.equal(bookTool({ name: 'read_passages', ids: [future.id] }, [first, future], turn().context).sources.length, 0);
  assert.equal(bookTool({ name: 'read_passages', ids: [future.id] }, [first, future], { ...turn().context, scope: 'whole' }).sources.length, 1);
});
test('turn validation rejects expanded scope, conflicting IDs, disabled web tools and unbounded history', () => {
  const t = turn(); t.steps = [{ action: { name: 'search_book', query: 'key' }, sources: [future], notice: '' }]; assert.throws(() => validateTurn(t), /boundary/);
  t.steps[0]!.sources = [{ ...current, text: 'Conflicting edition' }]; assert.throws(() => validateTurn(t), /Conflicting/);
  t.steps = [{ action: { name: 'search_web', query: 'gardens' }, sources: [], notice: '' }]; assert.throws(() => validateTurn(t), /not enabled/);
  t.steps = []; t.history = Array.from({ length: 5 }, () => ({ question: 'q', answer: 'a' })); assert.throws(() => validateTurn(t), /limit/);
  t.history = []; t.context.selection = 'unread'; assert.throws(() => validateTurn(t), /Select text/);
});
test('citations must refer to available sources and exact quotes; web is not book evidence', () => {
  assert.deepEqual(validateAnswer(answer, [current]), answer);
  assert.throws(() => validateAnswer(answer, [first]), /quotation/);
  assert.throws(() => validateAnswer({ ...answer, blocks: [{ ...answer.blocks[0], citations: [{ id: current.id, quote: 'invented line' }] }] }, [current]), /quotation/);
  assert.throws(() => validateAnswer({ ...answer, blocks: [{ ...answer.blocks[0], citations: [] }] }, [current]), /support/);
});
test('Gemini is pinned, key stays server-side, tools are scoped, and final citations are verified', async () => {
  let sent: any;
  const service = new CompanionService(() => 'private-openrouter-fixture', () => '', async (url, init) => {
    assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions');
    assert.equal(new Headers(init!.headers).get('authorization'), 'Bearer private-openrouter-fixture');
    sent = JSON.parse(String(init!.body)); return response('answer', answer);
  });
  assert.deepEqual(await service.turn(turn(), new AbortController().signal), { answer });
  assert.equal(sent.model, COMPANION_MODEL); assert.equal('parallel_tool_calls' in sent, false); assert.equal(sent.provider.require_parameters, true); assert.equal(sent.provider.allow_fallbacks, false);
  assert.equal(sent.tools.some((t: any) => t.function.name === 'search_web'), false);
  assert.match(sent.messages[0].content, /untrusted data/); assert.match(sent.messages[0].content, /Adapted samples/);
  assert.equal(JSON.stringify(service.config()).includes('private'), false);
});
test('tool loop searches browser-local evidence then answers; previous future discussion is excluded', async () => {
  let calls = 0;
  const result = await discuss(turn().context, [first, current, future], 'Where did she find the key?', [{ question: 'Ending?', answer: answer as any, sources: [future], boundary: 2 }], false, new AbortController().signal, () => {}, async (path, body) => {
    assert.equal(path, 'turn'); const t = body as Turn; assert.equal(t.history.length, 0);
    if (++calls === 1) return { action: { name: 'search_book', query: 'robin' } };
    assert.deepEqual(t.steps[0]!.sources, [first]);
    return { answer: { blocks: [{ kind: 'book', text: 'Beside the robin.', citations: [{ id: first.id, quote: 'beside the robin' }] }], followUp: 'What might it open?' } };
  });
  assert.equal(calls, 2); assert.equal(result.answer.followUp, 'What might it open?');
  assert.equal(result.sources.some(s => s.id === future.id), false);
});
test('Exa sends only a bounded query and returns safe source links; its key never reaches OpenRouter', async () => {
  const urls: string[] = [];
  const service = new CompanionService(() => 'openrouter-private', () => 'exa-private', async (url, init) => {
    urls.push(String(url)); assert.equal(new Headers(init!.headers).get('x-api-key'), 'exa-private');
    const body = JSON.parse(String(init!.body)); assert.deepEqual(Object.keys(body).sort(), ['contents', 'numResults', 'query', 'type']); assert.equal(body.query, 'Victorian walled gardens');
    return Response.json({ results: [{ url: 'javascript:alert(1)', title: 'bad', text: 'bad' }, { url: 'https://example.org/gardens', title: 'Garden history', text: 'Walls shelter delicate plants.' }, { url: 'https://example.org/gardens', title: 'duplicate', text: 'duplicate' }] });
  });
  await assert.rejects(service.search({ query: 'gardens', allowWeb: false }, new AbortController().signal), /Enable/);
  const result = await service.search({ query: 'Victorian walled gardens', allowWeb: true }, new AbortController().signal);
  assert.equal(result.sources.length, 1); assert.match(result.sources[0]!.id, /^w:[a-f0-9]{64}$/); assert.deepEqual(urls, ['https://api.exa.ai/search']);
});
test('outside search failure is fed back as unavailable; cancellation stops the browser loop', async () => {
  let calls = 0;
  await discuss(turn().context, [current], 'What are walled gardens?', [], true, new AbortController().signal, () => {}, async (path, body) => {
    if (path === 'search') throw new Error('Exa needs credits.');
    if (++calls === 1) return { action: { name: 'search_web', query: 'walled gardens' } };
    assert.match((body as Turn).steps[0]!.notice, /Exa needs credits/); return { answer: { blocks: [{ kind: 'background', text: 'I could not verify outside information because search failed.', citations: [] }], followUp: '' } };
  });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(discuss(turn().context, [current], 'q', [], false, controller.signal, () => {}, async () => { throw new Error('must not call'); }), /abort/i);
});
test('three-call budget forces the final answer and disallows extra tools', async () => {
  const t = turn(); t.steps = [0, 1].map(() => ({ action: { name: 'search_book', query: 'key' }, sources: [first], notice: '' }));
  const service = new CompanionService(() => 'key', () => '', async (_url, init) => {
    const body = JSON.parse(String(init!.body)); assert.deepEqual(body.tools.map((t: any) => t.function.name), ['answer']); assert.equal(body.tool_choice.function.name, 'answer');
    return response('search_book', { query: 'again' });
  });
  await assert.rejects(service.turn(t, new AbortController().signal), /search limit/);
});
test('Gemini parallel proposals are serialized into one evidence action before answering', async () => {
  const service = new CompanionService(() => 'key', () => 'exa', async (_url, init) => {
    assert.equal(JSON.parse(String(init!.body)).tool_choice, 'required');
    return Response.json({ choices: [{ message: { tool_calls: [
      { function: { name: 'answer', arguments: JSON.stringify(answer) } },
      { function: { name: 'search_web', arguments: JSON.stringify({ query: 'garden history' }) } },
      { function: { name: 'search_book', arguments: JSON.stringify({ query: 'key' }) } },
    ] } }] });
  });
  assert.deepEqual(await service.turn({ ...turn(), allowWeb: true }, new AbortController().signal), { action: { name: 'search_web', query: 'garden history' } });
});
test('missing keys and provider failures are visible and never echo private upstream content', async () => {
  await assert.rejects(new CompanionService().turn(turn(), new AbortController().signal), /OpenRouter key/);
  for (const status of [401, 402, 429, 500]) {
    const service = new CompanionService(() => 'SECRET', () => '', async () => new Response('SECRET book contents', { status }));
    await assert.rejects(service.turn(turn(), new AbortController().signal), (error: Error) => !error.message.includes('SECRET') && !error.message.includes('book contents'));
  }
});
test('local companion endpoints retain origin guards, body caps, key removal and Gemini response', async t => {
  let exaKey = '';
  const service = new CompanionService(() => 'fixture', () => exaKey, async () => response('answer', answer));
  const server = createAudioServer(new OpenRouterSpeech(''), '/tmp/no-public', undefined, undefined, undefined, { service, updateExa: async key => { exaKey = key; } });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address(); assert(address && typeof address !== 'string'); const base = `http://127.0.0.1:${address.port}/api/companion`;
  const headers = { 'Content-Type': 'application/json', 'X-Bookworm-Client': 'audio-v1' };
  const post = (path: string, body: unknown, method = 'POST', extra = {}) => fetch(base + path, { method, headers: { ...headers, ...extra }, body: JSON.stringify(body) });
  assert.equal((await post('/turn', turn(), 'POST', { Origin: 'https://evil.test' })).status, 403);
  assert.equal((await post('/turn', { text: 'a'.repeat(66000) })).status, 413);
  assert.equal((await post('/exa-key', { apiKey: 'too-small' }, 'PUT')).status, 400);
  assert.equal((await post('/exa-key', { apiKey: 'dummy-exa-fixture-key-12345' }, 'PUT')).status, 200);
  assert.equal((await (await fetch(base + '/config')).json()).webConfigured, true);
  assert.deepEqual(await (await post('/turn', turn())).json(), { answer });
  await post('/exa-key', {}, 'DELETE'); assert.equal(exaKey, '');
});
