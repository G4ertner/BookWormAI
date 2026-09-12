import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadApiKey, saveApiKey, validateApiKey } from '../src/server/credentials.ts';
import { OpenRouterSpeech } from '../src/server/speech.ts';
import { createAudioServer } from '../src/server/app.ts';

test('saved keys survive reload, restrict file access, and removal disables env fallback', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'bookworm-key-'));
  t.after(() => rm(dir, { recursive: true }));
  const path = join(dir, 'settings.json');
  assert.equal(await loadApiKey(path, 'environment-key'), 'environment-key');
  await saveApiKey(path, 'saved-key');
  assert.equal(await loadApiKey(path, 'environment-key'), 'saved-key');
  if (process.platform !== 'win32') assert.equal((await stat(path)).mode & 0o777, 0o600);
  await saveApiKey(path, '');
  assert.equal(await loadApiKey(path, 'environment-key'), '');
});
test('key validation rejects empty, oversized and control-character input without echoing it', () => {
  const valid = 'sk-or-v1-fixture-not-a-real-key';
  assert.equal(validateApiKey(` ${valid} `), valid);
  for (const invalid of ['', null, 5, 'x'.repeat(513), 'bad secret key with spaces', 'x'.repeat(20) + '\n' + 'secret']) {
    assert.throws(() => validateApiKey(invalid), /Enter an OpenRouter API key/);
  }
});
test('settings API changes active credentials, removes them and never returns them', async t => {
  const key = 'sk-or-v1-fixture-not-a-real-key';
  let persisted = '';
  let auth = '';
  const provider = new OpenRouterSpeech('', undefined, async (_url, init) => {
    auth = new Headers(init!.headers).get('authorization')!;
    return new Response(Buffer.concat([Buffer.from('ID3'), Buffer.alloc(50)]), { headers: { 'Content-Type': 'audio/mpeg' } });
  });
  const server = createAudioServer(provider, '/tmp/no-public-files', async value => { persisted = value; provider.setKey(value); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address(); assert(address && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}`;
  const headers = { 'Content-Type': 'application/json', 'X-Bookworm-Client': 'audio-v1' };
  const options = { method: 'PUT', headers, body: JSON.stringify({ apiKey: key }) };
  assert.equal((await fetch(origin + '/api/audio/key', { ...options, headers: { ...headers, Origin: 'https://elsewhere.example' } })).status, 403);
  assert.equal((await fetch(origin + '/api/audio/key', { ...options, headers: { 'Content-Type': 'application/json' } })).status, 400);
  assert.equal(provider.configured, false);
  const invalid = await fetch(origin + '/api/audio/key', { ...options, body: JSON.stringify({ apiKey: 'bad secret' }) });
  assert.equal(invalid.status, 400); assert(!(await invalid.text()).includes('bad secret'));
  const saved = await fetch(origin + '/api/audio/key', options);
  assert.deepEqual(await saved.json(), { configured: true }); assert.equal(persisted, key);
  const config = await fetch(origin + '/api/audio/config').then(r => r.text());
  assert(!config.includes(key));
  await provider.synthesize('A fixture passage.', new AbortController().signal);
  assert.equal(auth, `Bearer ${key}`);
  assert.deepEqual(await fetch(origin + '/api/audio/key', { method: 'DELETE', headers, body: '{}' }).then(r => r.json()), { configured: false });
  assert.equal(persisted, '');
  await assert.rejects(provider.synthesize('A fixture passage.', new AbortController().signal), /narrator settings/);
});
