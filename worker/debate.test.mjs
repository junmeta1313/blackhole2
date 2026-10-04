import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { handle } from './index.mjs';
import { validateTurn, debatePrompt } from './debate.mjs';
function fixture(t) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(fs.readFileSync(new URL('./debate-schema.sql',import.meta.url),'utf8'));
  t.after(()=>sqlite.close());
  const DB = { prepare(sql) { return { bind(...args) { return { async first() { return sqlite.prepare(sql).get(...args) || null; }, async run() { return sqlite.prepare(sql).run(...args); } }; }, async first() { return sqlite.prepare(sql).get() || null; }, async all() { return { results: sqlite.prepare(sql).all() }; } }; } };
  return { DB, OPENAI_API_KEY:'test-openai',GEMINI_API_KEY:'test-google',DEBATE_PASSWORD:'test-password' };
}
const req=(path,body,ip='1.2.3.4')=>new Request('https://worker.test'+path,body?{method:'POST',headers:{Origin:'https://junmeta1313.github.io','CF-Connecting-IP':ip,'Content-Type':'application/json'},body:JSON.stringify(body)}:{});
const start={password:'test-password',topic:'우주 개발',openaiPosition:'찬성',geminiPosition:'반대',totalTurns:6};
function fake(log,short=false) { return async (url,init)=>{
  const b=JSON.parse(init.body);log.push({url,b});
  if(String(url).includes('openai')) {
    assert.equal(b.model,'gpt-6-luna');assert.equal(b.store,false);assert.equal(b.tools,undefined);
    assert.match(b.instructions,/300~450자/);assert.match(b.instructions,/빈 줄/);assert.match(b.instructions,/가벼운 비꼼/);
    return Response.json({status:'completed',output_text:short?'짧음':'관'.repeat(350),usage:{input_tokens:100,output_tokens:200}});
  }
  assert.ok(String(url).includes('gemini-3.5-flash-lite:generateContent'));
  assert.equal(init.headers['x-goog-api-key'],'test-google');
  assert.equal(b.generationConfig.thinkingConfig.thinkingLevel,'LOW');
  assert.equal(b.generationConfig.thinkingConfig.thinkingBudget,undefined);
  if (!b.generationConfig.responseMimeType) {
    assert.match(b.systemInstruction.parts[0].text,/300~450자/);
    assert.match(b.systemInstruction.parts[0].text,/주장과 근거를 비판/);
  }
  return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:b.generationConfig.responseMimeType?JSON.stringify({openai:'찬성 측 핵심 주장',gemini:'반대 측 핵심 주장'}):'측'.repeat(350)}]}}],usageMetadata:{totalTokenCount:200}});
}; }
test('password is required on server and invalid starts never call paid APIs',async t=>{
 const e=fixture(t);let calls=0;const deps={now:Date.now(),fetch:()=>{calls++;throw Error('no');}};
 assert.equal((await handle(req('/debates/start',{...start,password:'wrong'}),e,deps)).status,401);
 assert.equal((await handle(req('/debates/start',start),e,deps)).status,429);
 assert.equal((await handle(req('/debates/start',{...start,totalTurns:13},'9.8.7.6'),e,deps)).status,400);
 assert.equal(calls,0);
 assert.equal((await handle(req('/debates/health'),e)).status,200);
});
test('six alternating turns plus one Gemini summary persist as a publicly readable post',async t=>{
 const e=fixture(t),log=[],deps={fetch:fake(log)};
 const session=await (await handle(req('/debates/start',start),e,deps)).json();
 assert.equal((await handle(req(`/debates/${session.id}/turn`,{token:'wrong',expectedTurn:0}),e,deps)).status,401);
 for(let n=0;n<6;n++){
  const r=await handle(req(`/debates/${session.id}/turn`,{token:session.token,expectedTurn:n}),e,deps);assert.equal(r.status,200);
  const d=await r.json();assert.equal(d.turn.speaker,n%2?'gemini':'openai');assert.equal(d.turn.text.length,350);
 }
 const r=await handle(req(`/debates/${session.id}/turn`,{token:session.token,expectedTurn:6}),e,deps);
 assert.equal((await r.json()).summaryReady,true);
 assert.equal((await(await handle(req('/debates'),e)).json()).debates.length,0);
 const d=await(await handle(req(`/debates/${session.id}/publish`,{token:session.token}),e,deps)).json();
 assert.equal(d.completed,true);assert.equal(d.debate.turns.length,6);assert.equal(d.debate.summary.gemini,'반대 측 핵심 주장');
 assert.equal(log.length,7);assert.equal(log.filter(x=>String(x.url).includes('openai')).length,3);
 assert.equal(log.filter(x=>String(x.url).includes('googleapis')).length,4);
 const record=await (await handle(req(`/debates/${session.id}`),e)).json();assert.equal(record.debate.turns.length,6);assert.equal(record.debate.token,undefined);
 const list=await (await handle(req('/debates'),e)).json();assert.equal(list.debates.length,1);
 await handle(req(`/debates/${session.id}/turn`,{token:session.token,expectedTurn:6}),e,deps);assert.equal(log.length,7);
});
test('independent starts are allowed while concurrent requests for one turn cannot duplicate paid work',async t=>{
 const e=fixture(t);const result=await Promise.all([handle(req('/debates/start',start,'ip-a'),e),handle(req('/debates/start',start,'ip-b'),e)]);
 assert.deepEqual(result.map(r=>r.status).sort(),[200,200]);
 const session=await result.find(r=>r.status===200).json();let release;const blocker=new Promise(r=>{release=r;});let calls=0;
 const deps={fetch:async (...args)=>{calls++;await blocker;return fake([])(...args);}};
 const first=handle(req(`/debates/${session.id}/turn`,{token:session.token,expectedTurn:0}),e,deps);
 while(!calls)await new Promise(r=>setTimeout(r,1));
 assert.equal((await handle(req(`/debates/${session.id}/turn`,{token:session.token,expectedTurn:0}),e,deps)).status,409);
 release();assert.equal((await first).status,200);assert.equal(calls,1);
 const synced=await (await handle(req(`/debates/${session.id}/turn`,{token:session.token,expectedTurn:0}),e,deps)).json();assert.equal(synced.synced,true);assert.equal(calls,1);
});
test('invalid length pauses without retries or losing previous turns',async t=>{
 const e=fixture(t);const session=await (await handle(req('/debates/start',start),e)).json();const log=[];
 const r=await handle(req(`/debates/${session.id}/turn`,{token:session.token,expectedTurn:0}),e,{fetch:fake(log,true)});
 assert.equal(r.status,502);assert.equal(log.length,1);
 const list=await (await handle(req('/debates'),e)).json();assert.equal(list.debates.length,0);
 assert.throws(()=>validateTurn('가'.repeat(299)));assert.throws(()=>validateTurn('가'.repeat(451)));
 assert.equal(validateTurn('가'.repeat(300)).length,300);
 assert.equal(validateTurn('가'.repeat(450)).length,450);
});
test('shorter replies gain paragraph breaks without changing their argument',()=>{
 const sentences=['관측 비용이 줄어든다는 주장은 타당합니다.','하지만 비용만으로 우선순위를 정하는 것은 지나친 단순화입니다.','현장 연구자가 예외 상황에 대응할 수 있다는 점을 함께 비교해야 합니다.','저렴한 탐사가 곧 충분한 탐사라는 결론은 근거가 빠진 낙관입니다.'];
 const text=sentences.flatMap(s=>[s,s,s]).join(' ');
 const formatted=validateTurn(text);
 assert.ok(formatted.includes('\n\n'));
 assert.equal(formatted.replace(/\s+/g,' '),text);
 assert.ok(Array.from(formatted).length>=300 && Array.from(formatted).length<=450);
 assert.match(debatePrompt({topic:'topic',openai_position:'pro',gemini_position:'con'},[],'openai'),/300~450자/);
});
test('twelve-turn option produces six turns per side and only one summary',async t=>{
 const e=fixture(t),log=[],deps={fetch:fake(log)};
 const session=await (await handle(req('/debates/start',{...start,totalTurns:12}),e,deps)).json();
 for(let n=0;n<=12;n++){
  const r=await handle(req(`/debates/${session.id}/turn`,{token:session.token,expectedTurn:n}),e,deps);
  assert.equal(r.status,200);
  if(n===12){assert.equal((await r.json()).summaryReady,true);
   const d=await(await handle(req(`/debates/${session.id}/publish`,{token:session.token}),e,deps)).json();assert.equal(d.completed,true);assert.equal(d.debate.turns.filter(x=>x.speaker==='openai').length,6);assert.equal(d.debate.turns.filter(x=>x.speaker==='gemini').length,6);}
 }
 assert.equal(log.length,13);
});
test('authenticated cancellation clears unfinished records, skips summaries, and does not block new starts',async t=>{
 const e=fixture(t),log=[],deps={fetch:fake(log)};
 const session=await(await handle(req('/debates/start',start),e,deps)).json();
 await handle(req(`/debates/${session.id}/turn`,{token:session.token,expectedTurn:0}),e,deps);
 assert.equal((await handle(req(`/debates/${session.id}/cancel`,{token:'wrong'}),e,deps)).status,401);
 const cancellation=()=>handle(req(`/debates/${session.id}/cancel`,{token:session.token}),e,deps);
 assert.equal((await cancellation()).status,200);assert.equal((await cancellation()).status,200);
 assert.equal((await handle(req(`/debates/${session.id}/turn`,{token:session.token,expectedTurn:1}),e,deps)).status,410);
 assert.equal((await handle(req(`/debates/${session.id}/publish`,{token:session.token}),e,deps)).status,410);
 assert.equal((await handle(req(`/debates/${session.id}`),e)).status,404);
 const row=await e.DB.prepare('SELECT * FROM debates WHERE id = ?').bind(session.id).first();
 assert.equal(row.status,'cancelled');assert.equal(row.turns_json,'[]');assert.equal(row.summary_json,null);
 assert.equal(log.length,1);
 assert.equal((await handle(req('/debates/start',start,'new-ip'),e,deps)).status,200);
});
test('cancellation during an in-flight turn or summary prevents late writes and publication',async t=>{
 for(const summarizing of [false,true]){
  const e=fixture(t),deps={fetch:fake([])};
  const session=await(await handle(req('/debates/start',start),e,deps)).json();
  if(summarizing)for(let n=0;n<6;n++)await handle(req(`/debates/${session.id}/turn`,{token:session.token,expectedTurn:n}),e,deps);
  let release,entered;const started=new Promise(r=>{entered=r;});const blocker=new Promise(r=>{release=r;});let calls=0;
  const pending=handle(req(`/debates/${session.id}/turn`,{token:session.token,expectedTurn:summarizing?6:0}),e,{fetch:async(...args)=>{calls++;entered();await blocker;return fake([])(...args);}});
  await started;
  assert.equal((await handle(req(`/debates/${session.id}/cancel`,{token:session.token}),e)).status,200);
  release();assert.equal((await pending).status,410);assert.equal(calls,1);
  const row=await e.DB.prepare('SELECT * FROM debates WHERE id = ?').bind(session.id).first();
  assert.equal(row.status,'cancelled');assert.equal(row.turns_json,'[]');assert.equal(row.summary_json,null);
  assert.equal((await(await handle(req('/debates'),e)).json()).debates.length,0);
 }
});
test('an unacknowledged summary is private and cancellable, completed posts survive exit',async t=>{
 const e=fixture(t),log=[],deps={fetch:fake(log)};
 const session=await(await handle(req('/debates/start',start),e,deps)).json();
 for(let n=0;n<=6;n++)await handle(req(`/debates/${session.id}/turn`,{token:session.token,expectedTurn:n}),e,deps);
 assert.equal((await handle(req(`/debates/${session.id}`),e)).status,404);
 await handle(req(`/debates/${session.id}/turn`,{token:session.token,expectedTurn:6}),e,deps);assert.equal(log.length,7);
 await handle(req(`/debates/${session.id}/publish`,{token:session.token}),e,deps);
 await handle(req(`/debates/${session.id}/cancel`,{token:session.token}),e,deps);
 assert.equal((await handle(req(`/debates/${session.id}`),e)).status,200);assert.equal(log.length,7);
});
test('Gemini errors reveal only HTTP status and a known reason, never provider messages or keys',async t=>{
 const e=fixture(t),deps={fetch:fake([])};
 const session=await(await handle(req('/debates/start',start),e,deps)).json();
 await handle(req(`/debates/${session.id}/turn`,{token:session.token,expectedTurn:0}),e,deps);
 const r=await handle(req(`/debates/${session.id}/turn`,{token:session.token,expectedTurn:1}),e,{fetch:async()=>Response.json({error:{status:'NOT_FOUND',message:'sensitive-api-key-secret'}},{status:404})});
 const body=await r.json();assert.equal(r.status,502);assert.match(body.error,/Gemini HTTP 404 · NOT_FOUND/);assert.ok(!body.error.includes('sensitive'));
});
test('Gemini precondition failures distinguish region and billing without exposing raw errors or retrying',async t=>{
 const e=fixture(t),deps={fetch:fake([])};
 const session=await(await handle(req('/debates/start',start),e,deps)).json();
 await handle(req(`/debates/${session.id}/turn`,{token:session.token,expectedTurn:0}),e,deps);
 const cases=[
  ['Gemini API free tier is not available in your country. Please enable billing.', 'free_tier_region', /무료 API/],
  ['User location is not supported for the API use.', 'region', /Cloudflare 서버/],
  ['Billing is not enabled for this project.', 'billing', /결제 상태/],
  ['Unknown precondition involving sensitive-api-key-secret.', undefined, /이용 조건/]
 ];
 let calls=0;
 for(const [message,reason,hint] of cases){
  const r=await handle(req(`/debates/${session.id}/turn`,{token:session.token,expectedTurn:1}),e,{fetch:async()=>{
   calls++;return Response.json({error:{status:'FAILED_PRECONDITION',message:message+' sensitive-api-key-secret'}},{status:400});
  }});
  const body=await r.json();assert.equal(r.status,502);assert.equal(body.reason,reason);assert.match(body.error,hint);assert.ok(!body.error.includes('sensitive'));
 }
 assert.equal(calls,cases.length);
 const synced=await(await handle(req(`/debates/${session.id}/turn`,{token:session.token,expectedTurn:0}),e,deps)).json();
 assert.equal(synced.debate.turns.length,1);assert.equal(synced.debate.turns[0].speaker,'openai');
});
