// Homepage workshop controller. This is a planning UI, not a worker control API.
const root=document.getElementById('communal-science-lab');
if(root){
const $=id=>document.getElementById(id);
const make=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n};
const benches=[
 ['Evidence','✦',['Source scout','Evidence mapper','Methods checker','Context researcher','Citation checker'],'Source brief with verifiable references and uncertainties'],
 ['Challenges','◇',['Objection analyst','Access reviewer','Cost challenger','Failure analyst','Assumption critic'],'Strong objections, implementation risks and unanswered questions'],
 ['Scenarios','▦',['Scenario designer','Model builder','Sensitivity analyst','Data checker','Visualization maker'],'Baseline, alternatives, assumptions, reproducible runs and limits'],
 ['Draft & review','✎',['Clause drafter','Plain-language editor','Revision checker','Review packager','Review queue steward'],'Proposed wording, exact changes and a human review packet']
];
let selectedRole=null,boardPromise=null,view=null;
const url=()=>new URL(location.href);
function showView(next,{write=true}={}){
 view=next;
 for(const name of ['workshop','research']){$('research-'+name+'-panel').hidden=name!==next;$('research-'+name+'-tab').setAttribute('aria-pressed',String(name===next));}
 if(write){const u=url();u.searchParams.set('labView',next);history.replaceState(history.state,'',u);}
 if(next==='workshop')loadBoard();
}
async function loadBoard(){
 if(!boardPromise){boardPromise=import('./law-board.js').then(async m=>{await m.ready;return m}).catch(e=>{boardPromise=null;$('law-board-status').textContent='Could not load the workshop. Open the standalone law atlas to try again.';throw e});}
 try{return await boardPromise}catch{return null}
}
async function chooseFeature(id){
 const u=url();u.searchParams.set('labLaw',id);u.searchParams.set('labView','workshop');u.hash='communal-science-lab';history.replaceState(history.state,'',u);
 showView('workshop',{write:false});
 const board=await loadBoard();if(board)board.selectLaw(id);
}
$('research-workshop-tab').addEventListener('click',()=>showView('workshop'));
$('research-research-tab').addEventListener('click',()=>showView('research'));
for(const b of root.querySelectorAll('[data-research-feature]'))b.addEventListener('click',()=>chooseFeature(b.dataset.researchFeature));
function selectRole(bench,role,index){
 selectedRole={bench:bench[0],role,slot:index,output:bench[3]};
 for(const b of $('research-benches').querySelectorAll('button'))b.setAttribute('aria-pressed',String(Number(b.dataset.slot)===index));
 $('research-selected-role').textContent=role+' · '+bench[0]+' · slot '+index;
 $('research-role-output').textContent=bench[3];
 $('research-output').value=bench[3];
 $('research-mission-status').textContent='Template selected. No agent has been started.';
}
let slot=0;
for(const bench of benches){
 const card=make('article',undefined,'research-bench');
 card.append(make('span',bench[1],'research-symbol'),make('h3',bench[0]),make('p','5 planning slots','hint'));
 const slots=make('div',undefined,'research-slots');
 for(const role of bench[2]){const i=++slot,b=make('button',undefined,'research-agent');b.type='button';b.dataset.slot=String(i);b.setAttribute('aria-pressed','false');b.append(make('span',String(i).padStart(2,'0'),'research-slot-number'),make('span',role),make('small','Unassigned'));b.addEventListener('click',()=>selectRole(bench,role,i));slots.append(b);}
 card.append(slots);$('research-benches').append(card);
}
selectRole(benches[0],benches[0][2][0],1);
async function loadMissionCatalog(){
 try{
  const resp=await fetch('./public/law-catalog.json',{cache:'force-cache'});
  if(!resp.ok)throw Error('Catalog unavailable');const data=await resp.json();
  if(!Array.isArray(data.goals)||data.goals.length!==100)throw Error('Catalog unavailable');
  const select=$('research-proposal');select.replaceChildren();
  for(const law of data.goals){const o=make('option',law.id+' · '+law.title);o.value=law.id;select.append(o)}
  const id=url().searchParams.get('labLaw')||'HGA-051';if(data.goals.some(l=>l.id===id))select.value=id;
  select.disabled=false;$('research-export').disabled=false;
 }catch{$('research-mission-status').textContent='Catalog unavailable. Mission export disabled.';}
}
loadMissionCatalog();
$('research-mission-form').addEventListener('submit',event=>{
 event.preventDefault();if(!selectedRole||$('research-proposal').disabled)return;
 const question=$('research-question').value.trim(),output=$('research-output').value.trim();
 if(!question||!output){$('research-mission-status').textContent='Add a research question and expected output.';return;}
 const payload={schema:'helios-research-mission-draft/v1',status:'draft_not_scheduled',proposalId:$('research-proposal').value,inputVersion:null,requiresVersionResolution:true,...selectedRole,question,output,minutes:Number($('research-minutes').value),budgetUsd:Number($('research-budget').value),requiresHumanReview:true};
 const link=make('a');const objectUrl=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)+'\n'],{type:'application/json'}));link.href=objectUrl;link.download='helios-research-mission.json';link.click();setTimeout(()=>URL.revokeObjectURL(objectUrl),1000);
 $('research-mission-status').textContent='Mission draft downloaded. Nothing was queued or transmitted.';
});
const requested=url().searchParams;
if(requested.has('labLaw')||requested.get('labView')==='workshop')showView('workshop',{write:false});
else if(requested.get('labView')==='research')showView('research',{write:false});
}
