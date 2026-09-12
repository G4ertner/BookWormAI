import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { SpeechError, validateText, type SpeechProvider } from './speech.ts';
import { validateApiKey } from './credentials.ts';

/** Local single-user runtime. Authentication must be added before public hosting. */
export function createAudioServer(provider: SpeechProvider, publicDir: string, updateKey?: (key: string) => Promise<void>) {
  let active = 0;
  let updatingKey = false;
  const staticFiles: Record<string, [string, string]> = {
    '/': ['index.html', 'text/html; charset=utf-8'],
    '/simple': ['simple.html', 'text/html; charset=utf-8'],
    '/simple/': ['simple.html', 'text/html; charset=utf-8'],
    '/assets/simple.js': ['simple.js', 'text/javascript; charset=utf-8'],
    '/assets/client.js': ['client.js', 'text/javascript; charset=utf-8'],
    '/assets/styles.css': ['styles.css', 'text/css; charset=utf-8'],
  };
  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 4310;
    const hosts = [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`];
    if (!hosts.includes(req.headers.host ?? '')) return json(res, 403, { error: { code: 'HOST_DENIED', message: 'Use the local server address.' } });
    if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return json(res, 403, { error: { code: 'ORIGIN_DENIED', message: 'Cross-origin requests are not allowed.' } });
    if (req.headers['sec-fetch-site'] === 'cross-site') return json(res, 403, { error: { code: 'ORIGIN_DENIED', message: 'Cross-site requests are not allowed.' } });
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (path === '/api/audio/key' && ['PUT', 'DELETE'].includes(req.method ?? '')) {
      let locked = false;
      try {
        if (req.headers['x-bookworm-client'] !== 'audio-v1' || !req.headers['content-type']?.startsWith('application/json')) throw new SpeechError('INVALID_REQUEST', 'Use the BookWorm settings form.', 400);
        if (!updateKey) throw new SpeechError('SETTINGS_UNAVAILABLE', 'Key setup is unavailable on this server.', 503);
        if (updatingKey || active) throw new SpeechError('BUSY', 'Pause playback in all BookWorm tabs, then try again.', 409);
        updatingKey = true; locked = true;
        const body = await readJson(req) as { apiKey?: unknown };
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new SpeechError('INVALID_REQUEST', 'Expected a settings object.', 400);
        const key = req.method === 'DELETE' ? '' : validateApiKey(body.apiKey);
        await updateKey(key);
        json(res, 200, { configured: provider.configured });
      } catch (error) {
        const safe = error instanceof SpeechError ? error : new SpeechError('KEY_SAVE_FAILED', 'The local server could not update the key.', 500);
        json(res, safe.status, { error: { code: safe.code, message: safe.message } });
      } finally { if (locked) updatingKey = false; }
      return;
    }
    if (req.method === 'GET' && path === '/api/audio/config') return json(res, 200, { configured: provider.configured, profile: provider.profile, maxPassageBytes: 2400 });
    if (req.method === 'GET' && path === '/api/config') return json(res, 200, { available: false }); // Prepared companion only.
    if (req.method === 'POST' && path === '/api/audio/speech') {
      let counted = false;
      const controller = new AbortController();
      const disconnected = () => { if (!res.writableEnded) controller.abort(); };
      res.on('close', disconnected);
      try {
        if (!req.headers['content-type']?.startsWith('application/json') || req.headers['x-bookworm-client'] !== 'audio-v1') throw new SpeechError('INVALID_REQUEST', 'Use the BookWorm audio client.', 400);
        if (updatingKey || active >= 2) throw new SpeechError('BUSY', 'Audio is busy. Please wait and retry.', 429);
        active++; counted = true;
        const body = await readJson(req) as { text?: unknown; profileId?: unknown };
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new SpeechError('INVALID_REQUEST', 'Expected a speech request object.', 400);
        if (body.profileId !== provider.profile.id) throw new SpeechError('PROFILE_CHANGED', 'Narrator settings changed. Reload before continuing.', 409);
        const text = validateText(body.text);
        const result = await provider.synthesize(text, controller.signal);
        if (controller.signal.aborted) return;
        res.statusCode = 200;
        res.setHeader('Content-Type', result.contentType);
        res.setHeader('Content-Length', result.bytes.length);
        if (result.generationId && /^[\w-]{1,200}$/.test(result.generationId)) res.setHeader('X-Generation-Id', result.generationId);
        res.end(result.bytes);
      } catch (error) {
        if (res.destroyed) return;
        const safe = error instanceof SpeechError ? error : new SpeechError('INTERNAL_ERROR', 'Narration could not be prepared. Please retry.');
        json(res, safe.status, { error: { code: safe.code, message: safe.message } });
      } finally { if (counted) active--; res.removeListener('close', disconnected); }
      return;
    }
    const file = staticFiles[path];
    if (req.method === 'GET' && file) {
      try { const bytes = await readFile(resolve(publicDir, file[0])); res.setHeader('Content-Type', file[1]); res.end(bytes); }
      catch { json(res, 404, { error: { code: 'BUILD_MISSING', message: 'Run pnpm build first.' } }); }
      return;
    }
    json(res, 404, { error: { code: 'NOT_FOUND', message: 'Not found.' } });
  });
  server.requestTimeout = 100000;
  server.headersTimeout = 10000;
  return server;
}
function json(res: ServerResponse, status: number, value: unknown): void { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(value)); }
async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of req) {
    size += Buffer.byteLength(chunk);
    if (size > 16000) throw new SpeechError('BODY_TOO_LARGE', 'The request exceeds the passage limit.', 413);
    chunks.push(Buffer.from(chunk));
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new SpeechError('INVALID_JSON', 'The speech request is not valid JSON.', 400); }
}
