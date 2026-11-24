import {normalizeClause,sampleBoard} from './constitution-model.js';
const $=id=>document.getElementById(id);
const isStatic=document.querySelector('meta[name="helios-mode"]').content==='static';
const create=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e};
const fmt=n=>Number(n||0).toLocaleString();
const message=(id,text,error=false)=>{$(id).textContent=text;$(id).classList.toggle('error',error)};
const groups=[
 ['Start here',[['Participation guide','welcome.html'],['Original multi-tab dashboard','experiments.html'],['Email signup','public/signup.html','https://helioshtml.com/signup']]],
 ['Civic tools',[['Helios AI landing','helios_ai_landing_page.html'],['Helios Hippie','helios_hippie_landing.html'],['Helios Unified','helios-unified.html'],['100 Shared Goals','helios_100_frontend_demo.html','helios_100_frontend_demo.html'],['Plan · Notion','helios_notion_preview.html'],['World Plan Simulator','world_plan_simulator.html'],['Vote Radar','vote_radar.html'],['Neighborhood Consensus','neighborhood_consensus.html'],['Three-Editor Merge','three_editor_merge.html'],['Acts in Orbit','heliosai_acts_orbit.html'],['Support Every Country','support_every_country.html'],['Eight Billion, Five Laws','public/eight-billion-five-laws/index.html'],['Eight Billion Map','eight_billion_map.html'],['Health & Wealth of Nations','health_wealth_of_nations.html']]],
 ['Worlds & experiments',[['The Long Coil','long_coil.html'],['Communal Science Lab','communal_science_lab_webgpu%20(1).html'],['MorphLab · WebGPU','morphlab.html'],['MorphLab offline demo','morphlab-offline-demo.html'],['HappyBearLandia Pocket','happybearlandia_pocket.html'],['Digital Pensieve','https://digital-pensieve.fly.dev/'],['Braindance','helios_braindance.html'],['Rainbow Brain Realms','rainbow_brain.html'],['Sunshine for Breakfast','sunshine_breakfast.html'],['Particle interface','heliosai-particle-interface.html'],['Sand Castle','sand_castle.html']]],
 ['Project & operations',[['Mail · Resend (locked operator console)','helios_mail.html'],['YC Research','/proxy/ycr/','pages-ycr.html'],['Fork Helios','helios_fork.html'],['Repository documentation','https://github.com/adnanwahab/Helios.AI/tree/main/docs']]]
];
function renderDocs(query=''){
 const needle=query.trim().toLowerCase(),root=$('docs-links');root.replaceChildren();
 for(const [label,items] of groups){
   const matches=items.filter(([name])=>name.toLowerCase().includes(needle)||label.toLowerCase().includes(needle));
   if(!matches.length)continue;root.append(create('h3',label));
   for(const [name,live,staticHref] of matches){const a=create('a',name+' ↗');a.href=isStatic&&staticHref?staticHref:live;a.target='_blank';a.rel='noopener noreferrer';root.append(a)}
 }
 if(!root.childElementCount)root.append(create('p','No matching experience.','hint'));
}
renderDocs();
$('docs-open').addEventListener('click',()=>{$('docs-drawer').showModal();$('docs-search').focus()});
$('docs-close').addEventListener('click',()=>$('docs-drawer').close());
// A focused search input can consume Escape before the native dialog cancel action.
$('docs-drawer').addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();$('docs-drawer').close()}},true);
$('docs-drawer').addEventListener('click',e=>{if(e.target===$('docs-drawer')){const b=e.target.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)e.target.close()}});
$('docs-drawer').addEventListener('close',()=>$('docs-open').focus());
$('docs-search').addEventListener('input',()=>renderDocs($('docs-search').value));
let board=sampleBoard(),connected=false,selected='S-001',busy=false,refreshing=false,csrf=null,lastWrite=null,related=null;
const practiceVotes=new Map(),practiceComments=new Map(),practiceClauses=new Map();
function rows(){return connected?board.clauses:[...board.clauses,...practiceClauses.values()]}
function current(){return rows().find(x=>x.id===selected)||rows()[0]}
function syntheticLabel(s){return fmt(s.support)+' support · '+fmt(s.oppose)+' oppose · '+fmt(s.unsure)+' unsure'}
function liveLabel(l){return fmt(l.support)+' support · '+fmt(l.oppose)+' oppose · '+fmt(l.unsure)+' unsure'}
function meter(s){const el=create('div',undefined,'vote-meter');el.setAttribute('aria-hidden','true');for(const name of ['support','oppose','unsure']){const span=create('span',undefined,'vote-'+name);span.style.flexGrow=String(s[name]||0);el.append(span)}return el}
function drawList(){
 const filter=$('clause-search').value.trim().toLowerCase(),root=$('constitution-list');root.replaceChildren();
 for(const row of rows().filter(x=>[x.text,x.topic,x.id].some(v=>String(v).toLowerCase().includes(filter)))){
   const btn=create('button',undefined,'clause-card');btn.type='button';btn.dataset.clauseId=row.id;btn.setAttribute('aria-pressed',String(row.id===selected));
   const meta=create('span',undefined,'clause-meta');meta.append(create('span',row.topic),create('span',row.source==='synthetic'?fmt(row.synthetic.mentions)+' sample mentions':row.source==='practice'?'Your practice clause':'Community clause'));btn.append(meta,create('span',row.text,'clause-text'));
   if(row.source==='synthetic')btn.append(meter(row.synthetic),create('span','Synthetic: '+syntheticLabel(row.synthetic),'vote-counts'));
   if(connected)btn.append(create('span','Shared: '+liveLabel(row.live),'vote-counts'));
   btn.addEventListener('click',()=>choose(row.id));root.append(btn)
 }
 if(!root.childElementCount)root.append(create('p','No clauses match your filter.','hint'));
}
function choose(id){
 if(busy||!rows().some(r=>r.id===id))return;
 if(id!==selected){if($('clause-comment').value.trim()&&!confirm('Switch clauses and clear your unsent comment?'))return;$('clause-comment').value='';$('comment-consent').checked=false;message('comment-status','');message('clause-status','')}
 selected=id;drawList();drawReview();
}
function drawReview(){
 const row=current();if(!row)return;selected=row.id;
 $('clause-topic').textContent=row.topic+' · '+row.id.slice(0,18)+(row.id.length>18?'…':'');
 $('clause-text').textContent=row.text;
 $('clause-synthetic').textContent=row.source==='synthetic'?'Synthetic: '+syntheticLabel(row.synthetic)+' · '+fmt(row.synthetic.mentions)+' distinct sample participants.':'No synthetic votes for this community clause.';
 const real=$('clause-real');real.replaceChildren(create('strong',connected?'Shared advisory votes (browser sessions)':'Practice only · no shared votes loaded'),create('span',connected?liveLabel(row.live)+' · '+fmt(row.live.contributors)+' opted-in contributions':'Your choices here are not sent or counted publicly.'));
 const position=connected?row.myVote:practiceVotes.get(row.id);
 for(const b of document.querySelectorAll('[data-clause-vote]')){b.setAttribute('aria-pressed',String(position===b.dataset.clauseVote));b.disabled=busy}
 $('clear-vote').disabled=busy;
 const comments=$('clause-comments');comments.replaceChildren();
 const data=connected?row.comments:(practiceComments.get(row.id)||[]);
 if(!data.length)comments.append(create('p',connected?'No visible comments yet.':'No practice comments yet.','hint'));
 for(const item of data){const card=create('div',item.text,'comment-card');card.append(create('small',item.status==='pending'?'Your comment · pending moderation':item.status==='practice'?'Practice · not public':'Approved public comment'));comments.append(card)}
 $('review-mode').textContent=connected?'Shared':'Practice';$('comment-consent-wrap').hidden=!connected;$('contribution-consent-wrap').hidden=!connected;
 $('post-comment').textContent=connected?'Submit comment for review':'Add practice comment';
 $('contribute-clause').textContent=connected?'Submit public clause':'Add to practice draft';
 $('post-comment').disabled=busy;$('contribute-clause').disabled=busy;
}
function drawPending(){
 const node=$('pending-clauses');node.replaceChildren();node.hidden=!board.pending?.length;
 for(const p of board.pending||[])node.append(create('p','Pending moderation: '+p.text));
}
function draw(){
 const s=board.synthetic;$('synthetic-people').textContent=fmt(s.participants);$('synthetic-clauses').textContent=fmt(s.clauses);$('synthetic-duplicates').textContent=fmt(s.rawMentions-s.uniqueMentions);
 $('board-mode').textContent=connected?'Shared + sample':'Synthetic sample';$('board-connect').hidden=connected||isStatic;$('board-refresh').hidden=!connected;
 if(!rows().some(r=>r.id===selected))selected=rows()[0]?.id;
 drawList();drawReview();drawPending();updateDedupe();
}
async function request(path,options={}){
 const r=await fetch(path,{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000),...options});
 const data=await r.json().catch(()=>null);if(!r.ok||!data)throw Error(data?.error||'HTTP '+r.status);return data;
}
async function refresh(){
 if(!connected||refreshing||busy)return;refreshing=true;$('board-refresh').disabled=true;
 try{const next=await request('/api/constitution');if(!Array.isArray(next.clauses)||!next.synthetic)throw Error('Invalid board response');board=next;draw();message('board-status','Shared board updated. Counts are advisory browser-session totals, separate from the synthetic corpus.')}
 catch(e){message('board-status','Could not refresh: '+e.message,true)}
 finally{refreshing=false;$('board-refresh').disabled=false}
}
$('board-connect').addEventListener('click',async()=>{
 if(isStatic||connected||busy)return;$('board-connect').disabled=true;message('board-status','Connecting to the shared board…');
 try{const session=await request('/api/session');if(typeof session.csrfToken!=='string')throw Error('No session token');const next=await request('/api/constitution');if(!Array.isArray(next.clauses)||!next.synthetic)throw Error('Invalid board response');csrf=session.csrfToken;board=next;connected=true;draw();message('board-status','Connected. Practice activity was not uploaded. Votes are public advisory counts; comments and new clauses await review.')}
 catch(e){message('board-status','Connection unavailable: '+e.message+' · practice remains available.',true)}
 finally{$('board-connect').disabled=false}
});
$('board-refresh').addEventListener('click',refresh);
setInterval(()=>{if(connected&&!document.hidden)refresh()},20000);
async function write(action,data,statusId,onSuccess){
 if(!connected||busy)return;
 if(refreshing){message(statusId,'Refreshing the shared board. Please try again in a moment.');return}
 busy=true;drawReview();const body=JSON.stringify(data),fingerprint=action+'|'+body;
 if(!lastWrite||lastWrite.fingerprint!==fingerprint)lastWrite={fingerprint,key:crypto.randomUUID()};
 message(statusId,'Submitting…');
 let result=null;
 try{
   const session=await request('/api/session');csrf=session.csrfToken;
   result=await request('/api/constitution/'+action,{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf,'Idempotency-Key':lastWrite.key},body});
   lastWrite=null;onSuccess(result);message(statusId,action==='vote'?'Position recorded.':action==='comment'?'Comment submitted for moderation.':result.status==='pending'?'Clause submitted for moderation.':'Contribution grouped with the existing clause.');
 }catch(e){message(statusId,'Submission not confirmed: '+e.message+' · retry unchanged to reuse the request key.',true)}
 finally{busy=false;drawReview();if(result)await refresh()}
}
for(const b of document.querySelectorAll('[data-clause-vote]'))b.addEventListener('click',()=>{
 const row=current(),position=b.dataset.clauseVote;if(!row||busy)return;
 if(connected)write('vote',{clauseId:row.id,position},'clause-status',()=>{});
 else{practiceVotes.set(row.id,position);drawReview();message('clause-status','Practice position saved in this page only.')}
});
$('clear-vote').addEventListener('click',()=>{
 const row=current();if(!row||busy)return;
 if(connected)write('vote',{clauseId:row.id,position:null},'clause-status',()=>{});
 else{practiceVotes.delete(row.id);drawReview();message('clause-status','Practice position cleared.')}
});
$('post-comment').addEventListener('click',()=>{
 const row=current(),text=$('clause-comment').value.trim();if(!row||busy||!text)return message('comment-status','Write a comment first.',true);
 if(connected){if(!$('comment-consent').checked)return message('comment-status','Confirm the exact public comment before submitting.',true);write('comment',{clauseId:row.id,text,consent:true},'comment-status',()=>{$('clause-comment').value='';$('comment-consent').checked=false})}
 else{const list=practiceComments.get(row.id)||[];list.unshift({text,status:'practice'});practiceComments.set(row.id,list.slice(0,8));$('clause-comment').value='';drawReview();message('comment-status','Practice comment added. Nothing was sent.')}
});
$('clause-comment').addEventListener('input',()=>$('comment-consent').checked=false);
const emptyTally=()=>({support:0,oppose:0,unsure:0,contributors:0,commentCount:0});
function updateDedupe(){
 const text=$('new-clause').value.trim();const hit=text&&rows().find(r=>normalizeClause(r.text)===normalizeClause(text));
 $('dedupe-hint').textContent=!text?'':hit?'Same normalized wording as '+hit.id+' — this will join the existing clause instead of creating a duplicate.':'New wording · separate clause; no semantic equivalence assumed.';
}
$('new-clause').addEventListener('input',()=>{$('contribution-consent').checked=false;updateDedupe()});
$('use-concern').addEventListener('click',()=>{
 const first=$('journal').value.trim().split(/(?<=[.!?])\s+|\n/)[0];if(!first)return message('contribution-status','Write a private concern first.',true);
 if($('new-clause').value.trim()&&!confirm('Replace your unsent clause draft?'))return;
 $('new-clause').value=first.slice(0,280);$('contribution-consent').checked=false;updateDedupe();$('new-clause').focus();
});
$('contribute-clause').addEventListener('click',()=>{
 const text=$('new-clause').value.trim();if(!text||busy)return message('contribution-status','Write a short clause first.',true);
 if(connected){if(!$('contribution-consent').checked)return message('contribution-status','Confirm the exact public wording before submitting.',true);write('contribute',{text,consent:true},'contribution-status',()=>{$('new-clause').value='';$('contribution-consent').checked=false})}
 else{const hit=rows().find(r=>normalizeClause(r.text)===normalizeClause(text));if(hit){choose(hit.id);message('contribution-status','Matched existing wording. No duplicate clause added.')}
 else{const id='P-'+crypto.randomUUID();practiceClauses.set(id,{id,topic:'Your practice contribution',text,source:'practice',synthetic:{mentions:0,support:0,oppose:0,unsure:0},live:emptyTally(),comments:[]});choose(id);message('contribution-status','Added to your practice draft only.')}
 $('new-clause').value='';updateDedupe()}
});
$('clause-search').addEventListener('input',drawList);
const pulse=$('typing-pulse');for(let i=0;i<32;i++)pulse.append(create('i'));
function tokens(text){return new Set((text.toLowerCase().match(/[a-z0-9]{3,}/g)||[]).filter(x=>!['the','and','with','that','this','our','would','should','have','from','about','what','people','for','are','into','make','public'].includes(x)))}
function updatePulse(){
 const value=$('journal').value.trim(),ts=tokens(value);pulse.classList.toggle('active',!!value);
 [...pulse.children].forEach((bar,i)=>{bar.style.height=value?(5+((value.charCodeAt((i*7)%value.length)||0)+i*11+value.length*3)%25)+'px':'5px'});
 const candidates=rows().map(row=>{const words=tokens(row.text+' '+row.topic);let score=0;for(const w of ts)if(words.has(w))score++;return {row,score}}).sort((a,b)=>b.score-a.score||a.row.id.localeCompare(b.row.id));
 related=candidates[0]?.score>0?candidates[0].row:null;const label=$('local-signal');label.replaceChildren();
 label.append(document.createTextNode(value?fmt(value.split(/\s+/).length)+' words · ':''));label.append(related?create('strong','Related wording: '+related.topic+' · '+related.id.slice(0,14)):document.createTextNode(value?'No strong keyword match yet. Your idea can remain distinct.':'Write a thought to discover related clauses as you type.'));
 $('review-match').hidden=!related;
}
$('journal').addEventListener('input',updatePulse);
$('example').addEventListener('click',updatePulse);
$('restart').addEventListener('click',updatePulse);
$('review-match').addEventListener('click',()=>{if(related){choose(related.id);$('review-title').scrollIntoView({block:'nearest'})}});
draw();message('board-status',isStatic?'Static practice · no network writes or public tallies.':'Practice mode · connect to load shared counts and cast advisory votes.');updatePulse();
