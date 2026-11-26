import {test,expect} from 'bun:test';
import seed from '../data/catalog.json';
import {canonicalCatalog,originFor} from '../public/consensus-world-catalog.js';
import {cpuBatch,CPU_BATCH,BINS,assertBatch} from '../public/consensus-world-engine.js';
import {RESEARCH_KEY,SEED,emptyState,assumptions,exactOrigin,computeRound,validResearchRound,putRound,loadResearch,latestMatching,findResearchRound,rankedObjections,advisoryCounts} from '../public/law-research-model.js';
const laws=canonicalCatalog(seed.goals),law=laws.find(l=>l.id==='HGA-031');
const memory=()=>{const map=new Map();return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)}};
test('canonical baselines retain original law source and agree with Consensus World paged engine',async()=>{
 const r=await computeRound({law,population:100000,day:0,mode:'rules',id:'research-test',now:()=>0,wall:()=>1});
 expect(validResearchRound(r)).toBe(true);expect(exactOrigin(r.origin,originFor(law))).toBe(true);expect(r.done).toBe(100000);
 const bins=Array(BINS).fill(0);
 for(let start=0;start<r.population;start+=CPU_BATCH){
  const count=Math.min(CPU_BATCH,r.population-start),page=cpuBatch({start,count,effects:r.effects,prior:r.prior,seed:SEED,day:r.day,compare:false});
  page.forEach((n,i)=>bins[i]+=n);
 }
 expect(r.bins).toEqual(bins);assertBatch(r.bins,r.done,false);
 expect(rankedObjections(r).reduce((sum,o)=>sum+o.count,0)).toBe(r.bins[1]+r.bins[2]);
 const state=putRound(emptyState(),r),s=memory();s.setItem(RESEARCH_KEY,JSON.stringify(state));
 expect(findResearchRound(s,r.id)).toEqual(r);
 expect(latestMatching(loadResearch(s),law,{population:100000,day:0,mode:'rules'})).toEqual(r);
 expect(latestMatching(state,{...law,goal:'Changed source text'},{population:100000,day:0,mode:'rules'})).toBeNull();
 expect(latestMatching(state,law,{population:100000,day:1,mode:'rules'})).toBeNull();
 expect(validResearchRound({...r,done:r.done-1})).toBe(false);
});
test('rule hypotheses use only mechanism text, neutral never assumes benefit',()=>{
 const l={...law,implementation:'A pilot program.',goal:'Capped spending.',safeguards:'Fair wages and accessible facilities.'};
 const a=assumptions(l,'rules');expect(a.effects[7]).toBe(1);expect(a.effects[0]).toBe(0);expect(a.effects[1]).toBe(0);expect(a.effects[6]).toBe(0);
 expect(assumptions(l,'neutral').effects).toEqual(Array(8).fill(0));
});
test('shared advisory counts remain separate and invalid data is omitted',()=>{
 const response={storage:'supabase-postgres',records:[{law:{id:law.id,versionId:'rev-1'},votes:{support:10,oppose:2,unsure:1}}]};
 expect(advisoryCounts(response)[law.id]).toEqual({support:10,oppose:2,unsure:1,versionId:'rev-1'});
 expect(advisoryCounts({...response,storage:'pglite'})).toEqual({});
 expect(advisoryCounts({...response,records:[{law:{id:law.id},votes:{support:-1,oppose:2,unsure:1}}]})).toEqual({});
});
