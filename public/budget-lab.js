import {categories,TOTAL,baseline,total,valid,available,transfer,equivalent} from './budget-model.js';
const $=id=>document.getElementById(id),make=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e};
const fmt=n=>Number(n).toLocaleString('en-US'),money=n=>'$'+fmt(n)+'m',signed=n=>(n>0?'+':n<0?'−':'')+money(Math.abs(n)),dollars=n=>'$'+fmt(n);
const byId=new Map(categories.map(c=>[c.id,c]));
let plan=baseline(),history=[];
const from=$('budget-from'),to=$('budget-to'),amount=$('budget-amount');
for(const c of categories)for(const select of [from,to]){const o=make('option',c.name);o.value=c.id;select.append(o)}
from.value='admin';to.value='transport';amount.value='2';
function openBudget(open=true){$('budget-lab').hidden=!open;$('budget-open').setAttribute('aria-expanded',String(open));$('budget-open').textContent=open?'Hide budget redesign':'Redesign the budget';if(open){render();$('budget-lab').scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'})}}
$('budget-open').addEventListener('click',()=>openBudget($('budget-lab').hidden));
function syncChoices(changed){
 if(from.value===to.value){const other=categories.find(c=>c.id!==changed.value);(changed===from?to:from).value=other.id;}
 const max=available(plan,from.value,to.value);amount.max=String(max);amount.disabled=max===0;
 amount.value=String(Math.min(max,Math.max(max?1:0,Number(amount.value)||0)));
 render();
}
function drawBar(root,value,color,max){const track=make('span',undefined,'budget-bar');const fill=make('span');fill.style.width=(value/max*100)+'%';fill.style.background=color;track.append(fill);root.append(track)}
function preview(){
 const n=Number(amount.value);return n>0&&n<=available(plan,from.value,to.value)?transfer(plan,from.value,to.value,n):plan;
}
function drawAllocations(next){
 const root=$('budget-allocations');root.replaceChildren();const max=Math.max(1,...categories.map(c=>Math.max(c.base,next[c.id])));
 for(const c of categories){
  const row=make('div',undefined,'budget-allocation');row.dataset.category=c.id;
  const label=make('div',undefined,'budget-category');label.append(make('strong',c.name),make('small','Illustrative floor '+money(c.floor)));row.append(label);
  const base=make('div',undefined,'budget-column');base.append(make('span',money(c.base)));drawBar(base,c.base,'#83918c',max);row.append(base);
  const proposed=make('div',undefined,'budget-column');proposed.append(make('span',money(next[c.id])));drawBar(proposed,next[c.id],c.color,max);row.append(proposed);
  const delta=next[c.id]-c.base;const change=make('strong',signed(delta),'budget-delta');change.dataset.sign=delta>0?'plus':delta<0?'minus':'zero';row.append(change);root.append(row);
 }
}
function describeImpact(c,n,positive){
 const box=make('article',undefined,'budget-impact');box.append(make('strong',positive?'Potential gain · '+c.name:'Opportunity cost · '+c.name));
 const e=equivalent(n,c.cost);box.append(make('p',fmt(e.central)+' '+c.unit+' at the assumed '+dollars(c.cost)+' per unit-year.'));box.append(make('small','Cost sensitivity: '+fmt(e.low)+'–'+fmt(e.high)+' resource equivalents.'));box.append(make('p',positive?c.why:c.risk));return box;
}
function render(){
 if(!valid(plan))throw Error('Invalid budget state');
 const max=available(plan,from.value,to.value);amount.max=String(max);amount.disabled=max===0;const n=Math.min(max,Math.max(0,Number(amount.value)||0));amount.value=String(n);const next=preview();
 $('budget-amount-value').textContent=money(n);$('budget-limit').textContent=money(max)+' available above the illustrative floor.';
 $('budget-apply').disabled=n===0;$('budget-undo').disabled=!history.length;
 $('budget-baseline-total').textContent=money(TOTAL);$('budget-proposed-total').textContent=money(total(next));$('budget-balance').textContent=money(TOTAL-total(next));
 $('budget-transfer-label').textContent=n?money(n)+' from '+byId.get(from.value).name+' to '+byId.get(to.value).name:'No funded transfer selected.';
 $('budget-why-title').textContent=n?'How and why might this transfer work?':history.length?'How and why might the last applied transfer work?':'How and why might a transfer work?';
 $('budget-current-note').textContent=history.length+' applied transfer'+(history.length===1?'':'s')+(n?' · chart includes the next preview':' · chart shows applied plan');
 drawAllocations(next);
 const root=$('budget-impacts');root.replaceChildren();
 if(n){root.append(describeImpact(byId.get(to.value),n,true),describeImpact(byId.get(from.value),n,false))}
 else if(history.length){const h=history.at(-1);root.append(describeImpact(byId.get(h.to),h.amount,true),describeImpact(byId.get(h.from),h.amount,false))}
 else root.append(make('p','Choose a funded transfer to see the possible capacity gain and what the donor department might give up.','muted'));
 const log=$('budget-history');log.replaceChildren();if(!history.length)log.append(make('li','No applied changes yet.'));else for(const h of history)log.append(make('li',money(h.amount)+' from '+byId.get(h.from).name+' to '+byId.get(h.to).name));
}
from.addEventListener('change',()=>syncChoices(from));to.addEventListener('change',()=>syncChoices(to));amount.addEventListener('input',render);
$('budget-apply').addEventListener('click',()=>{
 const n=Number(amount.value);if(!n)return;history.push({before:{...plan},from:from.value,to:to.value,amount:n});plan=transfer(plan,from.value,to.value,n);
 amount.value='0';$('budget-status').textContent='Transfer applied to your local draft. No government budget was changed.';render();
});
$('budget-undo').addEventListener('click',()=>{if(!history.length)return;plan=history.pop().before;amount.value='0';$('budget-status').textContent='Last transfer undone.';syncChoices(from);amount.value='0';render()});
$('budget-reset').addEventListener('click',()=>{plan=baseline();history=[];from.value='admin';to.value='transport';amount.value='0';$('budget-status').textContent='Original illustrative budget restored.';syncChoices(from);amount.value='0';render()});
$('budget-export').addEventListener('click',()=>{
 const data={kind:'helios-fictional-budget-draft',annualEnvelopeMillions:TOTAL,baseline:baseline(),appliedPlan:plan,transfers:history.map(({from,to,amount})=>({from,to,amountMillions:amount})),assumptions:categories.map(({id,floor,cost,unit})=>({id,illustrativeFloorMillions:floor,illustrativeAnnualCost:cost,unit})),note:'Illustrative allocations, not an actual budget or a forecast. Only applied transfers are exported.'};
 const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)+'\n'],{type:'application/json'})),a=make('a');a.href=url;a.download='helios-budget-draft.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);$('budget-status').textContent='Applied plan exported locally.';
});
syncChoices(from);
if(location.hash==='#budget-lab')openBudget();
window.addEventListener('hashchange',()=>{if(location.hash==='#budget-lab')openBudget()});
