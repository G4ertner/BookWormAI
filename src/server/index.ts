import { fileURLToPath } from 'node:url';
import { createAudioServer } from './app.ts';
import { OpenRouterSpeech } from './speech.ts';

const host = process.env.HOST || '127.0.0.1';
if (!['127.0.0.1', 'localhost', '::1'].includes(host)) throw new Error('This single-user MVP binds to loopback only. Add authentication before enabling remote access.');
const port = Number(process.env.PORT || 4310);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('PORT must be between 1024 and 65535.');
const provider = new OpenRouterSpeech(process.env.OPENROUTER_API_KEY || '', process.env.FISH_AUDIO_VOICE_ID);
const server = createAudioServer(provider, fileURLToPath(new URL('../public/', import.meta.url)));
server.listen(port, host, () => {
  console.log(`BookWormAI audio: http://${host}:${port}`);
  console.log(`Fish Audio: ${provider.configured ? 'key configured; press Play to test narration' : 'add OPENROUTER_API_KEY to .env, then restart'}`);
});
server.on('error', (error: NodeJS.ErrnoException) => { console.error(error.code === 'EADDRINUSE' ? 'The audio port is in use. Stop the previous server or change PORT.' : 'The audio server could not start.'); process.exitCode = 1; });
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(() => process.exit(0)));
