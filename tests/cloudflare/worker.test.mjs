import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import worker from '../../dist/cloudflare/worker.js';
const database = new DatabaseSync(':memory:');
for (const file of readdirSync('migrations').filter(x=>x.endsWith('.sql'))) database.exec(readFileSync(`migrations/${file}`,'utf8'));
const env = {API_LIMIT:{limit:async()=>({success:true})},DB:{prepare(sql){let values=[];return {bind(...v){values=v;return this;},async first(){return database.prepare(sql).get(...values);},async run(){database.prepare(sql).run(...values);}}}}};
const sessions = new Map();
async function req(path='/api/audio/config',method='GET',body, user='alice', extra={}) {
 if (user && !sessions.has(user)) {
   const response=await worker.fetch(new Request('https://example.workers.dev/'),env);
   sessions.set(user,response.headers.get('Set-Cookie').split(';')[0]);
 }
 return worker.fetch(new Request(`https://example.workers.dev${path}`,{method,headers:{...(user?{Cookie:sessions.get(user)}:{}),...(body?{'Content-Type':'application/json','X-Bookworm-Client':'audio-v1'}:{}),...extra},...(body?{body:JSON.stringify(body)}:{})}),env);
}
const key='dummy-key-for-tests-only-12345';
test('public pages establish secure sessions while APIs reject missing or forged identity',async()=>{
 const fresh=await req('/', 'GET', undefined, ''); assert.equal(fresh.status,200); const cookie=fresh.headers.get('Set-Cookie'); assert.match(cookie,/HttpOnly; Secure; SameSite=Strict/); assert.match(cookie,/^__Host-bookworm=[a-f0-9]{64}; Path=\//);
 assert.equal((await req('/api/audio/config','GET',undefined,'')).status,401);
 assert.equal((await req('/api/audio/config','GET',undefined,'',{'oai-authenticated-user-id':'alice','Cf-Access-Authenticated-User-Email':'alice'})).status,401);
 const page=await req('/');assert.equal(page.status,200);const html=await page.text();assert.match(html,/\/assets\/simple.js/);assert.match(html,/id="catalog-form"/);assert.match(html,/id="catalog-query"/);
 assert.match(page.headers.get('Content-Security-Policy'),/connect-src 'self' https:\/\/www\.gutenberg\.org;/);
 assert.equal(html,readFileSync('dist/public/simple.html','utf8'));
 for (const path of ['/simple', '/simple/']) assert.equal(await (await req(path)).text(),html);
 const client=await req('/assets/simple.js');assert.equal(client.status,200);
 assert.equal(await client.text(),readFileSync('dist/public/simple.js','utf8'));
 assert.equal((await req('/', 'GET', undefined, 'alice', {'Sec-Fetch-Site':'cross-site'})).status,200);
});
test('keys are isolated, write-only, removable and retained independently',async()=>{
 assert.equal((await req('/api/audio/key','PUT',{provider:'openrouter',apiKey:`  ${key}\n`})).status,200);
 assert.equal(database.prepare('SELECT openrouter_key FROM public_audio_settings').get().openrouter_key,key);
 let config=await (await req()).json(); assert.equal(config.configured,true);assert.equal(config.keyStorage,'session');assert.equal(JSON.stringify(config).includes(key),false);
 assert.equal((await (await req(undefined,'GET',undefined,'bob')).json()).configured,false);
 await req('/api/audio/key','PUT',{provider:'openai',apiKey:key+'-openai'});
 await req('/api/audio/key','DELETE',{provider:'openrouter'});
 config=await (await req()).json(); assert.equal(config.keys.openrouter,false);assert.equal(config.keys.openai,true);assert.equal(config.configured,false);
 assert.equal(database.prepare('SELECT openrouter_key FROM public_audio_settings').get().openrouter_key,'');
});
test('model selection validates voices and routes only to the selected provider',async()=>{
 assert.equal((await req('/api/audio/selection','PUT',{provider:'openai',voice:'invalid'})).status,400);
 await req('/api/audio/selection','PUT',{provider:'openai',voice:'cedar'});
 const config=await (await req()).json();assert.equal(config.profile.model,'gpt-4o-mini-tts');assert.equal(config.profile.voice,'cedar');
 const original=globalThis.fetch;
 try {
  let calls=0;
  globalThis.fetch=async function(url,init){assert.equal(this,undefined,'native Workers fetch must be called without a provider receiver');calls++;assert.equal(url,'https://api.openai.com/v1/audio/speech');assert.equal(init.headers.Authorization,`Bearer ${key}-openai`);assert.equal(JSON.parse(init.body).voice,'cedar');const bytes=new Uint8Array(64);bytes.set([73,68,51]);return new Response(bytes,{headers:{'Content-Type':'audio/mpeg'}});};
  const audio=await req('/api/audio/speech','POST',{profileId:config.profile.id,text:'Hello reader.'});assert.equal(audio.status,200);assert.equal(audio.headers.get('Content-Type'),'audio/mpeg');assert.equal(calls,1);
  assert.equal((await req('/api/audio/speech','POST',{profileId:'stale',text:'Hello'})).status,409);
  globalThis.fetch=async()=>new Response('sensitive upstream body '+key,{status:401});
  const rejected=await req('/api/audio/speech','POST',{profileId:config.profile.id,text:'Hello'});assert.equal(rejected.status,401);assert.equal((await rejected.text()).includes(key),false);
  await req('/api/audio/key','DELETE',{provider:'openai'});
  const missing=await req('/api/audio/speech','POST',{profileId:config.profile.id,text:'Hello'});assert.equal(missing.status,503);
 } finally {globalThis.fetch=original;}
});
test('blocks cross-origin writes, malformed keys, oversized and control-character passages',async()=>{
 assert.equal((await req('/api/audio/key','PUT',{provider:'openai',apiKey:key},'alice',{Origin:'https://evil.example'})).status,403);
 assert.equal((await req('/api/audio/key','PUT',{provider:'openai',apiKey:'tiny'})).status,400);
 assert.equal((await req('/api/audio/key','PUT',{provider:'openai',apiKey:'a-secret-key with spaces'})).status,400);
 const config=await (await req()).json();
 assert.equal((await req('/api/audio/speech','POST',{profileId:config.profile.id,text:'x'.repeat(2500)})).status,413);
 assert.equal((await req('/api/audio/speech','POST',{profileId:config.profile.id,text:'hello\u0001'})).status,400);
 assert.equal((await req('/api/audio/key','PUT',{provider:'openai',apiKey:'x'.repeat(17000)})).status,413);
});

test('session expiry removes access to old keys and scheduled cleanup deletes expired rows',async()=>{
 await req('/api/audio/key','PUT',{provider:'openrouter',apiKey:key},'expiry');
 database.exec('UPDATE public_audio_settings SET expires_at=0');
 assert.equal((await (await req(undefined,'GET',undefined,'expiry')).json()).configured,false);
 await req('/api/audio/key','PUT',{provider:'openai',apiKey:key},'expiry');
 const settings=await (await req(undefined,'GET',undefined,'expiry')).json();
 assert.equal(settings.keys.openrouter,false);assert.equal(settings.keys.openai,true);
 await worker.scheduled({},env);
 assert.equal(database.prepare('SELECT count(*) AS n FROM public_audio_settings WHERE expires_at=0').get().n,0);
});
test('rate limit blocks API work',async()=>{
 const original=env.API_LIMIT.limit;env.API_LIMIT.limit=async()=>({success:false});
 try {assert.equal((await req()).status,429);} finally {env.API_LIMIT.limit=original;}
});
