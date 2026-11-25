import {AXES,MAX_POPULATION,GPU_BATCH,CPU_BATCH,BINS,VERSION,hash,evaluate,cpuBatch,assertBatch,createGPU,suggestEffects,validEffects} from './consensus-world-engine.js';
import {initWorkshop} from './consensus-world-workshop.js';
const $=id=>document.getElementById(id), fmt=n=>Number(n).toLocaleString('en-US'), pct=(n,d)=>d? (n/d*100).toFixed(2)+'%':'—';
const seed=20261125, key='helios.consensus-world.v1', choices=['Yes','Not sure','No'];
const validPops=[100000,1000000,10000000,100000000,MAX_POPULATION];
let effects=Array(8).fill(0),reasons=Array(8).fill('Unknown / not assessed'),history=[],active=null,shown=null,busy=false,stop=false,gpu=null,backend='Not started',storageOK=true,dirty=false;
const axisInputs=[],axisReasons=[];
for(let i=0;i<AXES.length;i++){
  const wrap=document.createElement('div');wrap.className='axis';
  const label=document.createElement('label');label.htmlFor='effect-'+i;label.textContent=AXES[i];
  const select=document.createElement('select');select.id=label.htmlFor;
  for(let v=-2;v<=2;v++){const o=document.createElement('option');o.value=v;o.textContent=v===0?'0 · unknown':v>0?'+'+v:String(v);select.append(o);}
  const reason=document.createElement('small');
  select.addEventListener('change',()=>{effects[i]=Number(select.value);reasons[i]='Manually assessed';reason.textContent=reasons[i];save();});
  wrap.append(label,select,reason);$('axes').append(wrap);axisInputs.push(select);axisReasons.push(reason);
}
function draft(){return {bill:$('bill').value,effects:[...effects],reasons:[...reasons],population:Number($('population').value),day:Number($('day').value),baseline:$('baseline').value,dirty};}
function validDraft(d){return d&&typeof d.bill==='string'&&d.bill.length<=12000&&validEffects(d.effects)&&Array.isArray(d.reasons)&&d.reasons.length===8&&d.reasons.every(x=>typeof x==='string')&&validPops.includes(d.population)&&Number.isInteger(d.day)&&d.day>=0&&d.day<=1000000;}
function validRound(r){if(!validDraft(r)||!Number.isSafeInteger(r.done)||r.done<0||r.done>r.population||typeof r.id!=='string'||!Array.isArray(r.bins)||r.bins.length!==BINS||!validEffects(r.prior)||typeof r.compare!=='boolean'||r.seed!==seed)return false;try{assertBatch(r.bins,r.done,r.compare);return true;}catch{return false;}}
function loadDraft(d){
  $('bill').value=d.bill;$('population').value=d.population;$('day').value=d.day;
  effects=[...d.effects];reasons=[...d.reasons];dirty=!!d.dirty;
  axisInputs.forEach((el,i)=>{el.value=effects[i];axisReasons[i].textContent=reasons[i];});
}
function save(){
  try{localStorage.setItem(key,JSON.stringify({version:VERSION,draft:draft(),history,active}));storageOK=true;}
  catch{storageOK=false;}
}
function historyUI(selected=$('baseline').value){
  const list=$('history'),select=$('baseline');list.replaceChildren();select.replaceChildren(new Option('No baseline',''));
  for(const r of history){
    select.add(new Option('Day '+r.day+' · '+pct(r.bins[0],r.population)+' yes · '+r.bill.slice(0,46),r.id));
    const btn=document.createElement('button');btn.type='button';btn.disabled=!!active||busy;btn.textContent='Day '+r.day+' · '+fmt(r.population)+' · '+pct(r.bins[0],r.population)+' yes — '+r.bill.slice(0,80);
    btn.addEventListener('click',()=>{if(active||busy)return;loadDraft(r);shown=r;historyUI(r.id);render();save();});list.append(btn);
  }
  if(history.some(r=>r.id===selected))select.value=selected;
  else select.value='';
  if(!history.length)list.textContent='Completed rounds will appear here.';
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
}
function paint(r){
  const c=$('particles'),ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);
  const n=r?.done||0,colors=['#baf2be','#f3ca87','#ffaaa1'];
  for(let i=0;i<640;i++){
    const t=hash(i+119)*n/4294967296;
    const color=n?colors[t<r.bins[0]?0:t<r.bins[0]+r.bins[1]?1:2]:'#35504b';
    ctx.fillStyle=color;ctx.globalAlpha=.55+(hash(i+31)%45)/100;
    ctx.beginPath();ctx.arc(10+i%40*15.8+(hash(i+42)%5)-2,10+Math.floor(i/40)*12+(hash(i+17)%5)-2,3,0,Math.PI*2);ctx.fill();
  }ctx.globalAlpha=1;
}
function render(){
  const r=active||shown,n=r?.done||0,bins=r?.bins||Array(BINS).fill(0);
  $('progress').max=r?.population||1;$('progress').value=n;$('count').textContent=fmt(n)+' / '+fmt(r?.population||Number($('population').value))+' evaluated';
  ['yes','unsure','no'].forEach((id,i)=>{$(id).textContent=n?pct(bins[i],n):'—';$(id).title=fmt(bins[i])+' votes';$('bar'+i).style.width=(n?bins[i]/n*100:0)+'%';});
  const complete=r&&n===r.population;
  $('verdict').textContent=!r?'No round yet.':!complete?'Partial result · '+fmt(bins[0])+' yes, '+fmt(bins[1])+' unsure, '+fmt(bins[2])+' no.':bins[0]===r.population?'Unanimous synthetic support: every evaluated agent said yes. Not real consent.':fmt(bins[1]+bins[2])+' of '+fmt(r.population)+' synthetic agents did not say yes.';
  const o=$('objections');o.replaceChildren();
  for(const i of [...AXES.keys()].sort((a,b)=>bins[12+b]-bins[12+a])){
    const el=document.createElement('div');el.className='objection';const name=document.createElement('span');name.textContent=AXES[i];
    const value=document.createElement('small');value.textContent=fmt(bins[12+i]);const bar=document.createElement('progress');bar.max=bins[1]+bins[2]||1;bar.value=bins[12+i];bar.setAttribute('aria-label',AXES[i]);el.append(name,value,bar);o.append(el);
  }
  $('compare-note').textContent=r?.compare?'Matched IDs · '+fmt(bins[6]+bins[9])+' switched to yes; '+fmt(bins[4]+bins[5])+' switched away from yes. '+(complete?'Complete.':'Partial counts.'):'No matched baseline for this round.';
  const matrix=$('matrix');matrix.replaceChildren();
  choices.forEach((name,i)=>{const tr=document.createElement('tr'),th=document.createElement('th');th.scope='row';th.textContent=name;tr.append(th);for(let j=0;j<3;j++){const td=document.createElement('td');td.textContent=r?.compare?fmt(bins[3+i*3+j]):'—';tr.append(td);}matrix.append(tr);});
  paint(r);controls();
}
function interpret(){
  const s=suggestEffects($('bill').value);effects=s.effects;reasons=s.reasons;dirty=false;
  axisInputs.forEach((el,i)=>{el.value=effects[i];axisReasons[i].textContent=reasons[i];});save();
}
$('interpret').addEventListener('click',()=>{interpret();status('Suggested assumptions updated. Review each effect before running.');});
$('bill').addEventListener('input',()=>{dirty=true;save();status('Draft changed. Review or regenerate the assumptions before running.');});
for(const id of ['population','day','baseline'])$(id).addEventListener('change',save);
$('clear').addEventListener('click',()=>{if(!confirm('Clear current draft? Completed rounds are retained.'))return;$('bill').value='';interpret();status('Ready for a new bill.');});
$('pause').addEventListener('click',()=>{stop=true;controls();status('Pausing after the current completed batch…');});
$('discard').addEventListener('click',()=>{if(busy||!active||!confirm('Discard the unfinished run?'))return;active=null;shown=history[0]||null;save();render();status('Checkpoint discarded.');});
$('run').addEventListener('click',run);
async function run(){
  if(busy)return;
  if(!active){
    const d=draft();if(!validDraft(d)||!d.bill.trim()){status('Enter a bill and a valid simulated day.');return;}
    if(dirty&&!confirm('The draft text changed. Keep the current assumptions instead of regenerating them?'))return;
    const prior=history.find(r=>r.id===d.baseline);
    if(prior&&(prior.population!==d.population||prior.day!==d.day)){status('Choose a baseline with the same population and day, or select No baseline.');return;}
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
      let bins;
      try{bins=gpu?await gpu.batch(req):cpuBatch(req);assertBatch(bins,count,r.compare);}
      catch(e){if(gpu){gpu.close();gpu=null;backend='CPU fallback after GPU failure';continue;}throw e;}
      for(let i=0;i<BINS;i++)r.bins[i]+=bins[i];r.done+=count;
      assertBatch(r.bins,r.done,r.compare);const now=performance.now();if(now-lastPaint>=250||r.done===r.population||stop){save();render();status(backend+' · '+pct(r.done,r.population)+' complete');lastPaint=now;}
      await new Promise(resolve=>setTimeout(resolve,0));
    }
    if(active.done===active.population){
      const completed=active;history=[completed,...history.filter(r=>r.id!==completed.id)].slice(0,20);active=null;shown=completed;historyUI(completed.id);save();status(backend+' · round complete.');
    }else{save();status('Paused · '+fmt(active.done)+' agents evaluated. Resume whenever you like.');}
  }catch(err){save();status('Round stopped: '+err.message+' · last completed checkpoint retained.');}
  finally{busy=false;stop=false;gpu?.close();gpu=null;render();}
}
$('inspect').addEventListener('click',()=>{
  const r=active||shown,id=Number($('agent').value);
  if(!r||!Number.isSafeInteger(id)||id<0||id>=r.population){$('agent-result').textContent='Choose a valid ID in the last round.';return;}
  const e=evaluate(id,r.effects,r.seed,r.day);
  const order=[...AXES.keys()].sort((a,b)=>e.weights[b]-e.weights[a]);
  $('agent-result').textContent='Agent '+fmt(id)+': '+choices[e.vote]+(id>=r.done?' (preview; not yet counted)':'')+'. Model score '+e.score+'. Highest weights: '+order.slice(0,3).map(i=>AXES[i]+' '+e.weights[i]+'/8').join(', ')+'.';
});
$('export').addEventListener('click',()=>{
  const blob=new Blob([JSON.stringify({version:VERSION,draft:draft(),history,active},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='helios-consensus-world.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
try{
  const stored=JSON.parse(localStorage.getItem(key)||'null');
  if(stored?.version===VERSION){
    history=Array.isArray(stored.history)?stored.history.filter(r=>validRound(r)&&r.done===r.population).slice(0,20):[];
    active=validRound(stored.active)&&stored.active.done<stored.active.population?stored.active:null;
    // Recover a completed run if the page closed before finalizing its history.
    if(validRound(stored.active)&&stored.active.done===stored.active.population&&!history.some(r=>r.id===stored.active.id))history.unshift(stored.active);
    const d=active||stored.draft;if(validDraft(d))loadDraft(d);else interpret();
    shown=active||history[0]||null;historyUI(d?.baseline||'');
    if(active)status('Saved checkpoint · '+fmt(active.done)+' evaluated. Resume when ready.');
  }else{interpret();historyUI();}
}catch{interpret();historyUI();status('Unable to restore local draft; started a new experiment.');}
render();

function matchingRound(d){
  return history.find(r=>r.done===r.population&&r.bill===d.bill&&r.population===d.population&&r.day===d.day&&r.effects.every((v,i)=>v===d.effects[i]));
}
initWorkshop({
  getDraft:draft,
  getRound:matchingRound,
  canOpen:()=>!active&&!busy,
  getSeed:()=>seed,
  apply:({original,bill,effects:next,reasons:why,runNow})=>{
    if(active||busy||!validEffects(next)||!bill.trim()||bill.length>12000)return false;
    const current=draft();
    if(current.bill!==original.bill||current.day!==original.day||current.population!==original.population||current.effects.some((v,i)=>v!==original.effects[i]))return false;
    const prior=matchingRound(original);
    loadDraft({...current,bill,effects:next,reasons:why,dirty:false});
    historyUI(prior?.id||'');save();render();
    status(prior?'Revision ready · matched baseline selected.':'Revision ready · no completed matching original; run without baseline or restore the original first.');
    if(runNow&&prior)void run();
    return true;
  }
});
