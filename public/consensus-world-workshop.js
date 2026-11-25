import {AXES,validEffects} from './consensus-world-engine.js';
import {MODES,rankDiagnostics,quickCompare,localRevision,proposedEffects} from './consensus-world-workshop-logic.js';
const $=id=>document.getElementById(id);
const endpoint='/.netlify/functions/consensus-revise';
export function initWorkshop({getDraft,getRound,canOpen,getSeed,apply}){
 let original=null,baseline=null,diagnostics=[],modes=new Set(['objections']),effects=[],reasons=[],configured=false,pending=false,requestId=0,generatedText='';
 const modal=$('workshop'), modeContainer=$('workshop-modes'), inputs=[],reasonEls=[];
 const pct=(n,total)=>(100*n/total).toFixed(2)+'%';
 const msg=s=>$('workshop-status').textContent=s;
 function modesUI(){
  modeContainer.replaceChildren();
  for(const [id,label] of MODES){const b=document.createElement('button');b.type='button';b.textContent=label;b.setAttribute('aria-pressed',String(modes.has(id)));b.onclick=()=>{if(modes.has(id))modes.delete(id);else modes.add(id);modesUI();controls();};b.disabled=pending;modeContainer.append(b);}
 }
 function controls(){
  $('workshop-local').disabled=pending||!modes.size;
  $('workshop-ai').disabled=pending||!configured||!$('workshop-consent').checked||(!modes.size&&!$('workshop-prompt').value.trim());
  $('workshop-apply').disabled=pending||!$('workshop-revision').value.trim();
  $('workshop-run').disabled=pending||!baseline||!$('workshop-revision').value.trim();
  $('workshop-assess').disabled=pending;$('workshop-reset').disabled=pending;
  $('workshop-revision').disabled=pending;$('workshop-prompt').disabled=pending;$('workshop-consent').disabled=pending;
  inputs.forEach(el=>el.disabled=pending);
 }
 for(let i=0;i<AXES.length;i++){
  const row=document.createElement('div');row.className='axis';
  const label=document.createElement('label');label.textContent=AXES[i];label.htmlFor='workshop-axis-'+i;
  const input=document.createElement('select');input.id=label.htmlFor;
  for(let v=-2;v<=2;v++){const opt=document.createElement('option');opt.value=v;opt.textContent=v===0?'0 · unknown':v>0?'+'+v:String(v);input.append(opt);}
  const reason=document.createElement('small');input.onchange=()=>{effects[i]=Number(input.value);reasons[i]='Manually assessed in workshop';reason.textContent=reasons[i];updatePreview();};
  row.append(label,input,reason);$('workshop-effects').append(row);inputs.push(input);reasonEls.push(reason);
 }
 function setEffects(next,why){effects=[...next];reasons=[...why];inputs.forEach((el,i)=>{el.value=effects[i];reasonEls[i].textContent=reasons[i];});updatePreview();}
 function updatePreview(){
  if(!original||!validEffects(effects))return;
  const q=quickCompare(original.effects,effects,getSeed(),original.day,original.population);
  $('workshop-before').textContent=pct(q.before,q.count);$('workshop-after').textContent=pct(q.after,q.count);
  const delta=100*(q.after-q.before)/q.count;$('workshop-delta').textContent=(delta>=0?'+':'')+delta.toFixed(2)+' pp';
  $('workshop-delta').className=delta>=0?'yes':'no';
  [...$('workshop-bar').children].forEach((el,i)=>el.style.width=(100*q.bins[i]/q.count)+'%');
  $('workshop-transitions').textContent=q.toYes.toLocaleString()+' switched to yes · '+q.away.toLocaleString()+' switched away from yes · '+q.count.toLocaleString()+' matched synthetic IDs. Conditional on assumptions.';
 }
 function showResult(result,source){
  if(!result||typeof result.revision!=='string'||!result.revision.trim()||result.revision.length>12000)throw Error('Invalid proposed revision.');
  generatedText=result.revision;$('workshop-revision').value=generatedText;
  $('workshop-changes').replaceChildren();
  for(const c of (result.changes||[]).slice(0,20)){const li=document.createElement('li');li.textContent=c.objection+' — '+c.compromise;$('workshop-changes').append(li);}
  $('workshop-result').hidden=false;
  setEffects(original.effects,original.reasons.map(x=>'Original: '+x));
  msg(source+' · original assumptions retained. Review and adjust them; no benefits are assumed automatically.');
  controls();
 }
 async function open(){
  if(!canOpen())return;
  original=getDraft();if(!original.bill.trim()){$('bill').focus();return;}
  baseline=getRound(original);const q=quickCompare(original.effects,original.effects,getSeed(),original.day,original.population);
  diagnostics=rankDiagnostics(baseline?.bins||q.bins);
  const total=baseline?.population||q.count;
  $('workshop-source').textContent=(baseline?'Completed matching round':'Quick diagnostic · current assumptions')+' · '+total.toLocaleString()+' synthetic IDs. Lowest weighted contribution among non-yes agents; not human statements.';
  $('workshop-objections').replaceChildren();
  for(const d of diagnostics.filter(d=>d.count>0).slice(0,5)){const li=document.createElement('li');li.textContent=d.axis+' · '+d.count.toLocaleString()+' non-yes agents';$('workshop-objections').append(li);}
  if(!diagnostics.some(d=>d.count)){const li=document.createElement('li');li.textContent='No non-yes agents in this model run; still review real-world risks.';$('workshop-objections').append(li);}
  $('workshop-original').textContent=original.bill;
  $('workshop-baseline').textContent=baseline?'Original round preserved. Keep and run uses the exact same population and day.':'No completed matching baseline. Close and run the original first for a full matched comparison. You can still keep a draft.';
  modes=new Set(['objections']);pending=false;configured=false;$('workshop-consent').checked=false;$('workshop-prompt').value='';$('workshop-result').hidden=true;$('workshop-revision').value='';generatedText='';msg('');
  $('workshop-ai-config').textContent='Checking optional AI availability…';
  modesUI();controls();modal.showModal();
  const token=++requestId;
  try{const res=await fetch(endpoint,{cache:'no-store',signal:AbortSignal.timeout(5000)});if(!res.ok)throw Error();const data=await res.json();if(token!==requestId||!modal.open)return;configured=data.enabled===true;$('workshop-ai-config').textContent=configured?'AI drafting is available; consent is required.':'AI drafting is not configured. Local drafting works offline.';}
  catch{if(token!==requestId||!modal.open)return;$('workshop-ai-config').textContent='AI drafting unavailable. Local drafting works offline.';}
  controls();
 }
 $('improve').onclick=open;$('improve-objections').onclick=open;
 $('workshop-close').onclick=()=>modal.close();
 modal.addEventListener('close',()=>{requestId++;pending=false;});
 $('workshop-consent').onchange=controls;$('workshop-prompt').oninput=controls;
 $('workshop-local').onclick=()=>{try{showResult(localRevision({bill:original.bill,modes:[...modes],diagnostics}),'Local template');}catch(err){msg(err.message);}};
 $('workshop-ai').onclick=async()=>{
  if(pending||!configured||!$('workshop-consent').checked)return;
  const token=++requestId;pending=true;modesUI();controls();msg('Generating proposed revision…');
  try{
   const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(30000),body:JSON.stringify({consent:true,bill:original.bill,modes:[...modes],prompt:$('workshop-prompt').value,diagnostics:diagnostics.map(({axis,count})=>({axis,count}))})});
   if(!response.ok)throw Error('AI drafting unavailable or rate limited. Try a local draft.');
   const result=await response.json();if(token!==requestId||!modal.open)return;showResult(result,'AI suggestion');
  }catch(err){if(token===requestId&&modal.open)msg(err.message);}
  finally{if(token===requestId&&modal.open){pending=false;modesUI();controls();}}
 };
 $('workshop-assess').onclick=()=>{const v=proposedEffects($('workshop-revision').value);setEffects(v.effects,v.reasons.map(x=>'Unverified rule suggestion: '+x));msg('Review every suggested effect. Wording and proposed safeguards are not proof of outcomes.');};
 $('workshop-reset').onclick=()=>setEffects(original.effects,original.reasons);
 $('workshop-revision').oninput=()=>{controls();if($('workshop-revision').value!==generatedText)msg('Revision edited. Reassess policy assumptions before keeping it.');};
 function keep(runNow){
  const bill=$('workshop-revision').value.trim();
  if(!bill||!validEffects(effects))return;
  if(bill===original.bill&&effects.every((v,i)=>v===original.effects[i])){msg('No changes to keep.');return;}
  if(!apply({original,bill,effects,reasons,runNow})){msg('The original changed or the lab is busy. Close and reopen the workshop.');return;}
  modal.close();
 }
 $('workshop-apply').onclick=()=>keep(false);$('workshop-run').onclick=()=>keep(true);
}
