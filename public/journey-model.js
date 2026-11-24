// Local editorial drafting and scenario handoffs. Never publishes a law.
export const norm=s=>String(s).normalize('NFC').trim().replace(/\s+/gu,' ').toLowerCase();
const stop=new Set('the and for from that this with into should every people public have they their can are will not was our all be'.split(' '));
const words=s=>new Set(norm(s).split(/[^\p{L}\p{N}]+/u).filter(w=>w.length>2&&!stop.has(w)));
export function mergeFragments(a,b){
 const seen=new Map();let mentions=0;
 for(const [source,text] of [['Resident',a],['City engineer',b]])for(const raw of String(text).split('\n')){
  const line=raw.trim(),key=norm(line);if(!key)continue;mentions++;
  if(!seen.has(key))seen.set(key,{text:line,sources:[]});const row=seen.get(key);if(!row.sources.includes(source))row.sources.push(source);
 }
 return {text:[...seen.values()].map(x=>x.text).join('\n').slice(0,12000),unique:seen.size,duplicates:mentions-seen.size};
}
const cityPlans={
 'HGA-011':{kind:'housing',label:'Affordable housing capacity',rates:{housing:120,transit:0,water:0}},
 'HGA-012':{kind:'housing',label:'Accessory housing capacity',rates:{housing:60,transit:0,water:0}},
 'HGA-019':{kind:'transit',label:'Connected neighborhood access',rates:{housing:0,transit:4,water:0}},
 'HGA-020':{kind:'water',label:'Local hazard resilience (drainage example)',rates:{housing:0,transit:0,water:6}},
 'HGA-093':{kind:'transit',label:'Heat-resilient accessible connections (illustrative)',rates:{housing:0,transit:3,water:0}},
 'HGA-095':{kind:'transit',label:'Reliable transport connections',rates:{housing:0,transit:4,water:0}}
};
export function cityPlanFor(id){const p=cityPlans[id];return p?{...p,rates:{...p.rates}}:null}
export function draftCatalog(goals,constitution){
 if(!Array.isArray(goals)||goals.length!==100||new Set(goals.map(g=>g.id)).size!==100)throw Error('Expected the original 100 distinct editorial goals.');
 const clauses=String(constitution).split('\n').map(s=>s.trim()).filter(Boolean);
 if(!clauses.length)throw Error('Add at least one constitutional clause.');
 return goals.map(g=>{
   const terms=words([g.title,g.sharedGoal,g.illustrativeLocalOption].join(' '));
   const matches=clauses.map((text,i)=>({text,line:i+1,score:[...words(text)].filter(w=>terms.has(w)).length})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.line-b.line);
   return {g,match:matches[0]?.text||null,score:matches[0]?.score||0,matches:matches.slice(0,3),city:cityPlanFor(g.id),implementation:{action:g.illustrativeLocalOption,safeguards:g.risksAndSafeguards,metrics:g.suggestedMeasures,owner:'Unassigned — confirm jurisdiction and responsible institution',cost:'Uncosted — review financing and opportunity costs',review:'Proposed pilot and public outcome review; no legal approval assumed'}};
 }).sort((a,b)=>b.score-a.score||a.g.id.localeCompare(b.g.id));
}
export const cityDefaults=Object.freeze({year:5,housing:80,transit:0,water:2});
export function cityTotals(input){
 const n=(k,max)=>Math.max(0,Math.min(max,Math.round(Number(input[k])||0)));
 const year=n('year',10),housing=n('housing',200),transit=n('transit',8),water=n('water',10);
 return {year,housing:year*housing,transit:year*transit,water:year*water};
}
export function stageFrom(path,search=''){
 const q=new URLSearchParams(search).get('stage'),stages=['story','demo','visualize','chat','grid'];
 if(stages.includes(q))return q;
 const name=String(path).split('/').filter(Boolean).at(-1)?.replace(/\.html$/,'');
 return name==='city'?'visualize':stages.includes(name)?name:'grid';
}
