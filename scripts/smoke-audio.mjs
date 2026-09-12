// Explicit, bounded live smoke check through the running local server. No text/key logs.
import { mkdir, writeFile } from 'node:fs/promises';
const origin = process.env.AUDIO_ORIGIN || 'http://127.0.0.1:4310';
const config = await fetch(`${origin}/api/audio/config`).then(response => response.json());
if (!config.configured) throw new Error('Add OPENROUTER_API_KEY to .env and restart the server first.');
const start = performance.now();
const response = await fetch(`${origin}/api/audio/speech`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Bookworm-Client': 'audio-v1' },
  body: JSON.stringify({ profileId: config.profile.id, text: 'The lamp beside the window flickered. Outside, the rain had stopped, and the garden was very quiet.' }),
  signal: AbortSignal.timeout(95000),
});
if (!response.ok) { const body = await response.json(); throw new Error(body.error?.message || 'Speech request failed.'); }
const bytes = new Uint8Array(await response.arrayBuffer());
await mkdir('output/audio', { recursive: true });
await writeFile('output/audio/fish-smoke.mp3', bytes);
console.log(JSON.stringify({ model: config.profile.model, mime: response.headers.get('content-type'), bytes: bytes.length, elapsedMs: Math.round(performance.now() - start), file: 'output/audio/fish-smoke.mp3' }));
