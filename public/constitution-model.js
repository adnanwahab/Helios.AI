// Deterministic illustrative constitution. No generated identities are real people.
export const CORPUS_VERSION='synthetic-constitution-v1';
export const SYNTHETIC_PARTICIPANTS=256;
const statements=[
 ['S-001','Public transit','Pilot shade and accessible seating at high-exposure public transit stops.'],
 ['S-002','Housing','Allow more homes near frequent public transit, with displacement safeguards.'],
 ['S-003','Public spaces','Create accessible public gathering spaces, including libraries and community rooms.'],
 ['S-004','Education','Provide affordable access to lifelong learning and practical skills training.'],
 ['S-005','Transparency','Publish understandable public budgets, procurement decisions and outcome measures.'],
 ['S-006','Privacy','Make civic participation voluntary and protect private journal entries from public disclosure.'],
 ['S-007','Public health','Improve access to preventive health services in underserved communities.'],
 ['S-008','Science','Pilot shared science and fabrication labs with equitable access and safety training.'],
 ['S-009','Environment','Prioritize flood resilience and maintain public drainage infrastructure.'],
 ['S-010','Accountability','Publish reasons for accepting, revising or declining public proposals.'],
 ['S-011','Public transit','Evaluate maintenance and accessibility costs before expanding transit shelter pilots.'],
 ['S-012','Housing','Retain locally tailored housing rules where evidence supports their public benefit.']
];
export function normalizeClause(text){return String(text).normalize('NFC').trim().replace(/\s+/gu,' ').toLowerCase()}
export function synthesizeCorpus(journals){
 const groups=new Map();
 for(const journal of journals){
   const seen=new Set();
   for(const entry of journal.clauses){
     const key=normalizeClause(entry.text);
     if(!key||seen.has(key))continue;
     seen.add(key);
     let row=groups.get(key);
     if(!row){row={id:entry.id,topic:entry.topic,text:entry.canonical||entry.text,mentions:0,support:0,oppose:0,unsure:0,participants:new Set()};groups.set(key,row)}
     if(row.participants.has(journal.id))continue;
     row.participants.add(journal.id);row.mentions++;
     if(['support','oppose','unsure'].includes(entry.position))row[entry.position]++;
   }
 }
 return [...groups.values()].map(({participants,...row})=>row).sort((a,b)=>a.id.localeCompare(b.id));
}
export function syntheticJournals(){
 let state=173;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296};
 return Array.from({length:SYNTHETIC_PARTICIPANTS},(_,index)=>{
   const chosen=new Set(),clauses=[];const length=3+Math.floor(random()*3);
   while(chosen.size<length){const n=Math.floor(random()*statements.length);if(chosen.has(n))continue;chosen.add(n);
     const [id,topic,canonical]=statements[n];const roll=random();
     const position=roll<.62?'support':roll<.82?'oppose':'unsure';
     const text=index%3===0?'  '+canonical.toUpperCase().replace(/ /g,'  ')+'  ':canonical;
     const entry={id,topic,text,canonical,position};clauses.push(entry);
     if(index%7===0)clauses.push({...entry,text:canonical});
   }
   return {id:'synthetic-'+index,clauses};
 });
}
export const syntheticRows=synthesizeCorpus(syntheticJournals());
export const syntheticStats=Object.freeze({participants:SYNTHETIC_PARTICIPANTS,rawMentions:syntheticJournals().reduce((n,j)=>n+j.clauses.length,0),uniqueMentions:syntheticRows.reduce((n,r)=>n+r.mentions,0),clauses:syntheticRows.length,version:CORPUS_VERSION});
export function sampleBoard(){return {synthetic:syntheticStats,clauses:syntheticRows.map(r=>({id:r.id,topic:r.topic,text:r.text,source:'synthetic',status:'approved',synthetic:{mentions:r.mentions,support:r.support,oppose:r.oppose,unsure:r.unsure},live:{support:0,oppose:0,unsure:0,contributors:0,commentCount:0},myVote:null,comments:[]})),pending:[]}}
