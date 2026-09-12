import { fileURLToPath } from 'node:url';
import { createAudioServer } from './app.ts';
import { NarrationService } from './narration.ts';
import { resolve } from 'node:path';

const host = process.env.HOST || '127.0.0.1';
if (!['127.0.0.1', 'localhost', '::1'].includes(host)) throw new Error('This single-user MVP binds to loopback only. Add authentication before enabling remote access.');
const port = Number(process.env.PORT || 4310);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('PORT must be between 1024 and 65535.');
const provider = await NarrationService.open(resolve('.data'), { openrouter: process.env.OPENROUTER_API_KEY, openai: process.env.OPENAI_API_KEY, fishVoice: process.env.FISH_AUDIO_VOICE_ID });
const server = createAudioServer(provider, fileURLToPath(new URL('../public/', import.meta.url)), (key, target) => provider.updateKey(key, target), { read: () => provider.settings(), select: selection => provider.select(selection) });
server.listen(port, host, () => {
  console.log(`BookWormAI audio: http://${host}:${port}`);
  console.log(`Narration: ${provider.profile.model}; ${provider.configured ? 'key configured; press Play to test' : 'add the provider key in narrator settings'}`);
});
server.on('error', (error: NodeJS.ErrnoException) => { console.error(error.code === 'EADDRINUSE' ? 'The audio port is in use. Stop the previous server or change PORT.' : 'The audio server could not start.'); process.exitCode = 1; });
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(() => process.exit(0)));
