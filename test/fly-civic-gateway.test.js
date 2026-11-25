import {test,expect} from 'bun:test';
import {forwardCivic,configuredDatabase,SITE_ID,FLY_ORIGIN} from '../src/fly-civic-gateway.js';
import {setup} from './helpers.js';
const origin='https://deploy-preview-45--heliosailol.netlify.app';
const context={site:{id:SITE_ID}};
test('missing DB mode is restricted to the original site and narrow public civic routes',async()=>{
 let calls=0;const fetchImpl=async()=>{calls++;return Response.json({ok:true})};
 for(const [url,ctx] of [['https://fork.example/api/catalog',context],[origin+'/api/catalog',{site:{id:'other'}}],[origin+'/api/constitution/moderation',context],[origin+'/api/email/inbox',context],[origin+'/proxy/ycr/',context]]){
   expect((await forwardCivic(new Request(url),ctx,{fetchImpl})).status).toBe(503);
 }
 expect(calls).toBe(0);expect(configuredDatabase({})).toBe(false);expect(configuredDatabase({SUPABASE_DB_URL:'postgres://example'})).toBe(true);
});
test('gateway shares Fly catalog, sessions and constitution while keeping CSRF, consent and cookie isolation',async()=>{
 const rt=await setup();
 try{
 const seen=[];
 const fetchImpl=async(url,init)=>{seen.push({url,headers:new Headers(init.headers)});return rt.app(new Request(url,init))};
 const get=async(path,cookie='')=>forwardCivic(new Request(origin+path,{headers:{cookie,authorization:'Bearer not-forwarded'}}),context,{fetchImpl});
 const catalog=await get('/api/catalog');expect(catalog.status).toBe(200);expect((await catalog.json()).goals).toHaveLength(100);
 const session=await get('/api/session');expect(session.status).toBe(200);
 const token=(await session.json()).csrfToken;
 const setCookie=session.headers.get('set-cookie');expect(setCookie).toContain('Secure');expect(setCookie).toContain('HttpOnly');expect(setCookie).toContain('Path=/api');
 const cookie=setCookie.split(';')[0];
 const post=(path,body,extra={})=>forwardCivic(new Request(origin+path,{method:'POST',headers:{origin,'content-type':'application/json',cookie:cookie+'; unrelated=private','x-csrf-token':token,'idempotency-key':crypto.randomUUID(),authorization:'Bearer private',...extra},body:JSON.stringify(body)}),context,{fetchImpl});
 expect((await post('/api/constitution/vote',{clauseId:'S-001',position:'support'},{origin:'https://evil.example'})).status).toBe(403);
 expect((await post('/api/constitution/vote',{clauseId:'S-001',position:'support'},{'x-csrf-token':'bad'})).status).toBe(403);
 expect((await post('/api/constitution/moderate',{kind:'clause',id:'x',decision:'approved'})).status).toBe(503);
 expect((await post('/api/constitution/vote',{clauseId:'S-001',position:'support'})).status).toBe(201);
 expect((await post('/api/constitution/comment',{clauseId:'S-001',text:'Review',consent:false})).status).toBe(400);
 const board=await get('/api/constitution',cookie);expect(board.status).toBe(200);
 const clause=(await board.json()).clauses.find(c=>c.id==='S-001');expect(clause.live.support).toBe(1);expect(clause.myVote).toBe('support');
 expect(seen.every(x=>x.url.startsWith(FLY_ORIGIN+'/api/')&&!x.headers.has('authorization')&&!x.headers.get('cookie')?.includes('unrelated'))).toBe(true);
 expect(seen.find(x=>x.headers.has('x-csrf-token')).headers.get('origin')).toBe(FLY_ORIGIN);
 }finally{await rt.store.close()}
});
test('upstream outage and old Fly releases return explicit 503, not fake counts or writes',async()=>{
 for(const fetchImpl of [async()=>{throw Error('unreachable')},async()=>Response.json({error:'not found'},{status:404}),async()=>new Response('<h1>Bad gateway</h1>',{status:502})]){
   const response=await forwardCivic(new Request(origin+'/api/constitution'),context,{fetchImpl});
   expect(response.status).toBe(503);expect((await response.json()).code).toBe('SHARED_BACKEND_UNAVAILABLE');
 }
});

test('gateway forwards only a validated public clause ID for a deep link',async()=>{
 let url;
 const fetchImpl=async u=>{url=u;return Response.json({clauses:[]})};
 const id='C-'+'a'.repeat(64);
 const response=await forwardCivic(new Request(origin+'/api/constitution?clause='+id+'&journal=PRIVATE'),context,{fetchImpl});
 expect(response.status).toBe(200);
 expect(url).toBe(FLY_ORIGIN+'/api/constitution?clause='+id);
 const invalid=await forwardCivic(new Request(origin+'/api/constitution?clause=private%20text'),context,{fetchImpl});
 expect(invalid.status).toBe(400);
});
