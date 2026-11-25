import {AXES,createGPU} from './consensus-world-engine.js';
import {canonicalCatalog,sharedCatalog,originFor,originLabel,matchesLaw} from './consensus-world-catalog.js';
import {voteLabel} from './consensus-world-globe.js';
import {RESEARCH_KEY,CONSENSUS_KEY,POPULATIONS,emptyState,loadResearch,putRound,assumptions,exactOrigin,latestMatching,rankedObjections,readConsensusHistory,computeRound,advisoryCounts} from './law-research-model.js';
const $=id=>document.getElementById(id),fmt=n=>Number(n).toLocaleString('en-US'),make=(tag,value,cls)=>{const el=document.createElement(tag);if(value!==undefined)el.textContent=value;if(cls)el.className=cls;return el};
let storage;try{storage=window.localStorage}catch{storage={getItem:()=>null,setItem:()=>{throw Error('Storage unavailable')}}}
let state=loadResearch(storage),laws=[],human={},selected=null,displayed=null,manual=null,busy=false,loading=false,pauseRequested=false,storageOK=true,noteDirty=false,daily=null;
const requested=new URLSearchParams(location.search).get('law');
const noteFields=['question','evidence','amendment'];
const params=()=>({population:Number($('population').value),day:Number($('day').value),mode:$('mode').value});
const validParams=p=>POPULATIONS.includes(p.population)&&Number.isInteger(p.day)&&p.day>=0&&p.day<=1000000;
const law=()=>laws.find(l=>l.id===selected);
const status=s=>$('run-status').textContent=s+(storageOK?'':' · Browser storage is unavailable or full; export JSON before closing.');
function persist(){try{storage.setItem(RESEARCH_KEY,JSON.stringify(state));storageOK=true}catch{storageOK=false}}
function mergeStorage(){if(storageOK)state=loadResearch(storage)}
function current(l){const p=params();return validParams(p)?latestMatching(state,l,p):null}
function currentManual(l){const p=params();return (state.records[l.id]||[]).find(r=>exactOrigin(r.origin,originFor(l))&&r.population===p.population&&r.day===p.day&&r.assumptionMode==='manual')||null}
function bar(el,r){el.replaceChildren();if(!r)return;for(const [i,color] of ['var(--green)','var(--gold)','var(--violet)'].entries()){const b=make('i');b.style.background=color;b.style.width=100*r.bins[i]/r.population+'%';el.append(b)}}
function labLink(l,r){const q=new URLSearchParams({law:l.id});if(r)q.set('researchRun',r.id);else if(l.versionId)q.set('version',l.versionId);return './consensus-world.html?'+q}
function showMetrics(){
 const ready=laws.map(current).filter(Boolean);
 $('total-laws').textContent=laws.length?fmt(laws.length):'—';
 $('coverage').textContent=ready.length+' / 100';
 $('evaluated').textContent=fmt(ready.reduce((n,r)=>n+r.done,0));
 $('notes-count').textContent=Object.values(state.notes).filter(n=>noteFields.some(k=>n[k]?.trim())).length;
}
function drawRows(){
 const body=$('law-rows'),p=params(),query=$('search').value,cat=$('category').value,filter=$('filter').value;
 body.replaceChildren();let count=0;
 for(const l of laws){
  const r=current(l);
  if(!matchesLaw(l,query)||cat&&cat!==l.category||filter==='missing'&&r||filter==='ready'&&!r)continue;
  count++;const tr=make('tr');tr.dataset.selected=String(l.id===selected);
  const name=make('td'),button=make('button',l.title);button.type='button';button.dataset.law=l.id;button.disabled=busy;button.setAttribute('aria-pressed',String(l.id===selected));button.append(make('small',l.id+' · '+l.category));button.onclick=()=>select(l.id,true);name.append(button);
  const votes=make('td');if(r){votes.append(make('strong',voteLabel(r.bins[0],r.population)+' yes','yes'));const b=make('div',undefined,'bar');bar(b,r);votes.append(b,make('small',fmt(r.done)+' evaluated'))}else votes.append(make('small','Not run for these settings'));
  const task=make('td');const note=state.notes[l.id]?.question?.trim();const top=r&&rankedObjections(r).find(o=>o.count>0);task.textContent=note|| (top?'Investigate '+top.name.toLowerCase():'Assess implementation and safeguards');tr.append(name,votes,task);body.append(tr)
 }
 if(!count){const tr=make('tr'),td=make('td','No proposals match these filters.');td.colSpan=3;tr.append(td);body.append(tr)}
 $('visible-count').textContent=count+' of '+laws.length+' proposals · '+(validParams(p)?'current settings':'invalid settings');showMetrics();
}
function drawAxes(){
 $('axes').replaceChildren();if(!manual)return;
 AXES.forEach((axis,i)=>{const row=make('div',undefined,'axis'),label=make('label',axis),input=make('select');input.id='effect-'+i;label.htmlFor=input.id;for(let n=-2;n<=2;n++)input.add(new Option(n===0?'0 · unknown':n>0?'+'+n:String(n),String(n)));input.value=String(manual.effects[i]);input.disabled=busy||loading;const reason=make('small',manual.reasons[i]);input.onchange=()=>{manual.effects[i]=Number(input.value);manual.reasons[i]='Manually assessed hypothesis';reason.textContent=manual.reasons[i]};row.append(label,input,reason);$('axes').append(row)});
}
function showResult(r){
 displayed=r;const l=law(),matches=r&&l&&exactOrigin(r.origin,originFor(l)),out=$('baseline-source');
 out.textContent=r?originLabel(r.origin)+' · '+r.assumptionMode+' · day '+r.day+' · '+fmt(r.done)+' agents · '+r.backend+' · '+(r.elapsedMs/1000).toFixed(2)+'s batch time'+(matches?'':' · historical source, not the currently loaded revision'):'No completed baseline for these settings.';
 ['yes','unsure','no'].forEach((id,i)=>$(id).textContent=r?voteLabel(r.bins[i],r.population):'—');bar($('detail-bar'),r);
 const ob=$('objections');ob.replaceChildren();if(r){for(const o of rankedObjections(r)){const row=make('div',undefined,'objection'),pr=make('progress');pr.max=r.bins[1]+r.bins[2]||1;pr.value=o.count;pr.setAttribute('aria-label',o.name);row.append(make('span',o.name),make('small',fmt(o.count)),pr);ob.append(row)}}
 $('open-baseline').hidden=!r||!storageOK;$('open-baseline').href=r&&l?labLink(l,r):'#';$('open-baseline').textContent=r&&!matches?'Inspect historical baseline ↗':'Improve this exact baseline ↗';
}
function drawHistory(){
 const l=law();if(!l)return;const root=$('baseline-history');root.replaceChildren();
 for(const r of state.records[l.id]||[]){const li=make('li'),b=make('button',originLabel(r.origin)+' · '+r.assumptionMode+' · '+fmt(r.population)+' · '+voteLabel(r.bins[0],r.population)+' yes');b.type='button';b.disabled=busy;b.onclick=()=>showResult(r);li.append(b,make('p','Day '+r.day+' · '+(exactOrigin(r.origin,originFor(l))?'current source':'historical source')+' · '+new Date(r.finishedAt).toISOString().slice(0,10),'muted'));root.append(li)}
 if(!root.children.length)root.append(make('li','No baseline experiments yet.','muted'));
 const revisions=$('revision-history');revisions.replaceChildren();
 for(const r of readConsensusHistory(storage,l.id).slice(0,20)){const li=make('li'),delta=r.compare?fmt(r.bins[6]+r.bins[9])+' switched to yes; '+fmt(r.bins[4]+r.bins[5])+' switched away.':'No matched baseline.';li.append(make('strong',voteLabel(r.bins[0],r.population)+' yes · '+fmt(r.population)+' · day '+r.day),make('p',originLabel(r.origin)+(r.bill===r.origin.originalBill?' · source wording':' · local revision')),make('p',delta,'muted'));const d=make('details'),sum=make('summary','Read recorded wording'),pre=make('p',r.bill);pre.style.whiteSpace='pre-wrap';d.append(sum,pre);li.append(d);revisions.append(li)}
 if(!revisions.children.length)revisions.append(make('li','No completed Consensus World rounds for this law in this browser.','muted'));
}
function drawDetail({reset=false,notes=false}={}){
 const l=law();if(!l)return;
 $('law-id').textContent=l.id+' · '+l.category;$('law-title').textContent=l.title;$('law-source').textContent=originLabel(originFor(l));$('law-goal').textContent=l.goal;$('implementation').textContent=l.implementation;$('safeguards').textContent=l.safeguards;$('measures').textContent=l.measures.join(' · ')||'No measures specified.';
 $('open-lab').href=labLink(l);
 if(reset||!manual)manual=assumptions(l,$('mode').value);
 drawAxes();showResult(currentManual(l)||current(l));drawHistory();
 const a=human[l.id];$('human-feedback').textContent=a&&a.versionId===l.versionId?fmt(a.support)+' support · '+fmt(a.oppose)+' oppose · '+fmt(a.unsure)+' unsure (advisory positions on this shared revision, not a representative poll).':'Shared advisory counts unavailable for this revision. No human votes inferred.';
 if(notes){for(const k of noteFields)$(k).value=state.notes[l.id]?.[k]||'';noteDirty=false;$('note-status').textContent=''}
}
function controls(){
 const locked=busy||loading||!laws.length;
 for(const id of ['run-all','run-missing','run-one','refresh','reset-effects','daily-open','save-note'])$(id).disabled=locked;
 for(const id of ['population','day','mode'])$(id).disabled=busy||loading;
 $('pause').disabled=!busy||pauseRequested;
 $('law-rows').querySelectorAll('button').forEach(b=>b.disabled=busy);
 $('axes').querySelectorAll('select').forEach(b=>b.disabled=busy||loading);
 for(const k of noteFields)$(k).disabled=busy||loading;
 $('baseline-history').querySelectorAll('button').forEach(b=>b.disabled=busy);
}
function select(id,scroll=false){
 if(busy||!laws.some(l=>l.id===id))return;
 if(noteDirty&&id!==selected&&!confirm('Discard unsaved research note edits?'))return;
 const changed=id!==selected;selected=id;const url=new URL(location.href);url.searchParams.set('law',id);history.replaceState(null,'',url);
 drawRows();drawDetail({reset:changed,notes:changed});controls();if(scroll&&matchMedia('(max-width: 940px)').matches)$('selected-law').scrollIntoView({block:'start'});
}
async function getJSON(url){const res=await fetch(url,{cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(8000)});if(!res.ok)throw Error('HTTP '+res.status);return res.json()}
async function refresh(){
 if(busy||loading)return;if(noteDirty&&!confirm('Discard unsaved research note edits and refresh catalog?'))return;loading=true;controls();
 $('catalog-status').textContent='Loading canonical law catalog…';
 try{
  try{const response=await getJSON('/api/law-board');laws=sharedCatalog(response);human=advisoryCounts(response);$('catalog-status').textContent='100 shared Supabase law revisions · public advisory counts separate.'}
  catch{const data=await getJSON(new URL('./law-catalog.json',location.href));laws=canonicalCatalog(data.goals);human={};$('catalog-status').textContent='100 bundled editorial drafts · shared law board unavailable. Local simulations still work.'}
  $('category').replaceChildren(new Option('All categories',''));for(const cat of new Set(laws.map(l=>l.category)))$('category').add(new Option(cat,cat));
  daily=laws[Math.floor(Date.now()/86400000)%laws.length];$('daily-title').textContent=daily.id+' · '+daily.title;
  selected=laws.some(l=>l.id===selected)?selected:laws.some(l=>l.id===requested)?requested:daily.id;
  drawRows();drawDetail({reset:true,notes:true});
 }catch(e){$('catalog-status').textContent='Catalog could not be loaded: '+e.message}
 finally{loading=false;controls()}
}
async function run(kind){
 if(busy||loading||!law())return;const p=params();if(!validParams(p)){status('Enter a valid population and simulated day.');return}
 const batch=kind==='one'?[law()]:kind==='missing'?laws.filter(l=>!current(l)):laws.slice();
 if(!batch.length){status('All current baselines are available.');return}
 if(kind!=='one'&&p.population>100000&&!confirm('Evaluate '+fmt(batch.length*p.population)+' synthetic choices? Keep this page open; pause after a law.'))return;
 busy=true;pauseRequested=false;let gpu=null,completed=0,error=null;controls();$('progress').max=batch.length;$('progress').value=0;status('Initializing WebGPU or CPU fallback…');
 const selectedManual=manual&&{effects:[...manual.effects],reasons:[...manual.reasons]};
 try{
  try{gpu=await createGPU()}catch{gpu=null}
  for(const l of batch){
   if(pauseRequested)break;
   const mode=kind==='one'?'manual':p.mode;
   let last=-1;
   const r=await computeRound({law:l,population:p.population,day:p.day,mode,manual:selectedManual,gpu,id:'research-'+crypto.randomUUID(),onProgress(done,total){const pc=Math.floor(done/total*100);if(pc!==last){last=pc;status((gpu?'WebGPU / CPU fallback':'CPU fallback')+' · '+(completed+1)+' / '+batch.length+' · '+l.id+' · '+pc+'%'+(pauseRequested?' · pausing after this law':''))}},yieldControl:()=>new Promise(resolve=>setTimeout(resolve,0))});
   if(gpu&&r.backend!=='WebGPU'){gpu.close();gpu=null}
   mergeStorage();putRound(state,r);persist();completed++;$('progress').value=completed;drawRows();if(l.id===selected){showResult(r);drawHistory()}
  }
 }catch(e){error=e.message}
 finally{gpu?.close();busy=false;controls();status(error?'Stopped: '+error+' · '+completed+' completed.':pauseRequested?'Paused after '+completed+' / '+batch.length+' laws. Run missing to continue.':'Complete · '+completed+' laws · '+fmt(completed*p.population)+' synthetic choices evaluated.');}
}
for(const id of ['search','category','filter'])$(id).addEventListener(id==='search'?'input':'change',drawRows);
for(const id of ['population','day','mode'])$(id).addEventListener('change',()=>{drawRows();drawDetail({reset:id==='mode'});controls()});
$('run-all').onclick=()=>void run('all');$('run-missing').onclick=()=>void run('missing');$('run-one').onclick=()=>void run('one');$('pause').onclick=()=>{pauseRequested=true;controls();status('Pausing after the current law…')};$('refresh').onclick=()=>void refresh();$('daily-open').onclick=()=>daily&&select(daily.id,true);$('reset-effects').onclick=()=>{manual=assumptions(law(),$('mode').value);drawAxes()};
for(const k of noteFields)$(k).addEventListener('input',()=>{noteDirty=true;$('note-status').textContent='Unsaved edits'});
$('save-note').onclick=()=>{if(!selected||busy)return;mergeStorage();state.notes[selected]=Object.fromEntries(noteFields.map(k=>[k,$(k).value.trim()]));persist();noteDirty=false;$('note-status').textContent=storageOK?'Saved locally.':'In memory only — export before closing.';drawRows()};
$('export').onclick=()=>{const blob=new Blob([JSON.stringify({schema:'helios-law-research-v1',exportedAt:new Date().toISOString(),state},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=make('a');a.href=url;a.download='helios-law-research.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
window.addEventListener('storage',event=>{if(!busy&&!loading&&(event.key===RESEARCH_KEY||event.key===CONSENSUS_KEY)){mergeStorage();drawRows();drawDetail({notes:!noteDirty});controls()}});
window.addEventListener('focus',()=>{if(!busy&&!loading&&laws.length){mergeStorage();drawRows();drawDetail({notes:!noteDirty});controls()}});
void refresh();
