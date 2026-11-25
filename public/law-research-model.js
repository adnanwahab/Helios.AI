import {AXES,BINS,CPU_BATCH,GPU_BATCH,VERSION,assertBatch,cpuBatch,validEffects,suggestEffects} from './consensus-world-engine.js';
import {CATALOG_IDS,originFor,validOrigin} from './consensus-world-catalog.js';
export const RESEARCH_KEY='helios.law-research.v1';
export const CONSENSUS_KEY='helios.consensus-world.v1';
export const SEED=20261125;
export const POPULATIONS=[100000,1000000,10000000];
export const MODES=['rules','neutral','manual'];
const canonical=new Set(CATALOG_IDS);
export const emptyState=()=>({version:1,records:{},notes:{}});
export function exactOrigin(a,b){
 return !!a&&!!b&&a.lawId===b.lawId&&a.version===b.version&&a.versionId===b.versionId&&a.source===b.source&&a.originalBill===b.originalBill;
}
export function assumptions(law,mode='rules'){
 if(mode==='neutral')return {effects:Array(8).fill(0),reasons:Array(8).fill('Neutral control / not assessed')};
 if(mode!=='rules')throw Error('Unknown assumption mode');
 // Do not infer benefits from aspirations, risk descriptions or promised safeguards.
 const suggested=suggestEffects(law.implementation);
 return {effects:suggested.effects,reasons:suggested.reasons.map((r,i)=>suggested.effects[i]?'Unverified mechanism-language hypothesis: '+r:r)};
}
export function validResearchRound(r){
 if(!r||typeof r.id!=='string'||!r.id.startsWith('research-')||!r.origin||!canonical.has(r.origin.lawId)||!validOrigin(r.origin)||r.bill!==r.origin.originalBill||!validEffects(r.effects)||!Array.isArray(r.reasons)||r.reasons.length!==8||!r.reasons.every(x=>typeof x==='string')||!POPULATIONS.includes(r.population)||!Number.isInteger(r.day)||r.day<0||r.day>1000000||r.seed!==SEED||r.model!==VERSION||!MODES.includes(r.assumptionMode)||r.done!==r.population||r.compare!==false||!validEffects(r.prior)||!Array.isArray(r.bins)||r.bins.length!==BINS||!Number.isFinite(r.finishedAt)||!Number.isFinite(r.elapsedMs)||r.elapsedMs<0||!['CPU','WebGPU','Mixed'].includes(r.backend))return false;
 try{assertBatch(r.bins,r.population,false);return true}catch{return false}
}
export function loadResearch(storage){
 try{
  const data=JSON.parse(storage.getItem(RESEARCH_KEY)||'null');
  if(data?.version!==1)return emptyState();
  const state=emptyState();
  for(const id of CATALOG_IDS){
   const records=data.records?.[id];if(Array.isArray(records))state.records[id]=records.filter(r=>validResearchRound(r)&&r.origin.lawId===id).slice(0,5);
   const note=data.notes?.[id];if(note&&typeof note==='object')state.notes[id]={question:String(note.question??'').slice(0,4000),evidence:String(note.evidence??'').slice(0,4000),amendment:String(note.amendment??'').slice(0,4000)};
  }return state;
 }catch{return emptyState()}
}
export function putRound(state,round){
 if(!validResearchRound(round))throw Error('Invalid completed research round');
 const id=round.origin.lawId;state.records[id]=[round,...(state.records[id]||[]).filter(r=>r.id!==round.id)].slice(0,5);return state;
}
export function findResearchRound(storage,id){
 const state=loadResearch(storage);return Object.values(state.records).flat().find(r=>r.id===id)||null;
}
export function latestMatching(state,law,{population,day,mode}){
 const origin=originFor(law);
 return (state.records[law.id]||[]).find(r=>exactOrigin(r.origin,origin)&&r.population===population&&r.day===day&&r.assumptionMode===mode)||null;
}
export function rankedObjections(round){
 return AXES.map((name,i)=>({name,count:round.bins[12+i],axis:i})).sort((a,b)=>b.count-a.count||a.axis-b.axis);
}
export function readConsensusHistory(storage,lawId){
 try{
  const d=JSON.parse(storage.getItem(CONSENSUS_KEY)||'null');if(d?.version!==VERSION||!Array.isArray(d.history))return [];
  return d.history.filter(r=>r?.origin?.lawId===lawId&&validOrigin(r.origin)&&typeof r.bill==='string'&&r.bill.length<=12000&&validEffects(r.effects)&&Number.isSafeInteger(r.population)&&r.population>0&&r.population<=8e9&&r.done===r.population&&r.seed===SEED&&Number.isInteger(r.day)&&Array.isArray(r.bins)&&typeof r.compare==='boolean'&&(()=>{try{assertBatch(r.bins,r.done,r.compare);return true}catch{return false}})()).slice(0,120);
 }catch{return []}
}
export async function computeRound({law,population,day,mode,manual,gpu=null,onProgress=()=>{},yieldControl=()=>Promise.resolve(),id,now=()=>performance.now(),wall=()=>Date.now()}){
 if(!canonical.has(law.id)||!POPULATIONS.includes(population)||!Number.isInteger(day)||day<0||day>1000000||!MODES.includes(mode)||typeof id!=='string'||!id.startsWith('research-'))throw Error('Invalid research request');
 const origin=originFor(law),a=mode==='manual'?manual:assumptions(law,mode);
 if(!validOrigin(origin)||!validEffects(a?.effects)||!Array.isArray(a.reasons)||a.reasons.length!==8||!a.reasons.every(x=>typeof x==='string'))throw Error('Invalid research assumptions');
 const effects=[...a.effects],reasons=[...a.reasons],prior=Array(8).fill(0),bins=Array(BINS).fill(0);let done=0,elapsedMs=0,gpuUsed=false,cpuUsed=false,useGPU=!!gpu;
 while(done<population){
  const count=Math.min(population-done,useGPU?GPU_BATCH:CPU_BATCH),req={start:done,count,effects,prior,compare:false,seed:SEED,day};
  let page;const start=now();
  try{page=useGPU?await gpu.batch(req):cpuBatch(req);assertBatch(page,count,false)}
  catch(err){if(useGPU){useGPU=false;continue;}throw err}
  elapsedMs+=Math.max(0,now()-start);if(useGPU)gpuUsed=true;else cpuUsed=true;
  for(let i=0;i<BINS;i++)bins[i]+=page[i];done+=count;assertBatch(bins,done,false);onProgress(done,population);await yieldControl();
 }
 const r={id,origin,bill:origin.originalBill,effects,reasons,prior,compare:false,population,day,seed:SEED,model:VERSION,assumptionMode:mode,done,bins,elapsedMs,finishedAt:wall(),backend:gpuUsed&&cpuUsed?'Mixed':gpuUsed?'WebGPU':'CPU',baseline:'',dirty:false};
 if(!validResearchRound(r))throw Error('Completed round did not reconcile');return r;
}
export function advisoryCounts(response){
 const result={};if(response?.storage!=='supabase-postgres'||!Array.isArray(response.records))return result;
 for(const row of response.records){const id=row?.law?.id,v=row?.votes;if(canonical.has(id)&&v&&['support','oppose','unsure'].every(k=>Number.isSafeInteger(v[k])&&v[k]>=0))result[id]={support:v.support,oppose:v.oppose,unsure:v.unsure,versionId:row.law.versionId};}
 return result;
}
