import {AXES,cpuBatch,suggestEffects,validEffects} from './consensus-world-engine.js';
export const MODES=[
  ['objections','Address the strongest objections'],
  ['cost','Reduce implementation costs'],
  ['rights','Add individual freedoms and safeguards'],
  ['voluntary','Make participation voluntary'],
  ['fairness','Improve fairness'],
  ['clarity','Clarify ambiguous language'],
  ['risks','Find unintended consequences'],
  ['pilot','Design a smaller pilot program']
];
export const BACKYARD=[
 ['Neighborhood overcrowding','Limit the initial pilot to one additional home per eligible property'],
 ['Increased property taxes','Require a transparent assessment of tax impacts before enrollment'],
 ['Flooding and drainage','Require drainage and infrastructure capacity checks'],
 ['Loss of privacy','Establish reasonable setbacks and privacy standards'],
 ['Expensive implementation','Publish a capped pilot budget'],
 ['Government overreach','Keep participation voluntary'],
 ['Benefits mainly wealthy owners','Include affordable financing options for eligible lower-income homeowners']
];
const AXIS_CLAUSES=[
 'Publish an independent cost estimate, identify a funding source, and set capped spending before implementation.',
 'Publish eligibility and appeal criteria. Assess access barriers and targeted affordability support.',
 'Make participation voluntary, with a clear right to decline and accessible alternatives.',
 'Require data minimization and a privacy audit. Limit collection, retention, and access.',
 'Require independent safety review and enforce applicable safety standards before rollout.',
 'Require environmental review and mitigation of identified impacts before rollout.',
 'Assess impacts on jobs and small businesses. Specify worker protections and transition support.',
 'Launch a time-limited pilot program with independent evaluation and clear criteria for renewal.'
];
const MODE_AXES={cost:[0],rights:[2,3,4],voluntary:[2],fairness:[1,6],clarity:[7],risks:[4,5,6],pilot:[0,7]};
export function rankDiagnostics(bins){
 return AXES.map((axis,i)=>({axis,index:i,count:bins[12+i]||0})).sort((a,b)=>b.count-a.count||a.index-b.index);
}
export function quickCompare(prior,effects,seed,day,population=10000){
 if(!validEffects(prior)||!validEffects(effects))throw Error('Invalid assumptions');
 const count=Math.min(10000,population);
 const bins=Array.from(cpuBatch({start:0,count,effects,prior,seed,day,compare:true}));
 return {count,bins,before:bins[3]+bins[4]+bins[5],after:bins[0],toYes:bins[6]+bins[9],away:bins[4]+bins[5]};
}
export function localRevision({bill,modes,diagnostics}){
 if(typeof bill!=='string'||!bill.trim()||bill.length>12000)throw Error('Enter a draft first.');
 if(!Array.isArray(modes)||!modes.length)throw Error('Choose at least one revision mode.');
 const chosen=new Set(modes.filter(x=>MODES.some(([id])=>id===x)));
 const indices=new Set();
 if(chosen.has('objections'))for(const d of diagnostics.filter(d=>d.count>0).slice(0,3))indices.add(d.index);
 for(const id of chosen)for(const i of MODE_AXES[id]||[])indices.add(i);
 const changes=[];
 if(chosen.has('objections')&&/\bbackyard homes?\b|\bbackyard housing\b|\badditional affordable dwelling\b/i.test(bill)){
   for(const [objection,compromise] of BACKYARD)changes.push({objection,compromise});
 }
 for(const i of indices)if(AXIS_CLAUSES[i])changes.push({objection:AXES[i],compromise:AXIS_CLAUSES[i]});
 if(chosen.has('clarity'))changes.push({objection:'Ambiguity',compromise:'Define key terms, responsible authorities, eligibility, timelines, and the process for appeals.'});
 if(!changes.length)changes.push({objection:'Evidence gaps',compromise:'Document unresolved risks and request independent review before implementation.'});
 const unique=changes.filter((x,i,a)=>a.findIndex(y=>y.compromise===x.compromise)===i);
 const additions=unique.filter(x=>!bill.toLowerCase().includes(x.compromise.toLowerCase()));
 const revision=additions.length?bill.trim()+'\n\nProposed amendments (review and reconcile with existing provisions):\n'+additions.map((x,i)=>(i+1)+'. '+x.compromise.replace(/\.?$/,'.')).join('\n'):bill.trim();
 if(revision.length>12000)throw Error('Revision exceeds the draft limit. Shorten the original or edit manually.');
 return {revision,changes:unique};
}
export function proposedEffects(text){return suggestEffects(text);}
