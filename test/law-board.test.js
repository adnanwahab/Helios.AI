import {test,expect} from 'bun:test';
import seed from '../data/catalog.json' with {type:'json'};
import {modelFor,simulate} from '../public/law-simulator.js';
import {client,setup} from './helpers.js';
test('all 100 original laws have a distinct intervention lever and reproducible interactive scenario',()=>{
 expect(seed.goals).toHaveLength(100);
 expect(new Set(seed.goals.map(g=>modelFor(g).lever)).size).toBe(100);
 for(const law of seed.goals){
  const a=simulate(law),b=simulate(law),zero=simulate(law,{reach:0}),harm=simulate(law,{effect:-20}),more=simulate(law,{reach:100});
  expect(a).toEqual(b);expect(a.spec.metric).toBe(law.suggestedMeasures[0]);expect(a.points).toHaveLength(11);
  expect(a.points[0].scenario).toBe(100);expect(zero.points.every(p=>p.scenario===100)).toBe(true);
  expect(a.final.scenario).not.toBe(100);expect(Math.sign(a.final.scenario-100)).toBe(a.spec.direction);
  expect(Math.sign(harm.final.scenario-100)).toBe(-a.spec.direction);
  expect(Math.abs(more.final.scenario-100)).toBeGreaterThan(Math.abs(a.final.scenario-100));
  for(const p of a.points){expect(Number.isFinite(p.scenario)).toBe(true);expect(p.low).toBeLessThanOrEqual(p.scenario);expect(p.high).toBeGreaterThanOrEqual(p.scenario)}
 }
});
test('original law board tracks one vote per session per revision and durable proposed updates',async()=>{
 const rt=await setup();
 try{
 const a=await client(rt),b=await client(rt);
 const get=async(path,c)=>await (await rt.app(new Request('http://localhost'+path,{headers:c?{cookie:c.cookie}:{}}))).json();
 const board=await get('/api/law-board');expect(board.records).toHaveLength(100);expect(board.writable).toBe(true);
 const id='HGA-011',path='/api/law-board/'+id,row=x=>x.records.find(r=>r.law.id===id);
 const law=row(board).law,versionId=law.versionId;
 expect(row(board).votes).toEqual({support:0,oppose:0,unsure:0});
 expect((await a.post(path+'/vote',{versionId,position:'support'},{'x-csrf-token':'bad'})).status).toBe(403);
 expect((await a.post(path+'/vote',{versionId,position:'support'})).status).toBe(201);
 await a.post(path+'/vote',{versionId,position:'support'});
 await b.post(path+'/vote',{versionId,position:'oppose'});
 expect(row(await get('/api/law-board',a)).myVote).toBe('support');
 expect(row(await get('/api/law-board')).myVote).toBeNull();
 expect(row(await get('/api/law-board')).votes).toEqual({support:1,oppose:1,unsure:0});
 await a.post(path+'/vote',{versionId,position:'unsure'});
 expect(row(await get('/api/law-board')).votes).toEqual({support:0,oppose:1,unsure:1});
 const update={versionId,goal:'Make more homes available through a reviewed local pilot.',implementation:law.illustrativeLocalOption,safeguards:law.risksAndSafeguards,reason:'Clarify the proposed approach.',consent:true};
 expect((await a.post(path+'/update',{...update,consent:false})).status).toBe(400);
 const response=await a.post(path+'/update',update);expect(response.status).toBe(201);
 const result=await response.json();expect(result.law.versionId).toBe(versionId);expect(result.amendments[0].status).toBe('proposed');
 expect(row(await get('/api/law-board')).updates).toBe(1);
 const aid=result.amendments[0].id;
 expect((await a.post('/api/laws/'+id+'/amendments/'+aid+'/accept',{})).status).toBe(403);
 expect((await a.post('/api/laws/'+id+'/amendments/'+aid+'/accept',{},{authorization:'Bearer test-admin'})).status).toBe(200);
 const next=row(await get('/api/law-board'));expect(next.law.version).toBe(2);expect(next.votes).toEqual({support:0,oppose:0,unsure:0});
 expect((await a.post(path+'/vote',{versionId,position:'support'})).status).toBe(409);
 const history=await get(path);expect(history.versions[0].votes).toEqual({support:0,oppose:1,unsure:1});
 expect(history.versions[1].votes).toEqual({support:0,oppose:0,unsure:0});
 expect(history.law.sourceProposalId).toBe('HFL-011');
 }finally{await rt.store.close()}
});
test('deployed Fly PGlite law board is read-only rather than a separate voting database',async()=>{
 const rt=await setup({env:{FLY_APP_NAME:'helios-ai-laws'}});
 try{
 const a=await client(rt);
 const board=await (await rt.app(new Request('http://localhost/api/law-board'))).json();
 expect(board.writable).toBe(false);
 expect((await a.post('/api/law-board/HGA-001/vote',{versionId:board.records[0].law.versionId,position:'support'})).status).toBe(503);
 }finally{await rt.store.close()}
});
