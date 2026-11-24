import {modelFor,simulate,defaults} from './law-simulator.js';
const $=id=>document.getElementById(id),el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n};
const isStatic=document.querySelector('meta[name="helios-mode"]').content==='static';
const fmt=x=>Number(x).toLocaleString(undefined,{maximumFractionDigits:1});
let seed=[],records=new Map(),selected='HGA-001',connected=false,connecting=false,writing=false,loadingDetail=0,csrf=null,lastWrite=null,history=null;
const scenario=new Map(),drafts=new Map();
function status(message,error=false){$('law-board-status').textContent=message;$('law-board-status').classList.toggle('error',error)}
function setDetailStatus(message,error=false){$('law-detail-status').textContent=message;$('law-detail-status').classList.toggle('error',error)}
function current(){return records.get(selected)}
function currentLaw(){return current()?.law}
function assumptions(){if(!scenario.has(selected)){const law=currentLaw();scenario.set(selected,{...defaults,lag:law?modelFor(law).lag:2})}return scenario.get(selected)}
const svgNS='http://www.w3.org/2000/svg';
function svg(tag,attrs={}){const n=document.createElementNS(svgNS,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));return n}
function svgText(x,y,t,attrs={}){const node=svg('text',{x,y,fill:'#afc3b9','font-size':11,...attrs});node.textContent=t;return node}
function spark(law){
 const model=simulate(law),node=svg('svg',{viewBox:'0 0 70 24','aria-hidden':'true',class:'law-spark'});
 const values=model.points.map(p=>p.scenario),min=Math.min(...values)-1,max=Math.max(...values)+1;
 const path=values.map((v,i)=>(i?'L':'M')+(2+i*66/(values.length-1))+','+(22-(v-min)*20/(max-min))).join(' ');
 node.append(svg('path',{d:path,stroke:'#91c7a4',fill:'none','stroke-width':1.7}));return node
}
function drawCatalog(){
 const query=$('law-search').value.trim().toLowerCase(),cat=$('law-category').value,root=$('law-tiles');root.replaceChildren();
 for(const row of records.values()){
  const law=row.law;if(cat&&law.category!==cat||query&&![law.id,law.title,law.category,law.sourceProposalTitle,law.sharedGoal].some(s=>String(s||'').toLowerCase().includes(query)))continue;
  const b=el('button',undefined,'law-tile');b.type='button';b.dataset.law=law.id;b.setAttribute('aria-pressed',String(law.id===selected));b.title=law.title;
  b.append(el('span',law.id.slice(4),'law-tile-number'),el('span',law.title,'law-tile-title'),spark(law));
  const total=row.votes?row.votes.support+row.votes.oppose+row.votes.unsure:null;
  b.append(el('span',total===null?'Votes not loaded':fmt(total)+' advisory votes','law-tile-votes'));
  b.addEventListener('click',()=>selectLaw(law.id));root.append(b);
 }
 $('law-results').textContent=root.childElementCount+' of '+records.size+' proposals';
 if(!root.childElementCount)root.append(el('p','No matching proposals.','hint'));
}
function drawChart(){
 const law=currentLaw();if(!law)return;
 const model=simulate(law,assumptions()),p=model.points,W=600,H=220,L=46,R=16,T=18,B=32;
 const values=p.flatMap(v=>[v.baseline,v.low,v.high,v.scenario]),min=Math.min(...values)*.96,max=Math.max(...values)*1.04;
 const x=year=>L+year*(W-L-R)/model.assumptions.years,y=value=>T+(max-value)*(H-T-B)/(max-min||1);
 const root=$('law-chart');root.replaceChildren();root.setAttribute('viewBox','0 0 '+W+' '+H);
 for(let i=0;i<=4;i++){const val=min+(max-min)*i/4,yy=y(val);root.append(svg('line',{x1:L,y1:yy,x2:W-R,y2:yy,stroke:'#33483e','stroke-dasharray':'2 4'}),svgText(L-5,yy+4,fmt(val),{'text-anchor':'end'}))}
 const poly=[...p.map(v=>x(v.year)+','+y(v.high)),...p.slice().reverse().map(v=>x(v.year)+','+y(v.low))].join(' ');
 root.append(svg('polygon',{points:poly,fill:'#aee8ae','fill-opacity':.14}));
 const path=key=>p.map((v,i)=>(i?'L':'M')+x(v.year)+','+y(v[key])).join(' ');
 root.append(svg('path',{d:path('baseline'),stroke:'#8a9d98','stroke-width':1.8,'stroke-dasharray':'5 5',fill:'none'}),svg('path',{d:path('scenario'),stroke:'#baf2be','stroke-width':3,fill:'none'}));
 const tickYears=[...new Set([0,Math.round(model.assumptions.years/2),model.assumptions.years])];
 for(const yr of tickYears)root.append(svgText(x(yr),H-11,'Year '+yr,{'text-anchor':yr===0?'start':yr===model.assumptions.years?'end':'middle'}));
 const f=model.final;root.append(svg('circle',{cx:x(f.year),cy:y(f.scenario),r:4,fill:'#baf2be'}));
 const delta=f.scenario-f.baseline;
 $('law-outcome').textContent=fmt(f.scenario);
 $('law-change').textContent=(delta>0?'+':'')+fmt(delta)+' index points';
 $('law-reach-result').textContent=fmt(f.adoption)+'%';
 $('law-model-family').textContent=model.spec.family.name+' · '+model.spec.family.explain;
 $('law-model-direction').textContent='Metric: '+model.spec.metric+' · '+(model.spec.direction===1?'higher assumed favorable':'lower assumed favorable')+'. Baseline is normalized, not measured.';
 $('law-chart').setAttribute('aria-label',model.spec.metric+' scenario at year '+f.year+': baseline '+fmt(f.baseline)+', intervention '+fmt(f.scenario)+', sensitivity range '+fmt(f.low)+' to '+fmt(f.high));
 for(const [key,suffix] of Object.entries({years:' years',reach:'%',capacity:'%',effect:'%',lag:' years'}))$('law-value-'+key).textContent=fmt(model.assumptions[key])+suffix;
}
function renderHistory(){
 const root=$('law-history');root.replaceChildren();
 if(!history){root.append(el('p',connected?'Loading revision history…':'Connect shared data to load revisions and proposed updates.','hint'));return}
 for(const v of history.versions.slice().reverse()){
  const card=el('article',undefined,'law-history-card');card.append(el('strong','Revision '+v.number),el('p',v.content.sharedGoal||''),el('small','Advisory votes for this wording: '+fmt(v.votes?.support||0)+' support · '+fmt(v.votes?.oppose||0)+' oppose · '+fmt(v.votes?.unsure||0)+' unsure'));root.append(card)
 }
 for(const a of history.amendments.slice().reverse()){
  const card=el('article',undefined,'law-history-card');card.append(el('strong','Proposed update · '+a.status),el('p',a.reason),el('p',a.proposed?.sharedGoal||''),el('small','Implementation: '+(a.proposed?.illustrativeLocalOption||'')),el('small','Safeguards: '+(a.proposed?.risksAndSafeguards||'')));root.append(card)
 }
}
function updateDraft(){
 const law=currentLaw();if(!law)return;
 const d=drafts.get(selected)||{goal:law.sharedGoal,implementation:law.illustrativeLocalOption,safeguards:law.risksAndSafeguards,reason:'',versionId:law.versionId};
 for(const k of ['goal','implementation','safeguards','reason'])$('law-update-'+k).value=d[k]||'';
 $('law-update-consent').checked=false;
}
function drawDetail({resetDraft=true}={}){
 const row=current(),law=row?.law;if(!law)return;
 const spec=modelFor(law);$('law-id').textContent=law.id+' · '+law.category;
 $('law-title').textContent=law.title;$('law-goal').textContent=law.sharedGoal;
 $('law-option').textContent=law.illustrativeLocalOption;$('law-safeguards').textContent=law.risksAndSafeguards;
 $('law-measures').textContent=(law.suggestedMeasures||[]).join(' · ');
 $('law-version').textContent=connected?'Revision '+law.version:'Original editorial draft';
 $('law-lever-label').textContent=spec.lever;
 const a=assumptions();for(const k of ['years','reach','capacity','effect','lag'])$('law-input-'+k).value=a[k];drawChart();
 const tally=$('law-votes');tally.replaceChildren();
 for(const pos of ['support','oppose','unsure']){
   const n=el('div',undefined,'law-count');n.append(el('strong',row.votes?fmt(row.votes[pos]):'—'),el('span',pos));tally.append(n)
 }
 for(const b of document.querySelectorAll('[data-law-vote]')){b.disabled=!connected||writing||!law.versionId;b.setAttribute('aria-pressed',String(row.myVote===b.dataset.lawVote))}
 $('law-clear-vote').disabled=!connected||writing||!law.versionId;$('law-update-submit').disabled=!connected||writing||!law.versionId;
 if(resetDraft)updateDraft();
 renderHistory()
}
async function request(path,options={}){
 const response=await fetch(path,{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000),...options});
 const data=await response.json().catch(()=>null);
 if(!response.ok||!data)throw Error(data?.error||'Shared database unavailable (HTTP '+response.status+')');
 return data
}
async function loadHistory(){
 if(!connected)return;const id=selected,ticket=++loadingDetail;history=null;renderHistory();
 try{const data=await request('/api/law-board/'+encodeURIComponent(id));if(ticket!==loadingDetail||id!==selected)return;history=data;renderHistory()}
 catch(e){if(ticket===loadingDetail)setDetailStatus('Could not load revision history: '+e.message,true)}
}
function selectLaw(id){
 if(writing||!records.has(id))return;
 if(id!==selected){const law=currentLaw();if(law){const d={versionId:law.versionId};for(const k of ['goal','implementation','safeguards','reason'])d[k]=$('law-update-'+k).value;drafts.set(selected,d)}selected=id;history=null;setDetailStatus('')}
 drawCatalog();drawDetail();if(connected)loadHistory()
}
async function loadBoard(){
 const result=await request('/api/law-board');
 if(result.storage!=='supabase-postgres'&&!(location.hostname==='localhost'||location.hostname==='127.0.0.1'))throw Error('The Supabase civic database is not connected. Simulators remain available.');
 if(!result.writable||!Array.isArray(result.records)||result.records.length!==100)throw Error('The 100-law shared database is not ready.');
 const incoming=new Map(result.records.map(r=>[r.law.id,r]));
 for(const [id,d] of drafts)if(d.versionId!==incoming.get(id)?.law.versionId)drafts.delete(id);
 records=incoming;connected=true;$('law-connect').hidden=true;$('law-refresh').hidden=false;
 $('law-source').textContent=result.storage==='supabase-postgres'?'Supabase · shared advisory board':'Local test database';
 status('Shared counts loaded. Votes are per browser session, not official votes or a representative poll.');
 drawCatalog();drawDetail({resetDraft:true});await loadHistory()
}
$('law-connect').addEventListener('click',async()=>{
 if(isStatic||connecting||connected)return;connecting=true;$('law-connect').disabled=true;status('Connecting to the shared civic database…');
 try{const s=await request('/api/session');if(!s.csrfToken)throw Error('No valid session');csrf=s.csrfToken;await loadBoard()}
 catch(e){status('Shared database not connected: '+e.message+' You can still explore all 100 simulations.',true)}
 finally{connecting=false;$('law-connect').disabled=false}
});
$('law-refresh').addEventListener('click',async()=>{if(writing||connecting)return;connecting=true;try{await loadBoard()}catch(e){status('Refresh failed: '+e.message,true)}finally{connecting=false}});
async function write(action,payload){
 if(!connected||writing||connecting)return;const id=selected,body=JSON.stringify(payload),fingerprint=id+'|'+action+'|'+body;
 if(lastWrite?.fingerprint!==fingerprint)lastWrite={fingerprint,key:crypto.randomUUID()};
 writing=true;drawDetail({resetDraft:false});setDetailStatus('Submitting…');
 try{
  const session=await request('/api/session');csrf=session.csrfToken;
  await request('/api/law-board/'+id+'/'+action,{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf,'Idempotency-Key':lastWrite.key},body});
  lastWrite=null;if(action==='update')drafts.delete(id);
  setDetailStatus(action==='vote'?'Advisory position saved.':'Public update proposed; existing wording remains unchanged pending review.');
  await loadBoard()
 }catch(e){setDetailStatus('Submission not confirmed: '+e.message+' Refresh if the version changed; retry unchanged to reuse the request key.',true)}
 finally{writing=false;drawDetail({resetDraft:false})}
}
for(const b of document.querySelectorAll('[data-law-vote]'))b.addEventListener('click',()=>{const law=currentLaw();if(law)write('vote',{versionId:law.versionId,position:b.dataset.lawVote})});
$('law-clear-vote').addEventListener('click',()=>{const law=currentLaw();if(law)write('vote',{versionId:law.versionId,position:null})});
$('law-update-form').addEventListener('submit',e=>{
 e.preventDefault();const law=currentLaw();if(!law||!connected)return;
 if(!$('law-update-consent').checked){setDetailStatus('Confirm publication of this exact text before submitting.',true);return}
 const data={versionId:law.versionId,consent:true};for(const k of ['goal','implementation','safeguards','reason'])data[k]=$('law-update-'+k).value.trim();
 write('update',data)
});
for(const k of ['goal','implementation','safeguards','reason'])$('law-update-'+k).addEventListener('input',()=>$('law-update-consent').checked=false);
for(const k of ['years','reach','capacity','effect','lag'])$('law-input-'+k).addEventListener('input',()=>{assumptions()[k]=Number($('law-input-'+k).value);drawChart()});
$('law-reset').addEventListener('click',()=>{scenario.delete(selected);drawDetail({resetDraft:false})});
$('law-search').addEventListener('input',drawCatalog);$('law-category').addEventListener('change',drawCatalog);
$('law-connect').hidden=isStatic;
(async()=>{try{
 const response=await fetch('./public/law-catalog.json',{cache:'force-cache'});if(!response.ok)throw Error('Catalog asset unavailable');
 const result=await response.json();seed=result.goals;if(!Array.isArray(seed)||seed.length!==100)throw Error('Expected 100 original proposals');
 for(const law of seed){modelFor(law);records.set(law.id,{law,votes:null,myVote:null,updates:0})}
 for(const category of result.categories){const option=el('option',category);option.value=category;$('law-category').append(option)}
 $('law-count').textContent=records.size;drawCatalog();drawDetail();
 status(isStatic?'Static preview · simulations only, no shared votes.':'Original editorial catalog · connect to load shared Supabase votes and revisions.')
}catch(e){status('Could not load the bundled law catalog: '+e.message,true)}})();
