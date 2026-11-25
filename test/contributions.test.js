import {test,expect} from 'bun:test';
import {setup,client} from './helpers.js';
const message={kind:'feature',title:'Better simulator',message:'Add a cost slider.',consent:true};
const get=(rt,path,headers={})=>rt.app(new Request('http://localhost'+path,{headers}));
const admin={authorization:'Bearer test-admin'};
const update=(rt,id,body,headers=admin)=>rt.app(new Request('http://localhost/api/contributions/'+id+'/status',{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)}));
test('consent, idempotency, private inbox and browser-scoped progress',async()=>{
 const rt=await setup();
 try{
  const a=await client(rt),b=await client(rt),key=crypto.randomUUID(),headers={'idempotency-key':key};
  expect((await a.post('/api/contributions',{...message,consent:false})).status).toBe(400);
  expect((await a.post('/api/contributions',message,{origin:'https://evil.test'})).status).toBe(403);
  expect((await a.post('/api/contributions',message,{'x-csrf-token':'bad'})).status).toBe(403);
  const first=await a.post('/api/contributions',message,headers);expect(first.status).toBe(201);
  const record=await first.json();expect(record.status).toBe('queued');
  expect(await (await a.post('/api/contributions',message,headers)).json()).toEqual(record);
  expect((await a.post('/api/contributions',{...message,title:'Changed'},headers)).status).toBe(409);
  expect((await (await get(rt,'/api/contributions',{cookie:a.cookie})).json()).contributions).toEqual([record]);
  expect((await (await get(rt,'/api/contributions',{cookie:b.cookie})).json()).contributions).toEqual([]);
  expect((await get(rt,'/api/contributions/inbox')).status).toBe(403);
  expect((await (await get(rt,'/api/contributions/inbox',admin)).json()).contributions).toEqual([{...record,message:message.message}]);
  expect((await update(rt,record.id,{expectedStatus:'queued',status:'researching'},{})).status).toBe(403);
  expect((await update(rt,record.id,{expectedStatus:'queued',status:'review',prNumber:20})).status).toBe(400);
  expect((await update(rt,record.id,{expectedStatus:'queued',status:'researching'})).status).toBe(200);
  expect((await update(rt,record.id,{expectedStatus:'queued',status:'researching'})).status).toBe(409);
  expect((await update(rt,record.id,{expectedStatus:'researching',status:'implementing'})).status).toBe(200);
  expect((await update(rt,record.id,{expectedStatus:'implementing',status:'review'})).status).toBe(400);
  const done=await update(rt,record.id,{expectedStatus:'implementing',status:'review',prNumber:123});expect(done.status).toBe(200);
  expect((await (await get(rt,'/api/contributions',{cookie:a.cookie})).json()).contributions[0].prNumber).toBe(123);
 }finally{await rt.store.close()}
});
