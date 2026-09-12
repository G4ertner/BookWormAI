import test from 'node:test';
import assert from 'node:assert/strict';
import { createAudioServer } from '../src/server/app.ts';
import { OpenRouterSpeech, SpeechError, validateText, type SpeechProvider } from '../src/server/speech.ts';
import { MODEL } from '../src/audio/types.ts';

const mp3 = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(50)]); // Header fixture, not playable speech.
test('OpenRouter request uses selected model, MP3, server-only key and exact text', async () => {
  let requestBody: Record<string, string> = {};
  const provider = new OpenRouterSpeech('test-secret', 'voice-123', async (url, init) => {
    assert.equal(url, 'https://openrouter.ai/api/v1/audio/speech');
    assert.equal(new Headers(init!.headers).get('authorization'), 'Bearer test-secret');
    requestBody = JSON.parse(String(init!.body));
    return new Response(mp3, { headers: { 'Content-Type': 'audio/mpeg', 'X-Generation-Id': 'gen-test' } });
  });
  const result = await provider.synthesize('An exact passage.', new AbortController().signal);
  assert.deepEqual(requestBody, { model: MODEL, input: 'An exact passage.', response_format: 'mp3', voice: 'voice-123' });
  assert.equal(result.generationId, 'gen-test');
  assert(!JSON.stringify(provider.profile).includes('test-secret'));
});
test('default voice is omitted, not an invented OpenAI voice name', async () => {
  const provider = new OpenRouterSpeech('test', undefined, async (_url, init) => {
    assert.equal('voice' in JSON.parse(String(init!.body)), false);
    return new Response(mp3, { headers: { 'Content-Type': 'audio/mpeg' } });
  });
  await provider.synthesize('Hello.', new AbortController().signal);
});
test('absent key, invalid input and byte limits fail before any generation', async () => {
  let calls = 0;
  const provider = new OpenRouterSpeech('', undefined, async () => { calls++; throw new Error(); });
  await assert.rejects(provider.synthesize('Hello.', new AbortController().signal), (error: unknown) => error instanceof SpeechError && error.code === 'KEY_MISSING');
  assert.throws(() => validateText('🐛'.repeat(601)), /too long/);
  assert.throws(() => validateText('  ')); assert.throws(() => validateText('abc\0'));
  assert.equal(calls, 0);
});
test('provider errors are mapped without echoing private upstream details', async () => {
  for (const [status, expected] of [[401, 'KEY_REJECTED'], [402, 'CREDIT_REQUIRED'], [429, 'RATE_LIMITED'], [500, 'PROVIDER_UNAVAILABLE']] as const) {
    const provider = new OpenRouterSpeech('test-secret', undefined, async () => new Response('test-secret and private passage', { status }));
    await assert.rejects(provider.synthesize('Text.', new AbortController().signal), (error: unknown) => error instanceof SpeechError && error.code === expected && !error.message.includes('test-secret'));
  }
});
test('non-audio and truncated responses never become playable assets', async () => {
  for (const response of [new Response('{"error":"bad"}', { headers: { 'Content-Type': 'application/json' } }), new Response('ID3', { headers: { 'Content-Type': 'audio/mpeg' } })]) {
    const provider = new OpenRouterSpeech('test', undefined, async () => response);
    await assert.rejects(provider.synthesize('Text.', new AbortController().signal), (error: unknown) => error instanceof SpeechError && error.code === 'INVALID_AUDIO');
  }
});
test('HTTP boundary validates origin, profile, body and hides local files', async t => {
  let calls = 0;
  const provider: SpeechProvider = { profile: { id: 'test-profile', model: MODEL, voice: null }, configured: true, synthesize: async () => { calls++; return { bytes: mp3, contentType: 'audio/mpeg' }; } };
  const server = createAudioServer(provider, '/tmp/no-public-files');
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address(); assert(address && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}`;
  const headers = { 'Content-Type': 'application/json', 'X-Bookworm-Client': 'audio-v1' };
  const body = JSON.stringify({ text: 'Hello.', profileId: 'test-profile' });
  const config = await fetch(`${origin}/api/audio/config`).then(response => response.json());
  assert.equal(config.profile.model, MODEL); assert.equal(config.configured, true);
  assert.equal((await fetch(`${origin}/.env`)).status, 404);
  assert.equal((await fetch(`${origin}/api/audio/speech`, { method: 'POST', headers: { ...headers, Origin: 'https://untrusted.example' }, body })).status, 403);
  assert.equal((await fetch(`${origin}/api/audio/speech`, { method: 'POST', headers, body: '{}' })).status, 409);
  assert.equal((await fetch(`${origin}/api/audio/speech`, { method: 'POST', headers, body: 'null' })).status, 400);
  assert.equal((await fetch(`${origin}/api/audio/speech`, { method: 'POST', headers, body: '{' })).status, 400);
  assert.equal((await fetch(`${origin}/api/audio/speech`, { method: 'POST', headers, body: 'x'.repeat(16001) })).status, 413);
  assert.equal(calls, 0);
  const audio = await fetch(`${origin}/api/audio/speech`, { method: 'POST', headers, body });
  assert.equal(audio.status, 200); assert.equal(audio.headers.get('content-type'), 'audio/mpeg'); assert.equal(calls, 1);
});

test('HTTP concurrency is bounded and cancelling the client aborts upstream work', async t => {
  const signals: AbortSignal[] = [];
  const provider: SpeechProvider = {
    profile: { id: 'test-profile', model: MODEL, voice: null }, configured: true,
    synthesize: async (_text, signal) => {
      signals.push(signal);
      return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new SpeechError('CANCELLED', 'Cancelled', 499)), { once: true }));
    },
  };
  const server = createAudioServer(provider, '/tmp/no-public-files');
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }));
  const address = server.address(); assert(address && typeof address !== 'string');
  const endpoint = `http://127.0.0.1:${address.port}/api/audio/speech`;
  const options = { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Bookworm-Client': 'audio-v1' }, body: JSON.stringify({ text: 'Hello.', profileId: 'test-profile' }) };
  const first = new AbortController(); const second = new AbortController();
  const requests = [fetch(endpoint, { ...options, signal: first.signal }).catch(() => {}), fetch(endpoint, { ...options, signal: second.signal }).catch(() => {})];
  for (let i = 0; signals.length < 2 && i < 100; i++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(signals.length, 2);
  assert.equal((await fetch(endpoint, options)).status, 429);
  first.abort(); second.abort(); await Promise.all(requests);
  for (let i = 0; !signals.every(signal => signal.aborted) && i < 100; i++) await new Promise(resolve => setTimeout(resolve, 5));
  assert(signals.every(signal => signal.aborted));
});
