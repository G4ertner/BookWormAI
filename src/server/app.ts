import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { SpeechError, validateText, type SpeechProvider } from './speech.ts';
import { ExaRecommendations } from './recommendations.ts';
import { validateApiKey } from './credentials.ts';
import { validateSelection } from './narration.ts';
import type { AudioSelection, AudioSettings, ProviderId } from '../audio/catalog.ts';

/** Local single-user runtime. Authentication must be added before public hosting. */
export function createAudioServer(provider: SpeechProvider, publicDir: string, updateKey?: (key: string, provider?: ProviderId) => Promise<void>, settings?: { read: () => AudioSettings; select: (selection: AudioSelection) => Promise<void> }, recommendations = new ExaRecommendations(), updateSearchKey?: (key: string) => Promise<void>) {
  let active = 0;
  let searching = false;
  let updatingSearchKey = false;
  let updatingKey = false;
  const staticFiles: Record<string, [string, string]> = {
    '/': ['simple.html', 'text/html; charset=utf-8'],
    '/simple': ['simple.html', 'text/html; charset=utf-8'],
    '/simple/': ['simple.html', 'text/html; charset=utf-8'],
    '/assets/simple.js': ['simple.js', 'text/javascript; charset=utf-8'],
  };
  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' https://www.gutenberg.org; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 4310;
    const hosts = [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`];
    if (!hosts.includes(req.headers.host ?? '')) return json(res, 403, { error: { code: 'HOST_DENIED', message: 'Use the local server address.' } });
    if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return json(res, 403, { error: { code: 'ORIGIN_DENIED', message: 'Cross-origin requests are not allowed.' } });
    if (req.headers['sec-fetch-site'] === 'cross-site') return json(res, 403, { error: { code: 'ORIGIN_DENIED', message: 'Cross-site requests are not allowed.' } });
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (req.method === 'GET' && path === '/api/books/recommendations/config') return json(res, 200, { configured: recommendations.configured });
    if (path === '/api/books/recommendations/key' && ['PUT', 'DELETE'].includes(req.method ?? '')) {
      let locked = false;
      try {
        if (req.headers['x-bookworm-client'] !== 'audio-v1' || !req.headers['content-type']?.startsWith('application/json')) throw new SpeechError('INVALID_REQUEST', 'Use the BookWorm settings form.', 400);
        if (!updateSearchKey) throw new SpeechError('SETTINGS_UNAVAILABLE', 'Search key settings are unavailable.', 503);
        if (searching || updatingSearchKey) throw new SpeechError('SEARCH_BUSY', 'Wait for book search to finish, then retry.', 409);
        updatingSearchKey = true; locked = true;
        const body = await readJson(req) as { apiKey?: unknown };
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new SpeechError('INVALID_REQUEST', 'Expected a settings object.', 400);
        await updateSearchKey(req.method === 'DELETE' ? '' : validateApiKey(body.apiKey));
        json(res, 200, { saved: true });
      } catch (error) {
        const safe = error instanceof SpeechError ? error : new SpeechError('KEY_SAVE_FAILED', 'The search key could not be saved.', 500);
        json(res, safe.status, { error: { code: safe.code, message: safe.message } });
      } finally { if (locked) updatingSearchKey = false; }
      return;
    }
    if (req.method === 'POST' && path === '/api/books/recommendations') {
      const controller = new AbortController();
      const disconnected = () => { if (!res.writableEnded) controller.abort(); };
      let counted = false;
      res.on('close', disconnected);
      try {
        if (req.headers['x-bookworm-client'] !== 'audio-v1' || !req.headers['content-type']?.startsWith('application/json')) throw new SpeechError('INVALID_REQUEST', 'Use the book recommendation form.', 400);
        if (searching || updatingSearchKey) throw new SpeechError('SEARCH_BUSY', 'A book search is already running. Wait and retry.', 429);
        searching = true; counted = true;
        const result = await recommendations.search(await readJson(req), controller.signal);
        if (!controller.signal.aborted) json(res, 200, result);
      } catch (error) {
        if (res.destroyed) return;
        const safe = error instanceof SpeechError ? error : new SpeechError('SEARCH_UNAVAILABLE', 'Book search is unavailable. Please retry.', 503);
        json(res, safe.status, { error: { code: safe.code, message: safe.message } });
      } finally { if (counted) searching = false; res.removeListener('close', disconnected); }
      return;
    }
    if ((path === '/api/audio/key' && ['PUT', 'DELETE'].includes(req.method ?? '')) || (path === '/api/audio/selection' && req.method === 'PUT')) {
      let locked = false;
      try {
        if (req.headers['x-bookworm-client'] !== 'audio-v1' || !req.headers['content-type']?.startsWith('application/json')) throw new SpeechError('INVALID_REQUEST', 'Use the BookWorm settings form.', 400);
        if (!updateKey || (path.endsWith('/selection') && !settings)) throw new SpeechError('SETTINGS_UNAVAILABLE', 'Audio setup is unavailable on this server.', 503);
        if (updatingKey || active) throw new SpeechError('BUSY', 'Pause playback in all BookWorm tabs, then try again.', 409);
        updatingKey = true; locked = true;
        const body = await readJson(req) as { apiKey?: unknown; provider?: unknown };
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new SpeechError('INVALID_REQUEST', 'Expected a settings object.', 400);
        if (path.endsWith('/selection')) await settings!.select(validateSelection(body));
        else {
          const target = body.provider ?? 'openrouter';
          if (target !== 'openrouter' && target !== 'openai') throw new SpeechError('INVALID_PROVIDER', 'Choose OpenRouter or OpenAI.', 400);
          const key = req.method === 'DELETE' ? '' : validateApiKey(body.apiKey);
          await updateKey(key, target);
        }
        json(res, 200, { configured: provider.configured });
      } catch (error) {
        const safe = error instanceof SpeechError ? error : new SpeechError('KEY_SAVE_FAILED', 'The local server could not update the key.', 500);
        json(res, safe.status, { error: { code: safe.code, message: safe.message } });
      } finally { if (locked) updatingKey = false; }
      return;
    }
    if (req.method === 'GET' && path === '/api/audio/config') return json(res, 200, { configured: provider.configured, profile: provider.profile, maxPassageBytes: 2400, keyStorage: 'local', ...(settings ? settings.read() : {}) });
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
