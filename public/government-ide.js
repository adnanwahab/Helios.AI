import {sampleBoard} from './constitution-model.js';
import {simulate,modelFor} from './law-simulator.js';

const $=id=>document.getElementById(id);
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n};
const fields=[{id:'goal',name:'Shared goal',key:'sharedGoal',max:4000},{id:'implementation',name:'Implementation',key:'illustrativeLocalOption',max:6000},{id:'safeguards',name:'Risks & safeguards',key:'risksAndSafeguards',max:4000}];
const fmt=n=>Number(n).toLocaleString(undefined,{maximumFractionDigits:1});
const preview=/^deploy-preview-\d+--heliosailol\.netlify\.app$/.test(location.hostname)||location.hostname.endsWith('github.io');
const routePath='/constitution';
let laws=new Map(),community=new Map(sampleBoard().clauses.map(r=>[r.id,r])),connected=false,busy=false,selection=null,history=null,historyTicket=0,tab='discussion',lastWrite=null;
const practiceVotes=new Map(),practiceComments=new Map(),practiceUpdates=new Map(),drafts=new Map(),scenarios=new Map();
const related={'S-001':['HGA-093','HGA-095'],'S-002':['HGA-011','HGA-012'],'S-003':['HGA-051','HGA-052'],'S-004':['HGA-040','HGA-039'],'S-005':['HGA-075'],'S-006':['HGA-081'],'S-007':['HGA-027'],'S-009':['HGA-091'],'S-010':['HGA-078'],'S-011':['HGA-095'],'S-012':['HGA-011','HGA-012']};
const initial={kind:'law',id:'HGA-012',field:'implementation',revision:null};
function readRoute(){
 const p=new URLSearchParams(location.search);
 if(p.has('community'))return {kind:'community',id:p.get('community'),field:null,revision:null};
 const f=p.get('clause');
 return {kind:'law',id:p.get('law')||initial.id,field:fields.some(x=>x.id===f)?f:initial.field,revision:p.get('revision')||null};
}
function href(s){const p=new URLSearchParams();if(s.kind==='community')p.set('community',s.id);else{p.set('law',s.id);p.set('clause',s.field);if(s.revision)p.set('revision',s.revision)}return routePath+'?'+p.toString()}
function row(){return selection?.kind==='law'?laws.get(selection.id):community.get(selection?.id)}
function field(){return fields.find(f=>f.id===selection?.field)||fields[0]}
function revision(){return row()?.law?.versionId||null}
function stale(){return selection.kind==='law'&&!!selection.revision&&selection.revision!==revision()}
function key(s=selection){return s.kind+':'+s.id+':'+(s.kind==='law'?(s.revision||laws.get(s.id)?.law.versionId||'editorial'):'clause')}
function draftKey(){return key()+':'+selection.field}
function status(id,msg,error=false){$(id).textContent=msg;$(id).classList.toggle('error',error)}
function valid(s){return s.kind==='law'?laws.has(s.id):community.has(s.id)}
function updateLink(){const url=href(selection);$('permalink').href=url}
function saveDraft(){
 if(selection?.kind!=='law'||$('edit-form').hidden)return;
 drafts.set(draftKey(),{text:$('edit-text').value,reason:$('edit-reason').value});
}
function navigate(s,{replace=false,fromPop=false,keepQuery=false}={}){
 if(!valid(s))return;
 saveDraft();
 // Never transfer unsent consent or a community comment to another record.
 $('comment-text').value='';$('comment-consent').checked=false;$('edit-consent').checked=false;
 if(!fromPop){if(s.kind==='law'&&!s.revision&&connected)s={...s,revision:laws.get(s.id).law.versionId};const next=href(s);if(location.pathname+location.search!==next)window.history[replace?'replaceState':'pushState'](null,'',next)}
 selection=s;history=null;historyTicket++;tab='discussion';$('edit-form').hidden=true;$('edit-toggle').setAttribute('aria-expanded','false');
 if(!keepQuery){$('search').value='';$('category').value=''}
 status('editor-status','');status('review-status','');render();if(connected&&s.kind==='law')loadHistory();
}
function selectLaw(id,f='goal'){if(!busy)navigate({kind:'law',id,field:f,revision:null},{keepQuery:true})}
function selectCommunity(id){if(!busy)navigate({kind:'community',id,field:null,revision:null},{keepQuery:true})}
function showDataset(kind){if(busy)return;const id=kind==='law'?(laws.has(selection?.id)?selection.id:initial.id):community.keys().next().value;if(id)kind==='law'?selectLaw(id,initial.field):selectCommunity(id)}
function treeButton(label,sub,cls,active,click){const b=el('button',undefined,cls);b.type='button';if(sub)b.append(el('small',sub));b.append(document.createTextNode(label));if(active)b.setAttribute('aria-current','true');b.disabled=busy;b.addEventListener('click',click);return b}
function renderTree(){
 const root=$('tree'),query=$('search').value.trim().toLowerCase(),cat=$('category').value,kind=selection.kind;
 root.replaceChildren();$('show-laws').setAttribute('aria-pressed',String(kind==='law'));$('show-community').setAttribute('aria-pressed',String(kind==='community'));$('category').hidden=kind==='community';
 let count=0;
 if(kind==='law'){
  for(const {law} of laws.values()){
   if(cat&&law.category!==cat)continue;
   const matches=fields.filter(f=>[f.name,law[f.key]].some(v=>String(v||'').toLowerCase().includes(query)));
   const lawMatch=[law.id,law.title,law.category,law.sourceProposalTitle].some(v=>String(v||'').toLowerCase().includes(query));
   if(query&&!lawMatch&&!matches.length)continue;
   count++;const active=selection.id===law.id;
   const b=treeButton(law.title,law.id,'law',active,()=>selectLaw(law.id,query&&!lawMatch&&matches.length?matches[0].id:'goal'));b.dataset.law=law.id;root.append(b);
   if(active||query)for(const f of (query&&!lawMatch?matches:fields)){
    const child=treeButton('§'+(fields.indexOf(f)+1)+'  '+f.name,null,'clause',active&&selection.field===f.id,()=>selectLaw(law.id,f.id));child.dataset.section=law.id+':'+f.id;root.append(child)
   }
  }
 }else for(const c of community.values()){
  if(query&&![c.id,c.topic,c.text].some(v=>String(v).toLowerCase().includes(query)))continue;
  count++;const b=treeButton(c.text,c.topic+' · '+c.id,'law',selection.id===c.id,()=>selectCommunity(c.id));b.dataset.community=c.id;root.append(b);
 }
 $('results').textContent=count+' '+(kind==='law'?'of '+laws.size+' proposals':'community clauses');
 if(!count)root.append(el('p','No results. Try a different search.','small'));
}
function renderEditor(){
 const record=row(),law=record.law,isLaw=selection.kind==='law',f=field(),old=stale();
 $('record-id').textContent=isLaw?law.id+' / '+law.category:record.id+' / COMMUNITY CLAUSE';
 $('editor-title').textContent=isLaw?law.title:record.topic;
 $('revision').textContent=isLaw?(connected?'Revision '+law.version:'Editorial draft'):(record.source==='synthetic'?'Synthetic source':'Community');
 $('record-summary').textContent=isLaw?(law.sourceProposalTitle||'Voluntary editorial proposal'):'Standalone clause · not automatically equivalent to a law proposal.';
 const sections=$('sections');sections.replaceChildren();sections.hidden=!isLaw;
 if(isLaw)for(const item of fields){const b=el('button',item.name);b.type='button';b.dataset.editorSection=item.id;b.setAttribute('aria-pressed',String(f.id===item.id));b.disabled=busy;b.addEventListener('click',()=>selectLaw(law.id,item.id));sections.append(b)}
 $('revision-warning').hidden=!old;
 if(old)$('revision-message').textContent=connected?'This link names a different revision. Current wording is shown; reviewing or editing is disabled until you open the current revision.':'This link names a shared revision. Connect shared data to resolve it, or open the editorial draft.';
 $('clause-title').textContent=isLaw?'§'+(fields.indexOf(f)+1)+'  '+f.name:'Selected clause';
 $('published-text').textContent=isLaw?law[f.key]:record.text;
 $('edit-tools').hidden=!isLaw||old;$('edit-toggle').disabled=busy;
 const order=isLaw?fields.map(x=>x.id):[...community.keys()],at=order.indexOf(isLaw?f.id:record.id);
 $('previous').disabled=busy||at<=0;$('next').disabled=busy||at>=order.length-1;
 $('selection-count').textContent=(at+1)+' of '+order.length+' '+(isLaw?'sections':'clauses');
 updateLink();
}
function renderDiscussion(){
 const r=row(),isLaw=selection.kind==='law',root=$('discussion-list'),k=key();
 $('discussion-tab').setAttribute('aria-pressed',String(tab==='discussion'));$('history-tab').setAttribute('aria-pressed',String(tab==='history'));
 $('review-scope').textContent=isLaw?'Proposed updates to this law · not a separate clause ballot.':'Discussion and advisory vote for this community clause.';
 root.replaceChildren();
 function card(title,body){const a=el('article',undefined,'discussion-item');a.append(el('strong',title),el('p',body));root.append(a)}
 if(isLaw){
  if(tab==='history'){
   if(history)for(const v of [...history.versions].reverse())card('Revision '+v.number,v.content.sharedGoal||'');
   else card(connected?'Revision history':'Editorial draft',connected?'Loading revision history…':'Connect shared data for revision history.');
  }else{
   const updates=connected?(history?.amendments||[]):(practiceUpdates.get(k)||[]);
   for(const a of [...updates].reverse())card('Proposed update · '+a.status,a.reason+(a.proposed?.[field().key]?'\n\n'+a.proposed[field().key]:''));
   if(!updates.length)card('Discussion',connected?(history?'No proposed updates yet.':'Loading proposed updates…'):'Propose an edit in the center panel to start a practice discussion.');
  }
 }else{
  const comments=connected?r.comments:(practiceComments.get(k)||[]);
  if(tab==='history')card('Source',r.source==='synthetic'?'Synthetic sample wording. Synthetic votes are not public votes.':'Community contribution. Clause wording is not versioned by the law board.');
  else{for(const c of comments||[])card(c.status==='pending'?'Your comment · pending moderation':connected?'Approved comment':'Practice comment · not public',c.text);if(!comments?.length)card('Discussion','No '+(connected?'visible':'practice')+' comments yet.')}
 }
 $('comment-form').hidden=isLaw||tab!=='discussion';$('comment-consent').parentElement.hidden=!connected;
 const position=connected?r.myVote:practiceVotes.get(k);
 for(const b of document.querySelectorAll('[data-vote]')){b.setAttribute('aria-pressed',String(b.dataset.vote===position));b.disabled=busy||stale()}
 $('clear-vote').disabled=busy||stale();$('post-comment').disabled=busy;
 $('vote-title').textContent=isLaw?'Law revision position':'Clause position';
 $('vote-scope').textContent=isLaw?'Applies to the complete '+(connected?'current revision':'editorial proposal')+', not only this section.':'Applies to the selected community clause.';
 const counts=connected?(isLaw?r.votes:r.live):null;
 $('vote-tally').textContent=counts?['support','unsure','oppose'].map(v=>fmt(counts[v]||0)+' '+v).join(' · ')+' · advisory sessions':position?'Your practice position: '+position+'. Not sent.':'Practice only · no public counts loaded.';
 const meter=$('vote-meter');meter.replaceChildren();const total=counts?['support','unsure','oppose'].reduce((sum,v)=>sum+Number(counts[v]||0),0):0;
 if(total)for(const v of ['support','unsure','oppose']){const n=el('span',undefined,v);n.style.width=100*Number(counts[v]||0)/total+'%';meter.append(n)}
}
function settings(){const id=selection.id;if(!scenarios.has(id))scenarios.set(id,{years:5,reach:60,capacity:70,effect:20,lag:modelFor(row().law).lag});return scenarios.get(id)}
function svg(tag,attrs={},text){const n=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));if(text!==undefined)n.textContent=text;return n}
function chart(){
 if(selection.kind!=='law')return;
 const law=row().law,m=simulate(law,settings()),p=m.points,f=m.final,root=$('chart');root.replaceChildren();
 const values=p.flatMap(v=>[v.low,v.high,v.baseline,v.scenario]),lo=Math.min(...values)-2,hi=Math.max(...values)+2;
 const x=t=>42+t*496/m.assumptions.years,y=v=>15+(hi-v)*170/(hi-lo);
 for(let i=0;i<=4;i++){const val=lo+(hi-lo)*i/4,yy=y(val);root.append(svg('line',{x1:42,x2:538,y1:yy,y2:yy,stroke:'#e0e3ee','stroke-dasharray':'3 5'}),svg('text',{x:36,y:yy+4,'text-anchor':'end',fill:'#637087','font-size':10},fmt(val)))}
 const band=[...p.map(v=>x(v.year)+','+y(v.high)),...p.slice().reverse().map(v=>x(v.year)+','+y(v.low))].join(' ');
 root.append(svg('polygon',{points:band,fill:'#e2dafa'}));
 for(const [k,color,dash] of [['baseline','#8290a5','5 5'],['scenario','#6245cb','none']])root.append(svg('path',{d:p.map((v,i)=>(i?'L':'M')+x(v.year)+','+y(v[k])).join(' '),fill:'none',stroke:color,'stroke-width':k==='scenario'?3:2,'stroke-dasharray':dash}));
 for(const t of [...new Set([0,Math.round(m.assumptions.years/2),m.assumptions.years])])root.append(svg('text',{x:x(t),y:205,fill:'#637087','font-size':11,'text-anchor':t===0?'start':t===m.assumptions.years?'end':'middle'},'Year '+t));
 root.append(svg('circle',{cx:x(f.year),cy:y(f.scenario),r:4,fill:'#6245cb'}));
 root.setAttribute('aria-label',m.spec.metric+' — baseline '+fmt(f.baseline)+', scenario '+fmt(f.scenario)+' at year '+f.year);
 $('metric').textContent=m.spec.metric;$('outcome').textContent=fmt(f.scenario);$('delta').textContent=(f.scenario>f.baseline?'+':'')+fmt(f.scenario-f.baseline)+' pts';$('adoption').textContent=fmt(f.adoption)+'%';$('model-description').textContent=m.spec.family.name+' · '+m.spec.lever+'. '+m.spec.family.explain;
 for(const k of ['years','reach','capacity','effect','lag']){$(k+'-value').textContent=fmt(settings()[k])+(['years','lag'].includes(k)?' yr':'%')}
}
function renderSimulation(){
 const isLaw=selection.kind==='law';$('sim-law').hidden=!isLaw;$('sim-community').hidden=isLaw;
 $('simulation-note').textContent=isLaw?row().law.id+' · whole-proposal scenario, not a causal forecast for the selected clause.':'No direct model for this standalone clause.';
 if(isLaw){for(const k of ['years','reach','capacity','effect','lag'])$(k).value=settings()[k];
  const anchor=$('assembly-link'),chapter={'HGA-012':'homes','HGA-051':'places','HGA-091':'water'}[selection.id];anchor.hidden=!chapter;if(chapter)anchor.href='/public/helios-law-assembly.html#'+chapter;chart();
 }else{const list=$('related-laws');list.replaceChildren();for(const id of related[selection.id]||[]){const law=laws.get(id)?.law;if(!law)continue;const b=el('button',law.id+' · '+law.title,'secondary');b.type='button';b.disabled=busy;b.addEventListener('click',()=>selectLaw(id,'goal'));list.append(b)}if(!list.childElementCount)list.append(el('p','Search the proposal catalog to find a related scenario.','small'))}
}
function render(){if(!selection||!row())return;renderTree();renderEditor();renderDiscussion();renderSimulation();$('show-laws').disabled=busy;$('show-community').disabled=busy;$('connect').disabled=busy||preview;$('connect').textContent=connected?'Refresh shared data':preview?'Practice preview':'Connect shared data'}
async function request(path,options={}){const res=await fetch(path,{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000),...options});const data=await res.json().catch(()=>null);if(!res.ok||!data)throw Error(data?.error||'HTTP '+res.status);return data}
async function loadHistory(){
 const id=selection.id,ticket=++historyTicket;history=null;renderDiscussion();
 try{const data=await request('/api/law-board/'+encodeURIComponent(id));if(ticket!==historyTicket||selection.id!==id||selection.kind!=='law')return;history=data;renderDiscussion()}catch(e){if(ticket===historyTicket)status('review-status','History unavailable: '+e.message,true)}
}
async function shared(){
 const [board,clauses]=await Promise.all([request('/api/law-board'),request('/api/constitution')]);
 if(!board.writable||!Array.isArray(board.records)||board.records.length!==100||!Array.isArray(clauses.clauses))throw Error('Shared database is not ready');
 const local=['localhost','127.0.0.1'].includes(location.hostname);
 if(board.storage!=='supabase-postgres'&&!local)throw Error('Supabase shared database is not connected');
 laws=new Map(board.records.map(r=>[r.law.id,r]));community=new Map(clauses.clauses.map(r=>[r.id,r]));connected=true;$('mode').textContent=local?'Local test database':'Shared Supabase';
}
async function connect(){
 if(busy||preview)return;saveDraft();busy=true;render();status('connection-status','Loading shared law revisions and community clauses…');
 try{await request('/api/session');await shared();let s=selection;
  if(!valid(s)){s=initial;status('connection-status','Requested record is not visible; showing the editorial default.',true)}
  else status('connection-status','Shared advisory counts loaded. Practice activity was not uploaded.');
  if(s.kind==='law'&&!s.revision)s={...s,revision:laws.get(s.id).law.versionId};navigate(s,{replace:true});
 }catch(e){status('connection-status','Could not connect: '+e.message+'. '+(connected?'Last loaded records remain visible.':'Practice mode remains available.'),true)}
 finally{busy=false;render()}
}
async function write(path,payload,statusId,onSuccess){
 if(!connected||busy||stale())return;const body=JSON.stringify(payload),fingerprint=path+'|'+body;
 if(lastWrite?.fingerprint!==fingerprint)lastWrite={fingerprint,key:crypto.randomUUID()};
 busy=true;render();status(statusId,'Submitting…');
 try{const session=await request('/api/session');await request(path,{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':session.csrfToken,'Idempotency-Key':lastWrite.key},body});lastWrite=null;onSuccess();status(statusId,'Saved.');try{await shared();if(selection.kind==='law')await loadHistory()}catch(e){status(statusId,'Saved, but refresh failed: '+e.message,true)}}
 catch(e){status(statusId,'Submission not confirmed: '+e.message+' Retry unchanged or refresh the board.',true)}
 finally{busy=false;render()}
}
function openEdit(){
 if(busy||stale()||selection.kind!=='law')return;
 const d=drafts.get(draftKey()),f=field();$('edit-text').value=d?.text??row().law[f.key];$('edit-text').maxLength=f.max;$('edit-reason').value=d?.reason??'';$('edit-consent').checked=false;$('edit-consent').parentElement.hidden=!connected;
 $('save-edit').textContent=connected?'Submit for review':'Add practice update';$('edit-form').hidden=false;$('edit-toggle').setAttribute('aria-expanded','true');$('edit-text').focus();
}
$('show-laws').onclick=()=>showDataset('law');$('show-community').onclick=()=>showDataset('community');$('search').oninput=renderTree;$('category').onchange=renderTree;
$('discussion-tab').onclick=()=>{tab='discussion';renderDiscussion()};$('history-tab').onclick=()=>{tab='history';renderDiscussion()};
$('previous').onclick=()=>{if(selection.kind==='law')selectLaw(selection.id,fields[fields.indexOf(field())-1].id);else selectCommunity([...community.keys()][[...community.keys()].indexOf(selection.id)-1])};
$('next').onclick=()=>{if(selection.kind==='law')selectLaw(selection.id,fields[fields.indexOf(field())+1].id);else selectCommunity([...community.keys()][[...community.keys()].indexOf(selection.id)+1])};
$('current-version').onclick=()=>navigate({...selection,revision:null},{replace:true});
$('copy-link').onclick=async()=>{try{await navigator.clipboard.writeText(new URL(href(selection),location.origin).href);status('editor-status','Link copied.')}catch{status('editor-status','Copy the selection URL from the address bar.',true)}};
$('connect').onclick=connect;$('edit-toggle').onclick=()=>{$('edit-form').hidden?openEdit():$('cancel-edit').click()};
$('cancel-edit').onclick=()=>{saveDraft();$('edit-form').hidden=true;$('edit-toggle').setAttribute('aria-expanded','false');$('edit-toggle').focus()};
for(const id of ['edit-text','edit-reason'])$(id).oninput=()=>{$('edit-consent').checked=false;saveDraft()};
$('edit-form').onsubmit=e=>{
 e.preventDefault();if(busy||stale()||selection.kind!=='law')return;
 const law=row().law,f=field(),text=$('edit-text').value.trim(),reason=$('edit-reason').value.trim();if(!text||!reason||text===law[f.key])return status('editor-status','Change the wording and explain why.',true);
 const proposed=Object.fromEntries(fields.map(item=>[item.key,item.id===f.id?text:law[item.key]]));
 const finish=()=>{drafts.delete(draftKey());$('edit-form').hidden=true;$('edit-toggle').setAttribute('aria-expanded','false');$('edit-consent').checked=false};
 if(!connected){const k=key(),a=practiceUpdates.get(k)||[];a.push({status:'practice · not public',reason,proposed});practiceUpdates.set(k,a);finish();renderDiscussion();status('editor-status','Practice update added. Nothing was sent.');return}
 if(!$('edit-consent').checked)return status('editor-status','Confirm publication of this exact proposed update.',true);
 const payload={versionId:law.versionId,consent:true,reason,goal:proposed.sharedGoal,implementation:proposed.illustrativeLocalOption,safeguards:proposed.risksAndSafeguards};
 write('/api/law-board/'+law.id+'/update',payload,'editor-status',finish);
};
function vote(position){
 if(busy||stale())return;
 if(!connected){if(position===null)practiceVotes.delete(key());else practiceVotes.set(key(),position);renderDiscussion();status('review-status','Practice only · nothing was sent.');return}
 const isLaw=selection.kind==='law',path=isLaw?'/api/law-board/'+selection.id+'/vote':'/api/constitution/vote',payload=isLaw?{versionId:revision(),position}:{clauseId:selection.id,position};
 write(path,payload,'review-status',()=>{});
}
for(const b of document.querySelectorAll('[data-vote]'))b.onclick=()=>vote(b.dataset.vote);$('clear-vote').onclick=()=>vote(null);
$('comment-text').oninput=()=>{$('comment-consent').checked=false};
$('comment-form').onsubmit=e=>{
 e.preventDefault();if(busy||selection.kind!=='community')return;
 const text=$('comment-text').value.trim();if(!text)return;
 const finish=()=>{$('comment-text').value='';$('comment-consent').checked=false};
 if(!connected){const k=key(),items=practiceComments.get(k)||[];items.unshift({text,status:'practice'});practiceComments.set(k,items);finish();renderDiscussion();status('review-status','Practice comment added. Nothing was sent.');return}
 if(!$('comment-consent').checked)return status('review-status','Confirm publication of this exact comment.',true);
 write('/api/constitution/comment',{clauseId:selection.id,text,consent:true},'review-status',finish);
};
for(const k of ['years','reach','capacity','effect','lag'])$(k).oninput=()=>{if(selection?.kind==='law'){settings()[k]=Number($(k).value);chart()}};
$('run-sim').onclick=chart;
window.addEventListener('popstate',()=>{const s=readRoute();if(busy){window.history.replaceState(null,'',href(selection));return}if(valid(s))navigate(s,{fromPop:true});else navigate(initial,{replace:true})});
(async()=>{try{
 const res=await fetch('/public/law-catalog.json');if(!res.ok)throw Error('Catalog asset unavailable');const catalog=await res.json();if(!Array.isArray(catalog.goals)||catalog.goals.length!==100)throw Error('Expected the 100 editorial proposals');
 laws=new Map(catalog.goals.map(law=>[law.id,{law,votes:null,myVote:null}]));
 for(const name of catalog.categories){const option=el('option',name);option.value=name;$('category').append(option)}
 const requested=readRoute();
 if(!valid(requested)&&requested.kind==='community'&&!preview){try{await request('/api/session');await shared()}catch{}}
 const s=valid(requested)?requested:initial;
 if(!valid(requested))status('connection-status','Requested record is not available; showing the default proposal.',true);
 else status('connection-status',preview?'Deploy preview · practice only, no shared writes.':'Practice mode · connect explicitly to load and review shared data.');
 $('mode').textContent=connected?'Shared database':preview?'Preview · practice':'Editorial catalog · practice';
 navigate(s,{replace:true});
 }catch(e){status('connection-status','Could not load workspace: '+e.message,true);$('mode').textContent='Catalog unavailable'}})();
