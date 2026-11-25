import {test,expect} from 'bun:test';
import {setup,client} from './helpers.js';
import seed from '../data/catalog.json' with {type:'json'};
import {simulate,scenarioDefaults,modelFor} from '../public/law-simulator.js';
import {validateScenario} from '../public/law-scenario-spec.js';
import {linkedLawIds,CLAUSE_LAWS} from '../public/law-clause-links.js';
const spec={metric:'Comfortable transit access',lever:'Stops reached',family:9,direction:1,lag:4,effect:24,reach:65,capacity:80,years:12,assumptions:'Illustrative pilot assumptions, not a forecast.'};
const draft={title:'Shaded stops pilot',category:seed.categories[1],sharedGoal:'Make bus stops comfortable.',illustrativeLocalOption:'Test covered benches at selected stops.',risksAndSafeguards:'Review maintenance, accessibility and costs.',suggestedMeasures:['Comfortable transit access'],scenario:spec};
test('bounded generated simulator, deterministic scenarios and curated clause links',()=>{
 const law={id:'HGP-demo',...draft};
 expect(validateScenario(spec)).toEqual(spec);
 expect(()=>validateScenario({...spec,execute:'alert(1)'})).toThrow();
 expect(()=>validateScenario({...spec,family:10})).toThrow();
 expect(()=>validateScenario({...spec,effect:Infinity})).toThrow();
 expect(scenarioDefaults(law).years).toBe(12);
 expect(simulate(law).points).toHaveLength(13);
 expect(simulate(law,{reach:0}).final.scenario).toBe(100);
 expect(simulate(law)).toEqual(simulate(law));
 expect(modelFor(law).metric).toBe(spec.metric);
 expect(Object.keys(CLAUSE_LAWS)).toHaveLength(12);
 for(const [id,expected] of Object.entries(CLAUSE_LAWS))expect(linkedLawIds({id},seed.goals)).toEqual(expected);
 expect(linkedLawIds({id:'C-example',text:'Unrelated'},seed.goals)).toEqual([]);
 expect(linkedLawIds({id:'S-001'},[...seed.goals,{id:'HGP-demo',relatedClauseId:'S-001'}])).toContain('HGP-demo');
});
test('transformer generation sends only two opted-in answers; reviewed law and simulator persist and edits retain revision history',async()=>{
 let calls=0,upstream;
 const rt=await setup({env:{HELIOS_LAW_GENERATION_ENABLED:'1',OPENAI_API_KEY:'fake-test-key'},lawDraftFetch:async(url,init)=>{calls++;upstream=JSON.parse(init.body);return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(draft)}]}]})}});
 try{
 const c=await client(rt),quiz={problem:'Bus stops need shade.',change:'Pilot covered benches.',consent:true};
 const get=async path=>(await rt.app(new Request('http://localhost'+path))).json();
 expect((await get('/api/catalog')).goals).toHaveLength(100);
 expect((await c.post('/api/law-drafts/generate',{...quiz,consent:false})).status).toBe(400);
 expect(calls).toBe(0);
 const response=await c.post('/api/law-drafts/generate',quiz);
 expect(response.status).toBe(200);const generated=await response.json();
 expect(generated.source).toBe('openai');expect(generated.draft).toEqual(draft);expect(calls).toBe(1);
 expect(JSON.parse(upstream.input)).toEqual({problem:quiz.problem,change:quiz.change});expect(upstream.store).toBe(false);
 expect((await get('/api/catalog')).goals).toHaveLength(100);
 expect((await c.post('/api/law-drafts/publish',{draft,consent:false,clauseId:'S-001'})).status).toBe(400);
 expect((await c.post('/api/law-drafts/publish',{draft:{...draft,scenario:{...spec,years:500}},consent:true})).status).toBe(400);
 const key=crypto.randomUUID(),body={draft:generated.draft,consent:true,clauseId:'S-001'};
 const saved=await c.post('/api/law-drafts/publish',body,{'idempotency-key':key});expect(saved.status).toBe(201);
 const id=(await saved.json()).law.id;expect(id).toMatch(/^HGP-/);
 expect((await (await c.post('/api/law-drafts/publish',body,{'idempotency-key':key})).json()).law.id).toBe(id);
 const catalog=await get('/api/catalog');expect(catalog.goals).toHaveLength(101);
 const law=catalog.goals.find(x=>x.id===id);expect(law.scenario).toEqual(spec);expect(law.relatedClauseId).toBe('S-001');
 expect((await get('/api/laws/'+id)).law.scenario).toEqual(spec);
 const {scenario:ignored,...fields}=draft;
 const edit=await c.post('/api/laws/'+id+'/amendments',{baseVersionId:law.versionId,reason:'Clarify design.',proposal:{...fields,title:'Revised shaded stops pilot'}});
 expect(edit.status).toBe(201);const pending=await edit.json();expect(pending.law.title).toBe(draft.title);expect(pending.amendments[0].proposed.scenario).toEqual(spec);
 expect((await c.post('/api/laws/'+id+'/amendments/'+pending.amendments[0].id+'/accept',{},{authorization:'Bearer test-admin'})).status).toBe(200);
 expect((await get('/api/laws/'+id)).law.version).toBe(2);expect((await get('/api/laws/'+id)).law.scenario).toEqual(spec);
 }finally{await rt.store.close()}
});
test('disabled transformer is explicit and does not call an external API',async()=>{
 const rt=await setup({env:{},lawDraftFetch:()=>{throw Error('Unexpected external call')}});
 try{const c=await client(rt);expect((await c.post('/api/law-drafts/generate',{problem:'Need shade',change:'Add benches',consent:true})).status).toBe(503)}finally{await rt.store.close()}
});
