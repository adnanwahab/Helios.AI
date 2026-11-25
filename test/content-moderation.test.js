import {test,expect} from 'bun:test';
import {createContentModerator,DEFAULT_MODERATION_MODEL} from '../src/content-moderation.js';
import {setup,client} from './helpers.js';
const env={HELIOS_AUTO_MODERATION:'1',OPENAI_API_KEY:'test-only'};
const clean=()=>Response.json({id:'modr-test',model:DEFAULT_MODERATION_MODEL,results:[{flagged:false,categories:{harassment:false,hate:false,violence:false}}]});
test('moderation stays off without explicit configuration and avoids contact details',async()=>{
 let called=0;
 const fetchImpl=async()=>{called++;return clean()};
 const disabled=createContentModerator({env:{OPENAI_API_KEY:'test-only'},fetchImpl});
 expect((await disabled.classify('cool beans')).reason).toBe('disabled');
 const preview=createContentModerator({env:{...env,CONTEXT:'deploy-preview'},fetchImpl});
 expect((await preview.classify('cool beans')).reason).toBe('disabled');
 const mod=createContentModerator({env,fetchImpl});
 expect((await mod.classify('Contact fake@example.com')).reason).toBe('possible-private-information');
 expect(called).toBe(0);
});
test('pinned model approves only an explicit unflagged result',async()=>{
 const m=createContentModerator({env,fetchImpl:async(url,options)=>{
  expect(url).toBe('https://api.openai.com/v1/moderations');
  expect(JSON.parse(options.body)).toEqual({model:DEFAULT_MODERATION_MODEL,input:'cool beanscool beanscool beanscool beans'});
  return clean();
 }});
 expect((await m.classify('cool beanscool beanscool beanscool beans')).decision).toBe('approve');
 for(const reply of [()=>Response.json({id:'bad',model:DEFAULT_MODERATION_MODEL,results:[{flagged:false,categories:{hate:true}}]}),()=>Response.json({results:[{flagged:false}]}),()=>new Response('',{status:429}),()=>{throw Error('offline')} ]){
  const mod=createContentModerator({env,fetchImpl:async()=>reply()});
  expect((await mod.classify('test')).decision).toBe('hold');
 }
});
test('public consent plus optional AI consent controls publication, including comments',async()=>{
 const sent=[];
 const rt=await setup({env,moderationFetch:async(_url,options)=>{
   const text=JSON.parse(options.body).input;sent.push(text);
   if(text==='Safety fixture')return Response.json({id:'modr-flag',model:DEFAULT_MODERATION_MODEL,results:[{flagged:true,categories:{violence:true}}]});
   return clean();
 }});
 try{
  const a=await client(rt),get=async()=>await (await rt.app(new Request('http://localhost/api/constitution'))).json();
  const pending=await (await a.post('/api/constitution/contribute',{text:'Manual review only',consent:true})).json();
  expect(pending.status).toBe('pending');
  expect(sent).toEqual([]);
  const withoutPublic=await a.post('/api/constitution/contribute',{text:'Not consented',consent:false,autoModerationConsent:true});
  expect(withoutPublic.status).toBe(400);
  expect(sent).toEqual([]);
  const good=await (await a.post('/api/constitution/contribute',{text:'cool beanscool beanscool beanscool beans',consent:true,autoModerationConsent:true})).json();
  expect(good.status).toBe('approved');
  expect((await get()).clauses.some(c=>c.id===good.clauseId)).toBe(true);
  const held=await (await a.post('/api/constitution/contribute',{text:'Safety fixture',consent:true,autoModerationConsent:true})).json();
  expect(held.status).toBe('pending');
  expect((await get()).clauses.some(c=>c.id===held.clauseId)).toBe(false);
  const comment=await (await a.post('/api/constitution/comment',{clauseId:'S-001',text:'A different view is welcome.',consent:true,autoModerationConsent:true})).json();
  expect(comment.status).toBe('approved');
  expect((await get()).clauses.find(c=>c.id==='S-001').comments.some(c=>c.id===comment.id)).toBe(true);
  expect(sent).toEqual(['cool beanscool beanscool beanscool beans','Safety fixture','A different view is welcome.']);
  const audit=await rt.db.query('SELECT decision,reason FROM constitution_auto_moderation');
  expect(audit.rows.filter(r=>r.decision==='approve')).toHaveLength(2);
  expect(audit.rows.filter(r=>r.decision==='hold')).toHaveLength(1);
 }finally{await rt.store.close()}
});
