import {modelFor,simulate,defaults} from './law-simulator.js';
import {childcareBudget,childcareDefaults,featureFirst} from './childcare-budget.js';
import {cannabisDraft,cannabisDefaults,cannabisBudget} from './cannabis-budget.js';
import {readCivicRoute,updateCivicRoute,scrollToCivicRoute} from './civic-route.js';
const $=id=>document.getElementById(id),el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n};
const isStatic=document.querySelector('meta[name="helios-mode"]').content==='static';
const fmt=x=>Number(x).toLocaleString(undefined,{maximumFractionDigits:1});
let seed=[],records=new Map(),selected=location.hash==='#childcare-budget'?'HGA-031':cannabisDraft.id,connected=false,connecting=false,writing=false,loadingDetail=0,csrf=null,lastWrite=null,history=null;
let accountRevision=0,accountKey='guest||false',accountRefreshPending=false;
const scenario=new Map(),drafts=new Map();
function status(message,error=false){$('law-board-status').textContent=message;$('law-board-status').classList.toggle('error',error)}
function setDetailStatus(message,error=false){$('law-detail-status').textContent=message;$('law-detail-status').classList.toggle('error',error)}
function current(){return records.get(selected)}
function currentLaw(){return current()?.law}
const isCannabisDraft=()=>selected===cannabisDraft.id;
const newDraftRow=()=>({law:cannabisDraft,votes:null,myVote:null,updates:0});
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
 for(const row of featureFirst(records.values())){
  const law=row.law;if(cat&&law.category!==cat||query&&![law.id,law.title,law.category,law.sourceProposalTitle,law.sharedGoal].some(s=>String(s||'').toLowerCase().includes(query)))continue;
  const b=el('button',undefined,'law-tile');b.type='button';b.dataset.law=law.id;b.setAttribute('aria-pressed',String(law.id===selected));b.setAttribute('aria-label',law.id+' '+law.title);b.title=law.title;
  b.append(el('span',law.id===cannabisDraft.id?'01 · DRAFT':law.id==='HGA-031'?'02 · 031':law.id.slice(4),'law-tile-number'),el('span',law.title,'law-tile-title'),law.id===cannabisDraft.id?el('span','Budget model','hint'):spark(law));
  const total=row.votes?row.votes.support+row.votes.oppose+row.votes.unsure:null;
  b.append(el('span',law.id===cannabisDraft.id?'Voting not open':total===null?'Votes not loaded':fmt(total)+' advisory votes','law-tile-votes'));
  b.addEventListener('click',()=>{selectLaw(law.id);root.querySelector('[data-law="'+law.id+'"]')?.focus({preventScroll:true})});root.append(b);
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
function saveDraft(){
 const law=currentLaw();if(!law||isCannabisDraft())return;
 const d={versionId:law.versionId};for(const k of ['goal','implementation','safeguards','reason'])d[k]=$('law-update-'+k).value;drafts.set(selected,d)
}
function updateDraft(){
 const law=currentLaw();if(!law)return;
 const d=drafts.get(selected)||{goal:law.sharedGoal,implementation:law.illustrativeLocalOption,safeguards:law.risksAndSafeguards,reason:'',versionId:law.versionId};
 for(const k of ['goal','implementation','safeguards','reason'])$('law-update-'+k).value=d[k]||'';
 $('law-update-consent').checked=false;
}
const dollars=(amount,digits=0)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:digits,maximumFractionDigits:digits}).format(amount);
let cannabisAssumptions={...cannabisDefaults};
function drawCannabis(){
 const panel=$('cannabis-budget');if(!panel)return;panel.hidden=!isCannabisDraft();if(panel.hidden)return;
 const model=cannabisBudget(cannabisAssumptions);cannabisAssumptions=model.assumptions;
 for(const [key,value] of Object.entries(model.assumptions)){
  $('cannabis-'+key).value=String(value);
  $('cannabis-value-'+key).textContent=key==='annualBudgetPerParticipant'?dollars(value):key==='adults'?fmt(value):fmt(value)+'%';
 }
 $('cannabis-participants').textContent=fmt(model.participants);
 $('cannabis-direct').textContent=dollars(model.directCost);
 $('cannabis-admin').textContent=dollars(model.administrationCost);
 $('cannabis-total').textContent=dollars(model.totalCost);
}
if($('cannabis-budget')){
for(const key of Object.keys(cannabisDefaults))$('cannabis-'+key).addEventListener('input',()=>{cannabisAssumptions[key]=Number($('cannabis-'+key).value);drawCannabis()});
$('cannabis-reset').addEventListener('click',()=>{cannabisAssumptions={...cannabisDefaults};drawCannabis()});
}
let childcareAssumptions={...childcareDefaults};
function drawChildcare(){
 const panel=$('childcare-budget');if(!panel)return;panel.hidden=selected!=='HGA-031';if(panel.hidden)return;
 const model=childcareBudget(childcareAssumptions);childcareAssumptions=model.assumptions;
 for(const [key,value] of Object.entries(model.assumptions)){
  $('childcare-'+key).value=String(value);
  $('childcare-value-'+key).textContent=key==='rate'?dollars(value,2):key==='subsidy'||key==='utilization'?fmt(value)+'%':fmt(value);
 }
 const amounts={'government-hour':dollars(model.governmentPerHour,2),'parent-hour':dollars(model.parentPerHour,2),'caregiver-hour':dollars(model.caregiverPerHour,2),savings:dollars(model.savingsPerFamily),'public':dollars(model.annualPublicCost),'parent-total':dollars(model.annualParentCost),'caregiver-total':dollars(model.annualCaregiverPayments),'used-hours':fmt(model.coveredHoursPerFamily)};
 for(const [key,value] of Object.entries(amounts))$('childcare-'+key).textContent=value;
 $('childcare-share').style.width=model.assumptions.subsidy+'%';
}
if($('childcare-budget')){
for(const key of Object.keys(childcareDefaults))$('childcare-'+key).addEventListener('input',()=>{
 childcareAssumptions[key]=Number($('childcare-'+key).value);drawChildcare();
 $('childcare-draft-status').textContent='Local scenario changed. Use the current assumptions to create a new update draft.';
});
$('childcare-reset').addEventListener('click',()=>{childcareAssumptions={...childcareDefaults};drawChildcare();$('childcare-draft-status').textContent='Budget reset. No shared data changed.'});
$('childcare-draft-button').addEventListener('click',()=>{
 if(selected!=='HGA-031'||writing)return;
 const m=childcareBudget(childcareAssumptions),a=m.assumptions;
 const proposal={
 goal:'Make regular childcare and occasional babysitting affordable while protecting caregiver pay and giving families freedom to choose safe care.',
 implementation:'Pilot income-sensitive childcare assistance with up to '+a.hours+' covered hours per family per month at an illustrative reimbursement rate of '+dollars(a.rate,2)+' per hour and '+a.subsidy+'% subsidy. Include approved daycare, occasional babysitting, qualifying relatives, evenings and weekends. Pair credits with supply expansion and fair-pay support. Personal leisure does not require justification.',
 safeguards:'Require age-appropriate care, provider screening and training, transparent prices, privacy, independent evaluation and sufficient supply. Review eligibility, distributional effects, funding and labor standards before implementation.',
 reason:'Illustrative budget: '+fmt(a.families)+' participating families, '+a.utilization+'% utilization, '+dollars(m.annualPublicCost)+' annual direct public cost, excluding administration, payroll overhead and capacity investment. These are scenario inputs for review, not measured effects.'
 };
 for(const [key,value] of Object.entries(proposal))$('law-update-'+key).value=value;
 $('law-update-consent').checked=false;saveDraft();
 $('law-update-form').closest('details').open=true;
 $('childcare-draft-status').textContent='Update draft filled with this scenario. Review the wording and explicitly consent before submitting; existing votes and wording are unchanged.';
 $('law-update-goal').focus();
});
}
function drawDetail({resetDraft=true}={}){
 const row=current(),law=row?.law;if(!law)return;
 const draft=isCannabisDraft();
 const lab=$('law-consensus-world');if(lab){const params=new URLSearchParams({law:law.id});if(connected&&!draft&&law.versionId)params.set('version',law.versionId);lab.href='./public/consensus-world.html?'+params.toString();lab.hidden=false}
 const ide=$('atlas-ide-link');if(ide){ide.hidden=draft;if(!draft){const p=new URLSearchParams({law:law.id,clause:'implementation'});if(connected&&law.versionId)p.set('revision',law.versionId);ide.href='/constitution?'+p.toString()}}
 for(const id of ['law-votes','law-vote-controls','law-generic-sim','law-history-section','law-update-section'])$(id).hidden=draft;
 if(draft){
  $('law-id').textContent='Featured law 01 · New draft';$('law-title').textContent=law.title;$('law-goal').textContent=law.sharedGoal;$('law-version').textContent='Unpublished draft';
  $('law-assembly-selected').hidden=true;
  $('law-option').textContent=law.illustrativeLocalOption;$('law-safeguards').textContent=law.risksAndSafeguards;$('law-measures').textContent=law.suggestedMeasures.join(' · ');
  for(const b of document.querySelectorAll('[data-law-vote]')){b.disabled=true;b.setAttribute('aria-pressed','false')}
  $('law-clear-vote').disabled=true;$('law-update-submit').disabled=true;
  drawChildcare();drawCannabis();return;
 }
 const spec=modelFor(law);$('law-id').textContent=(law.id==='HGA-031'?'Featured law 02 · ':'')+law.id+' · '+law.category;
 $('law-title').textContent=law.title;$('law-goal').textContent=law.sharedGoal;
 const assemblyChapter={'HGA-012':'homes','HGA-051':'places','HGA-091':'water'}[law.id],assemblyLink=$('law-assembly-selected');
 if(assemblyLink){
   const futures=law.id==='HGA-090';assemblyLink.hidden=!assemblyChapter&&!futures;
   assemblyLink.textContent=futures?'Explore 100 possible futures ↗':'See how it works · 3D assembly ↗';
   assemblyLink.href=futures?'./public/helios-futures.html':assemblyChapter?'./public/helios-law-assembly.html#'+assemblyChapter:'./public/helios-law-assembly.html';
 }
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
 drawChildcare();drawCannabis();renderHistory()
}
async function request(path,options={}){
 const headers=new Headers(options.headers),accountHeaders=await window.HeliosAccount?.fetchHeaders('votes')||{};
 for(const [key,value] of Object.entries(accountHeaders))headers.set(key,value);
 const revision=accountRevision;
 const response=await fetch(path,{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000),...options,headers});
 if(revision!==accountRevision)throw Error('Your account changed. Refresh the board before trying again.');
 const data=await response.json().catch(()=>null);
 if(revision!==accountRevision)throw Error('Your account changed. Refresh the board before trying again.');
 if(!response.ok||!data)throw Error(data?.error||'Shared database unavailable (HTTP '+response.status+')');
 return data
}
async function loadHistory(){
 if(!connected||isCannabisDraft())return;const id=selected,ticket=++loadingDetail;history=null;renderHistory();
 try{const data=await request('/api/law-board/'+encodeURIComponent(id));if(ticket!==loadingDetail||id!==selected)return;history=data;renderHistory()}
 catch(e){if(ticket===loadingDetail)setDetailStatus('Could not load revision history: '+e.message,true)}
}
export function selectLaw(id,{navigate=true}={}){
 if(writing||!records.has(id))return;
 if(id!==selected){saveDraft();selected=id;history=null;setDetailStatus('')}
 const lab=document.getElementById('communal-science-lab');
 if(navigate&&!lab)updateCivicRoute({law:id,anchor:'law-title'});
 drawCatalog();drawDetail();if(connected)loadHistory();
 if(lab){const url=new URL(location.href);url.searchParams.set('law',id);window.history.replaceState(window.history.state,'',url)}
}
window.addEventListener('popstate',()=>{if(document.getElementById('communal-science-lab'))return;const id=readCivicRoute().law||'HGA-001';if(records.has(id)){ $('law-search').value='';$('law-category').value='';selectLaw(id,{navigate:false});scrollToCivicRoute('law-title','laws-workbench')}});
async function loadBoard({preserveDraft=true}={}){
 if(preserveDraft&&connected)saveDraft();
 const result=await request('/api/law-board');
 if(result.storage!=='supabase-postgres'&&!(location.hostname==='localhost'||location.hostname==='127.0.0.1'))throw Error('The Supabase civic database is not connected. Simulators remain available.');
 if(!result.writable||!Array.isArray(result.records)||result.records.length!==100)throw Error('The 100-law shared database is not ready.');
 const incoming=new Map(result.records.map(r=>[r.law.id,r]));incoming.set(cannabisDraft.id,newDraftRow());
 for(const [id,d] of drafts)if(d.versionId!==incoming.get(id)?.law.versionId)drafts.delete(id);
 records=incoming;connected=true;$('law-connect').hidden=true;$('law-refresh').hidden=false;
 $('law-source').textContent=result.storage==='supabase-postgres'?'Supabase · shared advisory board':'Local test database';
 status('Shared counts loaded. Votes are per account or guest browser session; they are advisory, not official votes or a representative poll.');
 drawCatalog();drawDetail({resetDraft:true});await loadHistory()
}
async function refreshAccountVotes(){
 if(!connected)return;
 if(writing||connecting){accountRefreshPending=true;return;}
 accountRefreshPending=false;connecting=true;
 try{await loadBoard()}catch(error){status('Account view could not refresh: '+error.message,true)}
 finally{connecting=false;if(accountRefreshPending)refreshAccountVotes()}
}
window.addEventListener('helios:auth-changed',event=>{
 const state=event.detail||{},key=[state.status,state.user?.id||'',state.persistence?.votes===true].join('|');
 if(key===accountKey)return;accountKey=key;accountRevision++;csrf=null;lastWrite=null;
 if(!connected)return;
 for(const row of records.values())row.myVote=null;
 drawDetail({resetDraft:false});refreshAccountVotes();
});
$('law-connect').addEventListener('click',async()=>{
 if(isStatic||connecting||connected)return;connecting=true;$('law-connect').disabled=true;status('Connecting to the shared civic database…');
 try{const s=await request('/api/session');if(!s.csrfToken)throw Error('No valid session');csrf=s.csrfToken;await loadBoard()}
 catch(e){status('Shared database not connected: '+e.message+' You can still explore all 100 simulations.',true)}
 finally{connecting=false;$('law-connect').disabled=false;if(accountRefreshPending)refreshAccountVotes()}
});
$('law-refresh').addEventListener('click',async()=>{if(writing||connecting)return;connecting=true;try{await loadBoard()}catch(e){status('Refresh failed: '+e.message,true)}finally{connecting=false;if(accountRefreshPending)refreshAccountVotes()}});
async function write(action,payload){
 if(!connected||writing||connecting||isCannabisDraft())return;const id=selected,body=JSON.stringify(payload),fingerprint=id+'|'+action+'|'+body,revision=accountRevision;
 if(lastWrite?.fingerprint!==fingerprint)lastWrite={fingerprint,key:crypto.randomUUID()};
 writing=true;drawDetail({resetDraft:false});setDetailStatus('Submitting…');
 try{
  const session=await request('/api/session');csrf=session.csrfToken;
  if(revision!==accountRevision)throw Error('Your account changed. Review the action and try again.');
  await request('/api/law-board/'+id+'/'+action,{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf,'Idempotency-Key':lastWrite.key},body});
  lastWrite=null;if(action==='update')drafts.delete(id);
  setDetailStatus(action==='vote'?(window.HeliosAccount?.isSavingWithAccount('votes')?'Advisory position saved with your account.':'Advisory position saved for this guest browser session.'):'Public update proposed; existing wording remains unchanged pending review.');
  try{await loadBoard({preserveDraft:action!=='update'})}catch(e){status('Submission saved, but the board refresh failed: '+e.message,true)}
 }catch(e){setDetailStatus('Submission not confirmed: '+e.message+' Refresh if the version changed; retry unchanged to reuse the request key.',true)}
 finally{writing=false;drawDetail({resetDraft:false});if(accountRefreshPending)refreshAccountVotes()}
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
export const ready=(async()=>{try{
 const response=await fetch('./public/law-catalog.json',{cache:'force-cache'});if(!response.ok)throw Error('Catalog asset unavailable');
 const result=await response.json();seed=result.goals;if(!Array.isArray(seed)||seed.length!==100)throw Error('Expected 100 original proposals');
 for(const law of seed){modelFor(law);records.set(law.id,{law,votes:null,myVote:null,updates:0})}
 records.set(cannabisDraft.id,newDraftRow());
 for(const category of result.categories){const option=el('option',category);option.value=category;$('law-category').append(option)}
 const lab=document.getElementById('communal-science-lab'),requested=lab?new URLSearchParams(location.search).get('law'):readCivicRoute().law;
 if(records.has(requested))selected=requested;else if(lab&&records.has('HGA-051'))selected='HGA-051';
 $('law-count').textContent=records.size;drawCatalog();drawDetail();$('law-connect').disabled=false;if(!lab)scrollToCivicRoute('law-title','laws-workbench');
 if(['#childcare-budget','#cannabis-budget'].includes(location.hash))requestAnimationFrame(()=>$(location.hash.slice(1)).scrollIntoView({block:'start'}));
 status(isStatic?'Static preview · simulations only, no shared votes.':'Original editorial catalog plus one new draft · connect to load shared Supabase votes and revisions for the original laws.')
}catch(e){status('Could not load the bundled law catalog: '+e.message,true)}})();
