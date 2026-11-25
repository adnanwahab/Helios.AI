import {test,expect} from 'bun:test';
import {normalizeClause,synthesizeCorpus,syntheticStats,syntheticRows,syntheticJournals,sampleBoard} from '../public/constitution-model.js';
import {setup,client} from './helpers.js';

test('synthetic constitution deduplicates per participant, preserves distinctions and separates stances',()=>{
 const fixture=[{id:'a',clauses:[{id:'S-001',topic:'test',text:'Keep transit free.',position:'support'},{id:'S-001',topic:'test',text:' KEEP   TRANSIT FREE. ',position:'support'}]},{id:'b',clauses:[{id:'S-001',topic:'test',text:'Keep transit free.',position:'oppose'},{id:'S-002',topic:'test',text:'Do not keep transit free.',position:'support'}]}];
 const groups=synthesizeCorpus(fixture);
 expect(groups).toHaveLength(2);
 expect(groups[0].mentions).toBe(2);
 expect(groups[0].support).toBe(1);
 expect(groups[0].oppose).toBe(1);
 expect(groups[1].mentions).toBe(1);
 expect(normalizeClause(' Keep  transit FREE. ')).toBe('keep transit free.');
 expect(syntheticJournals()).toEqual(syntheticJournals());
 expect(syntheticStats.participants).toBe(256);
 expect(syntheticStats.rawMentions).toBeGreaterThan(syntheticStats.uniqueMentions);
 expect(syntheticStats.clauses).toBe(12);
 for(const row of syntheticRows)expect(row.support+row.oppose+row.unsure).toBe(row.mentions);
 expect(sampleBoard().clauses.every(c=>c.live.support===0)).toBe(true);
});
test('shared constitution aggregates unique session votes and contributions; text needs consent and moderation',async()=>{
 const rt=await setup();
 try{
 const a=await client(rt),b=await client(rt);
 const get=async(c)=>await (await rt.app(new Request('http://localhost/api/constitution',{headers:c?{cookie:c.cookie}:{}}))).json();
 const row=(board,id='S-001')=>board.clauses.find(x=>x.id===id);
 const initial=row(await get());
 expect(initial.synthetic.mentions).toBeGreaterThan(0);expect(initial.live.support).toBe(0);
 expect((await a.post('/api/constitution/vote',{clauseId:'S-001',position:'support'},{'x-csrf-token':'wrong'})).status).toBe(403);
 expect((await a.post('/api/constitution/vote',{clauseId:'S-001',position:'support'})).status).toBe(201);
 await a.post('/api/constitution/vote',{clauseId:'S-001',position:'support'});
 await b.post('/api/constitution/vote',{clauseId:'S-001',position:'oppose'});
 expect(row(await get()).live).toMatchObject({support:1,oppose:1,unsure:0});
 expect(row(await get(a)).myVote).toBe('support');expect(row(await get()).myVote).toBeNull();
 await a.post('/api/constitution/vote',{clauseId:'S-001',position:'unsure'});
 expect(row(await get()).live).toMatchObject({support:0,oppose:1,unsure:1});
 await b.post('/api/constitution/vote',{clauseId:'S-001',position:null});
 expect(row(await get()).live.oppose).toBe(0);
 expect(row(await get()).synthetic).toEqual(initial.synthetic);
 expect((await a.post('/api/constitution/contribute',{text:initial.text,consent:false})).status).toBe(400);
 const duplicate=await (await a.post('/api/constitution/contribute',{text:'  '+initial.text.toUpperCase()+'  ',consent:true})).json();
 expect(duplicate.clauseId).toBe('S-001');
 await a.post('/api/constitution/contribute',{text:initial.text,consent:true});
 expect(row(await get()).live.contributors).toBe(1);
 const fresh=await (await a.post('/api/constitution/contribute',{text:'Provide a voluntary, accessible public repair workshop.',consent:true})).json();
 expect(fresh.status).toBe('pending');
 expect(row(await get(),fresh.clauseId)).toBeUndefined();
 expect((await get(a)).pending[0].id).toBe(fresh.clauseId);
 expect((await a.post('/api/constitution/vote',{clauseId:fresh.clauseId,position:'support'})).status).toBe(404);
 const note=await (await a.post('/api/constitution/comment',{clauseId:'S-001',text:'Consult people with mobility needs.',consent:true})).json();
 expect(note.status).toBe('pending');expect(row(await get()).comments).toEqual([]);
 expect(row(await get(a)).comments[0].status).toBe('pending');
 expect((await a.post('/api/constitution/moderate',{kind:'comment',id:note.id,decision:'approved'})).status).toBe(403);
 const admin={authorization:'Bearer test-admin'};
 expect((await rt.app(new Request('http://localhost/api/constitution/moderation'))).status).toBe(403);
 const queue=await (await rt.app(new Request('http://localhost/api/constitution/moderation',{headers:admin}))).json();
 expect(queue.comments[0].id).toBe(note.id);
 expect((await a.post('/api/constitution/moderate',{kind:'comment',id:note.id,decision:'approved'},admin)).status).toBe(201);
 expect(row(await get()).comments[0].text).toBe('Consult people with mobility needs.');
 expect(row(await get()).live.commentCount).toBe(1);
 expect((await a.post('/api/constitution/moderate',{kind:'clause',id:fresh.clauseId,decision:'approved'},admin)).status).toBe(201);
 expect(row(await get(),fresh.clauseId).source).toBe('community');
 expect(JSON.stringify(await get())).not.toContain(a.session.csrfToken);
 }finally{await rt.store.close()}
});

test('an approved clause beyond the first 200 restores from a public ID, never a pending clause',async()=>{
 const rt=await setup();
 try{
  const id=n=>'C-'+String(n).padStart(64,'0');
  await rt.db.query("INSERT INTO constitution_clauses(id,text,author,status,created_at) SELECT 'C-'||lpad(n::text,64,'0'),'Public clause '||n,'test','approved','2026-01-01T00:00:00Z' FROM generate_series(1,201) AS n");
  await rt.db.query("INSERT INTO constitution_clauses(id,text,author,status,created_at) VALUES($1,'Pending test','test','pending','2026-01-01T00:00:00Z')",[id(202)]);
  const get=async path=>await rt.app(new Request('http://localhost'+path));
  const initial=await (await get('/api/constitution')).json();
  expect(initial.clauses.some(x=>x.id===id(201))).toBe(false);
  const focus=await (await get('/api/constitution?clause='+id(201))).json();
  expect(focus.clauses.some(x=>x.id===id(201))).toBe(true);
  expect(focus.clauses.filter(x=>x.source==='community')).toHaveLength(200);
  const pending=await (await get('/api/constitution?clause='+id(202))).json();
  expect(pending.clauses.some(x=>x.id===id(202))).toBe(false);
  expect((await get('/api/constitution?clause=private%20text')).status).toBe(400);
 }finally{await rt.store.close()}
});
