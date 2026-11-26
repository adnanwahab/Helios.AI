import {AXES,MAX_POPULATION,GPU_BATCH,CPU_BATCH,BINS,VERSION,hash,evaluate,cpuBatch,assertBatch,createGPU,suggestEffects,validEffects} from './consensus-world-engine.js';
import {initWorkshop} from './consensus-world-workshop.js';
import {findResearchRound} from './law-research-model.js';
import {initGlobe,voteLabel} from './consensus-world-globe.js';
import {canonicalCatalog,sharedCatalog,featuredDraft,formatBill,originFor,validOrigin,originLabel,sameLaw,matchesLaw} from './consensus-world-catalog.js';
const $=id=>document.getElementById(id), fmt=n=>Number(n).toLocaleString('en-US'), pct=(n,d)=>d? (n/d*100).toFixed(2)+'%':'—';
const seed=20261125, key='helios.consensus-world.v1', choices=['Yes','Not sure','No'];
const validPops=[100000,1000000,10000000,100000000,MAX_POPULATION];
let effects=Array(8).fill(0),reasons=Array(8).fill('Unknown / not assessed'),history=[],archive=[],active=null,shown=null,busy=false,stop=false,gpu=null,backend='Not started',storageOK=true,dirty=false;
const axisInputs=[],axisReasons=[];
const query=new URLSearchParams(location.search),requestedLaw=query.get('law'),requestedVersion=query.get('version'),requestedResearchRun=query.get('researchRun');
let origin=null,catalog=[],catalogBusy=false,restored=false,initialDraft=null;
const HISTORY_LIMIT=120,ARCHIVE_LIMIT=100;
const globe=initGlobe({canvas:$('particles'),motion:$('globe-motion'),assess:(id,r)=>evaluate(id,r.effects,r.seed,r.day,false).vote,onPick:id=>{$('agent').value=String(id);$('agent-details').open=true;inspectVoter();$('agent-details').scrollIntoView({block:'nearest'});}});
$('meet-voter').addEventListener('click',()=>globe.meet());
for(let i=0;i<AXES.length;i++){
  const wrap=document.createElement('div');wrap.className='axis';
  const label=document.createElement('label');label.htmlFor='effect-'+i;label.textContent=AXES[i];
  const select=document.createElement('select');select.id=label.htmlFor;
  for(let v=-2;v<=2;v++){const o=document.createElement('option');o.value=v;o.textContent=v===0?'0 · unknown':v>0?'+'+v:String(v);select.append(o);}
  const reason=document.createElement('small');
  select.addEventListener('change',()=>{effects[i]=Number(select.value);reasons[i]='Manually assessed';reason.textContent=reasons[i];save();});
  wrap.append(label,select,reason);$('axes').append(wrap);axisInputs.push(select);axisReasons.push(reason);
}
function draft(){return {bill:$('bill').value,effects:[...effects],reasons:[...reasons],population:Number($('population').value),day:Number($('day').value),baseline:$('baseline').value,dirty,origin};}
function validDraft(d){return d&&typeof d.bill==='string'&&d.bill.length<=12000&&validEffects(d.effects)&&Array.isArray(d.reasons)&&d.reasons.length===8&&d.reasons.every(x=>typeof x==='string')&&validPops.includes(d.population)&&Number.isInteger(d.day)&&d.day>=0&&d.day<=1000000&&validOrigin(d.origin);}
function validRound(r){if(!validDraft(r)||!Number.isSafeInteger(r.done)||r.done<0||r.done>r.population||typeof r.id!=='string'||!Array.isArray(r.bins)||r.bins.length!==BINS||!validEffects(r.prior)||typeof r.compare!=='boolean'||r.seed!==seed)return false;try{assertBatch(r.bins,r.done,r.compare);return true;}catch{return false;}}
function loadDraft(d){
  $('bill').value=d.bill;$('population').value=d.population;$('day').value=d.day;
  effects=[...d.effects];reasons=[...d.reasons];dirty=!!d.dirty;origin=d.origin||null;sourceUI();
  axisInputs.forEach((el,i)=>{el.value=effects[i];axisReasons[i].textContent=reasons[i];});
}
function save(){
  try{localStorage.setItem(key,JSON.stringify({version:VERSION,draft:draft(),history,archive,active}));storageOK=true;}
  catch{storageOK=false;}
}
function historyUI(selected=$('baseline').value){
  const list=$('history'),select=$('baseline');list.replaceChildren();select.replaceChildren(new Option('No baseline',''));
  for(const r of history){
    if(sameLaw(r.origin,origin))select.add(new Option(originLabel(r.origin)+' · Day '+r.day+' · '+pct(r.bins[0],r.population)+' yes · '+r.bill.slice(0,46),r.id));
    const btn=document.createElement('button');btn.type='button';btn.disabled=!!active||busy;btn.textContent=originLabel(r.origin)+' · Day '+r.day+' · '+fmt(r.population)+' · '+pct(r.bins[0],r.population)+' yes — '+r.bill.slice(0,80);
    btn.addEventListener('click',()=>{if(active||busy)return;loadDraft(r);syncUrl();shown=r;historyUI(r.id);render();save();});list.append(btn);
  }
  if(history.some(r=>r.id===selected&&sameLaw(r.origin,origin)))select.value=selected;
  else select.value='';
  if(!history.length)list.textContent='Completed rounds will appear here.';
  const drafts=$('draft-archive');drafts.replaceChildren();
  for(const d of archive){const b=document.createElement('button');b.type='button';b.disabled=!!active||busy;b.textContent=originLabel(d.origin)+' · Unrun draft · '+d.bill.slice(0,80);b.onclick=()=>{if(active||busy)return;loadDraft(d);syncUrl();shown=null;historyUI('');save();render();status('Archived draft restored. Run it to establish a matching baseline.');};drafts.append(b);}
  if(!archive.length)drafts.textContent='Originals kept before simulation will appear here.';
}
function status(s){$('status').textContent=s+(storageOK?'':' Browser storage unavailable; export before closing.');}
function controls(){
  const locked=!!active||busy;
  for(const id of ['bill','interpret','clear','population','day','baseline','improve'])$(id).disabled=locked;
  axisInputs.forEach(el=>el.disabled=locked);
  $('improve-objections').disabled=locked||!shown||shown.done!==shown.population;
  $('run').disabled=busy;$('run').textContent=active?'Resume voting round':'Run voting round';
  $('pause').disabled=!busy||stop;$('discard').disabled=busy||!active;
  $('history').querySelectorAll('button').forEach(el=>el.disabled=locked);
  $('draft-archive').querySelectorAll('button').forEach(el=>el.disabled=locked);
  for(const id of ['catalog-search','catalog-law','catalog-load','catalog-refresh'])$(id).disabled=locked||catalogBusy||(id==='catalog-law'&&!catalog.length)||(id==='catalog-load'&&!$('catalog-law').value);
}
function metricsFor(r){
 const m=r?.metrics;
 if(!m||!Number.isSafeInteger(m.measured)||m.measured<0||m.measured>r.done||!Number.isFinite(m.ms)||m.ms<0||!Number.isSafeInteger(m.gpuBytes)||m.gpuBytes<0||!['WebGPU · paged','CPU fallback','Mixed · GPU + CPU'].includes(m.backend))return {measured:0,ms:0,gpuBytes:0,backend:null};
 return m;
}
function renderMetrics(r,n,total){
 const m=metricsFor(r);
 $('round-day').textContent='DAY '+String((r?.day??(Number($('day').value)||0))+1).padStart(2,'0');
 $('compute-backend').textContent=m.backend||(busy?'Initializing compute…':'Ready to evaluate');
 $('progress-percent').textContent=voteLabel(n,total,1);
 const rate=m.ms>0?m.measured/(m.ms/1000):0;
 const rateText=rate>=1e6?(rate/1e6).toFixed(2)+'M':rate>=1e3?(rate/1e3).toFixed(1)+'K':Math.round(rate).toLocaleString('en-US');
 $('throughput').textContent=m.measured&&m.ms>0?rateText+' votes / sec':'— votes / sec';
 $('throughput').title=m.measured?'Measured completed batch evaluations / elapsed batch time (includes readback and aggregation). '+fmt(m.measured)+' timed votes.':'No measured batch timing for this round';
 $('gpu-memory').textContent=m.gpuBytes?(m.gpuBytes/1024).toFixed(1)+' KiB GPU buffers':m.measured?'No GPU buffers recorded':'— GPU buffers';
 $('gpu-memory').title='Peak allocated parameter, output and readback buffer sizes; excludes browser and driver overhead.';
 $('compute-time').textContent=m.measured?(m.ms/1000).toFixed(2)+'s batch compute':'— batch compute';
 $('compute-time').title='Total measured batch wall time, excluding inter-batch UI, pauses and initialization.';
}
function render(){
  const r=active||shown,n=r?.done||0,bins=r?.bins||Array(BINS).fill(0);
  $('progress').max=r?.population||1;$('progress').value=n;$('count').textContent=fmt(n)+' / '+fmt(r?.population||Number($('population').value))+' evaluated';
  ['yes','unsure','no'].forEach((id,i)=>{$(id).textContent=voteLabel(bins[i],n);$(id).title=fmt(bins[i])+' votes';$('bar'+i).style.width=(n?bins[i]/n*100:0)+'%';});
  $('yes-legend').textContent=voteLabel(bins[0],n);$('yes-count').textContent=n?fmt(bins[0])+' yes votes counted':'No votes counted';renderMetrics(r,n,r?.population||Number($('population').value));
  const complete=r&&n===r.population;
  $('result-source').textContent=r?originLabel(r.origin)+(r.origin&&r.bill!==r.origin.originalBill?' · local revision':'')+' · Day '+r.day:'No law evaluated yet.';
  sourceUI();
  $('verdict').textContent=!r?'No round yet.':!complete?'Partial result · '+fmt(bins[0])+' yes, '+fmt(bins[1])+' unsure, '+fmt(bins[2])+' no.':bins[0]===r.population?'Unanimous synthetic support: every evaluated agent said yes. Not real consent.':fmt(bins[1]+bins[2])+' of '+fmt(r.population)+' synthetic agents did not say yes.';
  const o=$('objections');o.replaceChildren();
  for(const i of [...AXES.keys()].sort((a,b)=>bins[12+b]-bins[12+a])){
    const el=document.createElement('div');el.className='objection';const name=document.createElement('span');name.textContent=AXES[i];
    const value=document.createElement('small');value.textContent=fmt(bins[12+i]);const bar=document.createElement('progress');bar.max=bins[1]+bins[2]||1;bar.value=bins[12+i];bar.setAttribute('aria-label',AXES[i]);el.append(name,value,bar);o.append(el);
  }
  $('compare-note').textContent=r?.compare?'Matched IDs · '+fmt(bins[6]+bins[9])+' switched to yes; '+fmt(bins[4]+bins[5])+' switched away from yes. '+(complete?'Complete.':'Partial counts.'):'No matched baseline for this round.';
  const matrix=$('matrix');matrix.replaceChildren();
  choices.forEach((name,i)=>{const tr=document.createElement('tr'),th=document.createElement('th');th.scope='row';th.textContent=name;tr.append(th);for(let j=0;j<3;j++){const td=document.createElement('td');td.textContent=r?.compare?fmt(bins[3+i*3+j]):'—';tr.append(td);}matrix.append(tr);});
  globe.update(r,Number($('population').value));controls();
}
function interpret(){
  const s=suggestEffects($('bill').value);effects=s.effects;reasons=s.reasons;dirty=false;
  axisInputs.forEach((el,i)=>{el.value=effects[i];axisReasons[i].textContent=reasons[i];});save();
}
$('interpret').addEventListener('click',()=>{interpret();status('Suggested assumptions updated. Review each effect before running.');});
$('bill').addEventListener('input',()=>{dirty=true;sourceUI();save();status('Draft changed. Review or regenerate the assumptions before running.');});
for(const id of ['population','day','baseline'])$(id).addEventListener('change',()=>{save();render();});
$('clear').addEventListener('click',()=>{if(!confirm('Clear current draft? Completed rounds are retained.'))return;archiveCurrent();origin=null;shown=null;$('bill').value='';historyUI('');syncUrl();interpret();render();status('Ready for a new bill.');});
$('pause').addEventListener('click',()=>{stop=true;controls();status('Pausing after the current completed batch…');});
$('discard').addEventListener('click',()=>{if(busy||!active||!confirm('Discard the unfinished run?'))return;active=null;shown=history[0]||null;save();render();status('Checkpoint discarded.');});
$('run').addEventListener('click',run);
async function run(){
  if(busy)return;
  if(!active){
    const d=draft();if(!validDraft(d)||!d.bill.trim()){status('Enter a bill and a valid simulated day.');return;}
    if(dirty&&!confirm('The draft text changed. Keep the current assumptions instead of regenerating them?'))return;
    const prior=history.find(r=>r.id===d.baseline);
    if(prior&&(!sameLaw(prior.origin,d.origin)||prior.population!==d.population||prior.day!==d.day)){status('Choose a baseline for the same law, population and day, or select No baseline.');return;}
    active={...d,dirty:false,id:Date.now().toString(36)+'-'+Math.random().toString(36).slice(2),seed,done:0,bins:Array(BINS).fill(0),compare:!!prior,prior:prior?[...prior.effects]:Array(8).fill(0)};
    shown=active;save();
  }
  busy=true;stop=false;render();status('Initializing compute backend…');
  try {
    if(!gpu){try{gpu=await createGPU();}catch{gpu=null;}}
    backend=gpu?'WebGPU':'CPU fallback';let lastPaint=0;
    while(!stop&&active.done<active.population){
      const r=active,count=Math.min(r.population-r.done,gpu?GPU_BATCH:CPU_BATCH);
      const req={start:r.done,count,effects:r.effects,prior:r.prior,compare:r.compare,seed:r.seed,day:r.day};
      let bins;const started=performance.now(),mode=gpu?'WebGPU · paged':'CPU fallback',bytes=gpu?.bufferBytes||0;
      try{bins=gpu?await gpu.batch(req):cpuBatch(req);assertBatch(bins,count,r.compare);}
      catch(e){if(gpu){gpu.close();gpu=null;backend='CPU fallback after GPU failure';continue;}throw e;}
      const previous=metricsFor(r),elapsed=Math.max(0,performance.now()-started);
      r.metrics={measured:previous.measured+count,ms:previous.ms+elapsed,gpuBytes:Math.max(previous.gpuBytes,bytes),backend:previous.backend&&previous.backend!==mode?'Mixed · GPU + CPU':mode};
      for(let i=0;i<BINS;i++)r.bins[i]+=bins[i];r.done+=count;
      assertBatch(r.bins,r.done,r.compare);const now=performance.now();if(now-lastPaint>=250||r.done===r.population||stop){save();render();status(backend+' · '+pct(r.done,r.population)+' complete');lastPaint=now;}
      await new Promise(resolve=>setTimeout(resolve,0));
    }
    if(active.done===active.population){
      const completed=active;history=[completed,...history.filter(r=>r.id!==completed.id)].slice(0,HISTORY_LIMIT);active=null;shown=completed;historyUI(completed.id);save();status(backend+' · round complete.');
    }else{save();status('Paused · '+fmt(active.done)+' agents evaluated. Resume whenever you like.');}
  }catch(err){save();status('Round stopped: '+err.message+' · last completed checkpoint retained.');}
  finally{busy=false;stop=false;gpu?.close();gpu=null;render();}
}
function inspectVoter(){
  const r=active||shown||{...draft(),seed,done:0},id=Number($('agent').value);
  if(!Number.isSafeInteger(id)||id<0||id>=r.population){$('agent-result').textContent='Choose a valid ID in the displayed population.';return;}
  const e=evaluate(id,r.effects,r.seed,r.day);
  const order=[...AXES.keys()].sort((a,b)=>e.weights[b]-e.weights[a]);
  $('agent-result').textContent='Agent '+fmt(id)+': '+choices[e.vote]+(id>=r.done?' (preview; not yet counted)':'')+'. Model score '+e.score+'. Highest weights: '+order.slice(0,3).map(i=>AXES[i]+' '+e.weights[i]+'/8').join(', ')+'.';
}
$('inspect').addEventListener('click',inspectVoter);
$('export').addEventListener('click',()=>{
  const blob=new Blob([JSON.stringify({version:VERSION,draft:draft(),history,archive,active},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='helios-consensus-world.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
try{
  const stored=JSON.parse(localStorage.getItem(key)||'null');
  if(stored?.version===VERSION){
    archive=Array.isArray(stored.archive)?stored.archive.filter(validDraft).slice(0,ARCHIVE_LIMIT):[];
    history=Array.isArray(stored.history)?stored.history.filter(r=>validRound(r)&&r.done===r.population).slice(0,HISTORY_LIMIT):[];
    active=validRound(stored.active)&&stored.active.done<stored.active.population?stored.active:null;
    // Recover a completed run if the page closed before finalizing its history.
    if(validRound(stored.active)&&stored.active.done===stored.active.population&&!history.some(r=>r.id===stored.active.id))history.unshift(stored.active);
    const d=active||stored.draft;if(validDraft(d)){loadDraft(d);restored=true;}else interpret();
    shown=active||history[0]||null;historyUI(d?.baseline||'');
    if(active)status('Saved checkpoint · '+fmt(active.done)+' evaluated. Resume when ready.');
  }else{interpret();historyUI();}
}catch{interpret();historyUI();status('Unable to restore local draft; started a new experiment.');}
render();

function matchingRound(d){
  return history.find(r=>r.done===r.population&&sameLaw(r.origin,d.origin)&&r.bill===d.bill&&r.population===d.population&&r.day===d.day&&r.effects.every((v,i)=>v===d.effects[i]));
}
initWorkshop({
  getDraft:draft,
  getRound:matchingRound,
  canOpen:()=>!active&&!busy,
  getSeed:()=>seed,
  apply:({original,bill,effects:next,reasons:why,runNow})=>{
    if(active||busy||!validEffects(next)||!bill.trim()||bill.length>12000)return false;
    const current=draft();
    if(!sameLaw(current.origin,original.origin)||current.bill!==original.bill||current.day!==original.day||current.population!==original.population||current.effects.some((v,i)=>v!==original.effects[i]))return false;
    const prior=matchingRound(original);
    if(!prior)archiveCurrent();
    loadDraft({...current,bill,effects:next,reasons:why,dirty:false});
    historyUI(prior?.id||'');save();render();
    status(prior?'Revision ready · matched baseline selected.':'Revision ready · original archived; restore and run it first for a matched comparison, or run the revision without a baseline.');
    if(runNow&&prior)void run();
    return true;
  }
});

function sourceUI(){
 $('bill-length').textContent=fmt($('bill').value.length)+' / 12,000';
 const versions=new Set(history.filter(r=>sameLaw(r.origin,origin)).map(r=>r.bill));versions.add($('bill').value);$('draft-badge').textContent='DRAFT '+String(versions.size).padStart(2,'0');
 $('draft-source').textContent=origin?originLabel(origin)+' · '+origin.title+($('bill').value===origin.originalBill?' · original wording':' · local revision; source remains unchanged'):'Custom / legacy draft · not linked to the catalog.';
}
function syncUrl(){
 const url=new URL(location.href);url.searchParams.delete('researchRun');if(origin){url.searchParams.set('law',origin.lawId);if(origin.versionId)url.searchParams.set('version',origin.versionId);else url.searchParams.delete('version');}
 else{url.searchParams.delete('law');url.searchParams.delete('version');}window.history.replaceState(null,'',url);
}
function archiveCurrent(){
 const d=draft();if(!d.bill.trim()||matchingRound(d))return;
 archive=[d,...archive.filter(a=>!(sameLaw(a.origin,d.origin)&&a.bill===d.bill&&a.day===d.day&&a.population===d.population&&a.effects.every((v,i)=>v===d.effects[i])))].slice(0,ARCHIVE_LIMIT);
}
function fillCatalog(selected=$('catalog-law').value){
 const select=$('catalog-law');select.replaceChildren(new Option('Choose a proposal',''));
 const filtered=catalog.filter(l=>matchesLaw(l,$('catalog-search').value));
 for(const law of filtered)select.add(new Option(law.id+' · '+law.title+(law.source==='featured'?' (separate draft)':''),law.id));
 if(filtered.some(l=>l.id===selected))select.value=selected;controls();
}
function loadCatalogLaw(id,{initial=false,version=null}={}){
 if(active||busy)return false;
 const law=catalog.find(l=>l.id===id);
 if(!law){$('catalog-status').textContent='Requested law not available. Choose a proposal from the catalog.';return false;}
 if(version&&law.versionId!==version){$('catalog-status').textContent='The requested shared revision is not available in the loaded catalog. Choose Load selected law to use the displayed current version instead.';return false;}
 if(!initial||restored)archiveCurrent();
 origin=originFor(law);$('bill').value=formatBill(law);shown=null;dirty=false;
 // Do not interpret risk/safeguard descriptions as promised outcomes.
 effects=Array(8).fill(0);reasons=Array(8).fill('Not assessed — review this law’s actual implementation and safeguards');
 axisInputs.forEach((el,i)=>{el.value=0;axisReasons[i].textContent=reasons[i];});
 historyUI('');syncUrl();save();render();
 $('catalog-status').textContent='Loaded '+originLabel(origin)+'. '+(law.source==='bundled'?'Original editorial snapshot, not confirmed as the latest database version.':'This is a local copy; shared wording is unchanged.');
 status('Law loaded · assess the eight effects, then run a voting round.');return true;
}
async function readCatalog(url){
 const r=await fetch(url,{cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(8000)});
 if(!r.ok)throw Error('HTTP '+r.status);return r.json();
}
async function refreshCatalog(initial=false){
 if(active&& !initial ||busy||catalogBusy)return;
 catalogBusy=true;controls();$('catalog-status').textContent='Loading Helios law catalog…';
 const snapshot=JSON.stringify(draft());
 try{
   let laws,sourceNote;
   try{laws=sharedCatalog(await readCatalog('/api/law-board'));sourceNote='100 shared Supabase revisions';}
   catch{
     const data=await readCatalog(new URL('./law-catalog.json',location.href));
     laws=canonicalCatalog(data.goals);sourceNote='100 bundled editorial proposals · shared database unavailable or not configured';
   }
   catalog=[featuredDraft(),...laws];fillCatalog(initial?(requestedLaw||origin?.lawId||'HGA-001'):(origin?.lawId||$('catalog-law').value));
   $('catalog-status').textContent=sourceNote+' + 1 separate featured draft. Refresh does not overwrite local edits.';
   if(initial){
     if(active){if(requestedLaw&&requestedLaw!==origin?.lawId)$('catalog-status').textContent+=' Finish or discard the saved round before loading the requested law.';}
     else if(JSON.stringify(draft())===snapshot){
       if(requestedLaw&&!(restored&&origin?.lawId===requestedLaw&&(!requestedVersion||origin.versionId===requestedVersion)))loadCatalogLaw(requestedLaw,{initial:true,version:requestedVersion});
       else if(!restored&&!requestedLaw)loadCatalogLaw('HGA-001',{initial:true});
     }
   }
 }catch(e){$('catalog-status').textContent='Catalog could not be loaded: '+e.message+'. Custom drafting is still available.';}
 finally{catalogBusy=false;controls();}
}
$('catalog-search').addEventListener('input',()=>fillCatalog());
$('catalog-law').addEventListener('change',controls);
$('catalog-load').addEventListener('click',()=>loadCatalogLaw($('catalog-law').value));
$('catalog-refresh').addEventListener('click',()=>void refreshCatalog(false));
function restoreResearchBaseline(){
 if(!requestedResearchRun)return false;
 if(active){status('A saved run is active. Resume or discard it before opening a research baseline.');return false;}
 let r;try{r=findResearchRound(localStorage,requestedResearchRun)}catch{}
 if(!r||r.origin.lawId!==requestedLaw||!validRound(r)){status('Research baseline unavailable in this browser. No stored draft was replaced.');return false;}
 if(restored)archiveCurrent();
 history=[r,...history.filter(old=>old.id!==r.id)].slice(0,HISTORY_LIMIT);
 loadDraft(r);shown=r;historyUI(r.id);syncUrl();save();render();
 status('Research baseline restored · '+fmt(r.done)+' evaluated. Improve the draft or edit assumptions, then run a matched round.');
 return true;
}
const loadedResearch=restoreResearchBaseline();
void refreshCatalog(!loadedResearch&&!requestedResearchRun);

