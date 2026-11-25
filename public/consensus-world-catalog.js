// Load only the canonical 100 editorial goals. Do not import advisory votes,
// user identifiers, account data, or other database rows into the simulation.
import {cannabisDraft} from './cannabis-budget.js';
export const CATALOG_IDS=Array.from({length:100},(_,i)=>'HGA-'+String(i+1).padStart(3,'0'));
const canonical=new Set(CATALOG_IDS);
const string=v=>typeof v==='string'?v.trim():'';
function normalize(law,source){
 if(!law||!canonical.has(law.id)&&law.id!==cannabisDraft.id)throw Error('Unknown law ID');
 const version=Number(law.version??law.initialVersion??1);
 const item={id:law.id,title:string(law.title),category:string(law.category),goal:string(law.sharedGoal),implementation:string(law.illustrativeLocalOption),safeguards:string(law.risksAndSafeguards),measures:Array.isArray(law.suggestedMeasures)?law.suggestedMeasures.map(string).filter(Boolean):[],jurisdiction:string(law.jurisdiction),sourceProposalId:string(law.sourceProposalId),sourceProposalTitle:string(law.sourceProposalTitle),version,versionId:string(law.versionId)||null,source};
 if(!item.title||!item.goal||!item.implementation||!item.safeguards||!Number.isSafeInteger(version)||version<1||(source==='shared'&&!item.versionId))throw Error('Incomplete law '+law.id);
 if(formatBill(item).length>12000)throw Error('Law exceeds the draft editor limit: '+law.id);
 return item;
}
export function canonicalCatalog(goals,source='bundled'){
 if(!Array.isArray(goals)||goals.length!==100||!['bundled','shared'].includes(source))throw Error('Expected 100 canonical laws');
 const map=new Map();
 for(const law of goals){if(!canonical.has(law?.id)||map.has(law.id))throw Error('Invalid or duplicate canonical ID');map.set(law.id,normalize(law,source));}
 return CATALOG_IDS.map(id=>map.get(id));
}
export function sharedCatalog(response){
 if(response?.storage!=='supabase-postgres'||!Array.isArray(response.records))throw Error('Shared law board unavailable');
 return canonicalCatalog(response.records.map(row=>row.law),'shared');
}
export function featuredDraft(){return normalize(cannabisDraft,'featured');}
export function formatBill(law){
 return [law.id+' · '+law.title,law.sourceProposalId?'Source proposal: '+law.sourceProposalId+(law.sourceProposalTitle?' · '+law.sourceProposalTitle:''):'', 'Goal:\n'+law.goal,'Proposed implementation:\n'+law.implementation,'Risks and safeguards:\n'+law.safeguards,law.measures.length?'Suggested measures:\n'+law.measures.map(m=>'- '+m).join('\n'):'',law.jurisdiction?'Jurisdiction:\n'+law.jurisdiction:''].filter(Boolean).join('\n\n');
}
export function originFor(law){return {lawId:law.id,title:law.title,version:law.version,versionId:law.versionId,source:law.source,originalBill:formatBill(law)};}
export function validOrigin(o){return o==null||!!(typeof o==='object'&&(canonical.has(o.lawId)||o.lawId===cannabisDraft.id)&&typeof o.title==='string'&&Number.isSafeInteger(o.version)&&o.version>0&&(o.versionId===null||typeof o.versionId==='string')&&['bundled','shared','featured'].includes(o.source)&&(o.source!=='shared'||!!o.versionId)&&typeof o.originalBill==='string'&&o.originalBill.length<=12000);}
export function originLabel(o){
 if(!o)return 'Custom / legacy draft';
 return o.lawId+' · '+(o.source==='featured'?'unpublished featured draft':o.source==='shared'?'shared revision '+o.version:'bundled editorial revision '+o.version);
}
export function sameLaw(a,b){return (a?.lawId||null)===(b?.lawId||null);}
export function matchesLaw(law,query){return [law.id,law.title,law.sourceProposalId,law.sourceProposalTitle,law.category,law.goal].some(v=>v.toLowerCase().includes(query.trim().toLowerCase()));}
