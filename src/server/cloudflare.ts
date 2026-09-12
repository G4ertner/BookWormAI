import html from '../simple/index.html';
import client from '../../dist/public/simple.js?raw';
import { OpenRouterSpeech, OpenAISpeech, SpeechError, validateText } from './speech.ts';
import { ExaRecommendations } from './recommendations.ts';
import { OPENAI_VOICES } from '../audio/catalog.ts';
import { CompanionService } from './companion.ts';
import { CompanionError } from '../companion/types.ts';

interface Statement { bind(...values: unknown[]): Statement; first(): Promise<any>; run(): Promise<unknown> }
interface Env { DB: { prepare(sql: string): Statement }; API_LIMIT: { limit(options: {key: string}): Promise<{success: boolean}> } }
const headers = {
  'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' https://www.gutenberg.org; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
};
const json = (body: unknown, status = 200) => Response.json(body, { status, headers });
const reject = (code: string, message: string, status = 400): never => { throw new SpeechError(code, message, status); };
async function readBody(request: Request, limit = 16000): Promise<any> {
  if (request.headers.get('X-Bookworm-Client') !== 'audio-v1' || !request.headers.get('Content-Type')?.startsWith('application/json')) reject('INVALID_REQUEST', 'Use the BookWorm settings or audio controls.');
  const reader = request.body?.getReader();
  if (!reader) reject('INVALID_JSON', 'Expected a request body.');
  let size = 0; const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const {value, done} = await reader!.read(); if (done) break;
      size += value.length;
      if (size > limit) { await reader!.cancel(); reject('BODY_TOO_LARGE', 'The request exceeds its size limit. Clear older discussion or use a shorter question.', 413); }
      chunks.push(value);
    }
  } finally { reader!.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let body;
  try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { reject('INVALID_JSON', 'Expected valid JSON.'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) reject('INVALID_REQUEST', 'Expected a request object.');
  return body;
}
// Only guards concurrent work in this isolate; provider quotas remain authoritative.
const active = new Map<string, number>();
const discussing = new Set<string>();
const searching = new Set<string>();
export default {
  async scheduled(_event: unknown, env: Env): Promise<void> {
    await env.DB.prepare('DELETE FROM recommendation_settings WHERE expires_at <= ?').bind(Math.floor(Date.now()/1000)).run();
    await env.DB.prepare('DELETE FROM public_audio_settings WHERE expires_at <= ?').bind(Math.floor(Date.now()/1000)).run();
    await env.DB.prepare('DELETE FROM companion_exa_settings WHERE expires_at <= ?').bind(Math.floor(Date.now()/1000)).run();
  },
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);
      const token = request.headers.get('Cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith('__Host-bookworm='))?.slice('__Host-bookworm='.length);
      const validToken = token && /^[a-f0-9]{64}$/.test(token) ? token : null;
      const origin = request.headers.get('Origin');
      if (!['GET', 'HEAD'].includes(request.method) && ((origin && origin !== url.origin) || request.headers.get('Sec-Fetch-Site') === 'cross-site')) reject('ORIGIN_DENIED', 'Cross-site requests are not allowed.', 403);
      if (request.method === 'GET' && ['/', '/simple', '/simple/'].includes(url.pathname)) {
        const responseHeaders = new Headers({...headers,'Content-Type':'text/html; charset=utf-8'});
        if (!validToken) {
          const session = Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('');
          responseHeaders.set('Set-Cookie', `__Host-bookworm=${session}; Path=/; Max-Age=86400; HttpOnly; Secure; SameSite=Strict`);
        }
        return new Response(html, {headers:responseHeaders});
      }
      if (request.method === 'GET' && url.pathname === '/assets/simple.js') return new Response(client, { headers: { ...headers, 'Content-Type': 'text/javascript; charset=utf-8' } });
      if (!['/api/companion/config','/api/companion/turn','/api/companion/search','/api/companion/exa-key','/api/books/recommendations/config','/api/books/recommendations/key','/api/books/recommendations','/api/audio/config','/api/audio/key','/api/audio/selection','/api/audio/speech'].includes(url.pathname)) return json({error:{code:'NOT_FOUND',message:'Not found.'}},404);
      if (!validToken) reject('SESSION_REQUIRED','Open the reader and allow cookies, then retry.',401);
      // Cookie is a random bearer secret. Only its hash is stored in D1.
      const user = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(validToken!))),v=>v.toString(16).padStart(2,'0')).join('');
      if (!(await env.API_LIMIT.limit({key:`bookworm:${request.headers.get('CF-Connecting-IP') ?? user}`})).success) reject('RATE_LIMITED','Too many requests. Wait a minute and retry.',429);
      if (url.pathname.startsWith('/api/books/recommendations')) {
        const now = Math.floor(Date.now()/1000);
        if (url.pathname.endsWith('/key') && ['PUT', 'DELETE'].includes(request.method)) {
          if (searching.has(user)) reject('SEARCH_BUSY', 'Wait for book search to finish, then retry.', 409);
          const body = await readBody(request);
          const key = request.method === 'DELETE' ? '' : typeof body.apiKey === 'string' ? body.apiKey.trim() : body.apiKey;
          if (request.method !== 'DELETE' && (typeof key !== 'string' || key.length < 20 || key.length > 512 || /\s|[^\x21-\x7e]/.test(key))) reject('INVALID_KEY', 'Enter a valid Exa API key (20–512 characters, no spaces).');
          if (request.method === 'DELETE') await env.DB.prepare('DELETE FROM recommendation_settings WHERE user_id = ?').bind(user).run();
          else await env.DB.prepare('INSERT INTO recommendation_settings (user_id, api_key, expires_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET api_key=excluded.api_key, expires_at=excluded.expires_at').bind(user,key,now+86400).run();
          const response = json({saved:true});
          response.headers.set('Set-Cookie', `__Host-bookworm=${validToken}; Path=/; Max-Age=86400; HttpOnly; Secure; SameSite=Strict`);
          return response;
        }
        const settings = await env.DB.prepare('SELECT api_key FROM recommendation_settings WHERE user_id = ? AND expires_at > ?').bind(user,now).first();
        const recommendations = new ExaRecommendations(settings?.api_key ?? '');
        if (request.method === 'GET' && url.pathname.endsWith('/config')) return json({configured:recommendations.configured});
        if (request.method === 'POST' && url.pathname === '/api/books/recommendations') {
          const body = await readBody(request);
          if (searching.has(user)) reject('SEARCH_BUSY', 'A book search is already running. Wait and retry.', 429);
          searching.add(user);
          try { return json(await recommendations.search(body, request.signal)); }
          finally { searching.delete(user); }
        }
        return json({error:{code:'METHOD_NOT_ALLOWED',message:'Unsupported method.'}},405);
      }
      const now = Math.floor(Date.now()/1000);
      if (!env.DB) reject('SETTINGS_UNAVAILABLE', 'Audio settings are temporarily unavailable.', 503);
      const settings = await env.DB.prepare('SELECT * FROM public_audio_settings WHERE user_id = ? AND expires_at > ?').bind(user,now).first() ?? {provider:'openrouter',voice:'marin',openrouter_key:'',openai_key:''};
      if (url.pathname.startsWith('/api/companion/')) {
        const searchSettings = await env.DB.prepare('SELECT * FROM companion_exa_settings WHERE user_id = ? AND expires_at > ?').bind(user,now).first();
        const companion = new CompanionService(() => settings.openrouter_key || '', () => searchSettings?.exa_key || '');
        if (url.pathname.endsWith('/config') && request.method === 'GET') return json(companion.config());
        if (discussing.has(user)) reject('BUSY', 'A companion request is already running. Wait or cancel it.', 429);
        discussing.add(user);
        try {
          const body = await readBody(request, url.pathname.endsWith('/turn') ? 65536 : 16000);
          if (url.pathname.endsWith('/turn') && request.method === 'POST') return json(await companion.turn(body, request.signal));
          if (url.pathname.endsWith('/search') && request.method === 'POST') return json(await companion.search(body, request.signal));
          if (url.pathname.endsWith('/exa-key') && ['PUT', 'DELETE'].includes(request.method)) {
            const key = request.method === 'DELETE' ? '' : typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
            if (request.method !== 'DELETE' && (key.length < 20 || key.length > 512 || /\s|[^\x21-\x7e]/.test(key))) reject('INVALID_KEY', 'Enter a valid Exa API key (20–512 characters, no spaces).');
            await env.DB.prepare('INSERT INTO companion_exa_settings (user_id, exa_key, expires_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET exa_key=excluded.exa_key, expires_at=excluded.expires_at').bind(user,key,now+86400).run();
            return json({ saved: true });
          }
          return json({error:{code:'METHOD_NOT_ALLOWED',message:'Unsupported companion operation.'}},405);
        } finally { discussing.delete(user); }
      }
      const provider = settings.provider === 'openai' ? new OpenAISpeech(settings.openai_key, settings.voice) : new OpenRouterSpeech(settings.openrouter_key);
      if (request.method === 'GET' && url.pathname === '/api/audio/config') return json({
        configured: provider.configured, profile: provider.profile, maxPassageBytes: 2400, keyStorage: 'session',
        selection: {provider: settings.provider, voice: settings.voice},
        keys: {openrouter: Boolean(settings.openrouter_key), openai: Boolean(settings.openai_key)},
      });
      if ((url.pathname === '/api/audio/key' && ['PUT','DELETE'].includes(request.method)) || (url.pathname === '/api/audio/selection' && request.method === 'PUT')) {
        if (active.get(user)) reject('BUSY', 'Pause playback and wait for narration to finish, then retry.', 409);
        const body = await readBody(request);
        if (!['openrouter','openai'].includes(body.provider)) reject('INVALID_PROVIDER', 'Choose OpenRouter or OpenAI.');
        if (url.pathname.endsWith('/selection')) {
          if (body.provider === 'openai' && !OPENAI_VOICES.some(voice => voice === body.voice)) reject('INVALID_VOICE', 'Choose one of the listed OpenAI voices.');
          await env.DB.prepare(`INSERT INTO public_audio_settings (user_id, provider, voice, expires_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET provider=excluded.provider, voice=excluded.voice, openrouter_key=CASE WHEN public_audio_settings.expires_at > ? THEN public_audio_settings.openrouter_key ELSE '' END, openai_key=CASE WHEN public_audio_settings.expires_at > ? THEN public_audio_settings.openai_key ELSE '' END, expires_at=excluded.expires_at`).bind(user,body.provider,body.provider === 'openai' ? body.voice : 'marin', now+86400, now, now).run();
        } else {
          const key = request.method === 'DELETE' ? '' : typeof body.apiKey === 'string' ? body.apiKey.trim() : body.apiKey;
          if (request.method !== 'DELETE' && (typeof key !== 'string' || key.length < 20 || key.length > 512 || /\s|[^\x21-\x7e]/.test(key))) reject('INVALID_KEY','Enter a valid API key (20–512 characters, no spaces).');
          // The identifier is selected from a fixed allowlist; all data is bound.
          const column = body.provider === 'openai' ? 'openai_key' : 'openrouter_key';
          const other = body.provider === 'openai' ? 'openrouter_key' : 'openai_key';
          await env.DB.prepare(`INSERT INTO public_audio_settings (user_id, ${column}, expires_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET ${column}=excluded.${column}, ${other}=CASE WHEN public_audio_settings.expires_at > ? THEN public_audio_settings.${other} ELSE '' END, expires_at=excluded.expires_at`).bind(user,key,now+86400,now).run();
        }
        return json({saved:true});
      }
      if (request.method === 'POST' && url.pathname === '/api/audio/speech') {
        const body = await readBody(request);
        if (body.profileId !== provider.profile.id) reject('PROFILE_CHANGED', 'Narrator settings changed. Reload before continuing.', 409);
        const text = validateText(body.text);
        const count = active.get(user) ?? 0;
        if (count >= 2) reject('BUSY','Audio is busy. Wait and retry.',429);
        active.set(user,count+1);
        try {
          const result = await provider.synthesize(text,request.signal);
          return new Response(new Uint8Array(result.bytes).buffer, {headers:{...headers,'Content-Type':result.contentType}});
        } finally { const count = (active.get(user) ?? 1)-1; if (count) active.set(user,count); else active.delete(user); }
      }
      return json({error:{code:'METHOD_NOT_ALLOWED',message:'Unsupported method.'}},405);
    } catch (error) {
      const safe = error instanceof SpeechError || error instanceof CompanionError ? error : new SpeechError('SERVICE_UNAVAILABLE','The reader service is temporarily unavailable. Please retry.',503);
      return json({error:{code:safe.code,message:safe.message}},safe.status);
    }
  },
};
