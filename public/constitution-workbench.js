import {normalizeClause,sampleBoard} from './constitution-model.js';
import {readCivicRoute,updateCivicRoute,civicUrl,validClause,scrollToCivicRoute} from './civic-route.js';
const $=id=>document.getElementById(id);
const isStatic=document.querySelector('meta[name="helios-mode"]').content==='static'||/^deploy-preview-\d+--heliosailol\.netlify\.app$/.test(location.hostname);
const create=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e};
const fmt=n=>Number(n||0).toLocaleString();
const message=(id,text,error=false)=>{$(id).textContent=text;$(id).classList.toggle('error',error)};
const groups=[
 ['Start here',[['Participation guide','welcome.html'],['Original multi-tab dashboard','experiments.html'],['Email signup','public/signup.html','https://helioshtml.com/signup']]],
 ['Civic tools',[['Helios AI landing','helios_ai_landing_page.html'],['Helios Hippie','helios_hippie_landing.html'],['Helios Unified','helios-unified.html'],['100 Shared Goals','helios_100_frontend_demo.html','helios_100_frontend_demo.html'],['100-law atlas and simulations','law-atlas.html'],['Plan · Notion','helios_notion_preview.html'],['World Plan Simulator','world_plan_simulator.html'],['Vote Radar','vote_radar.html'],['Neighborhood Consensus','neighborhood_consensus.html'],['Three-Editor Merge','three_editor_merge.html'],['Acts in Orbit','heliosai_acts_orbit.html'],['Support Every Country','support_every_country.html'],['Eight Billion, Five Laws','public/eight-billion-five-laws/index.html'],['Eight Billion Map','eight_billion_map.html'],['Health & Wealth of Nations','health_wealth_of_nations.html']]],
 ['Worlds & experiments',[['The Missing Amendment · mystery game','public/mystery.html'],['Netherbrain fictional campaign','public/netherbrain.html'],['The Long Coil','long_coil.html'],['Communal Science Lab','communal_science_lab_webgpu%20(1).html'],['MorphLab · WebGPU','morphlab.html'],['MorphLab offline demo','morphlab-offline-demo.html'],['HappyBearLandia Pocket','happybearlandia_pocket.html'],['Digital Pensieve','https://digital-pensieve.fly.dev/'],['Braindance','helios_braindance.html'],['Rainbow Brain Realms','rainbow_brain.html'],['Sunshine for Breakfast','sunshine_breakfast.html'],['Particle interface','heliosai-particle-interface.html'],['Sand Castle','sand_castle.html']]],
 ['Project & operations',[['Mail · Resend (locked operator console)','helios_mail.html'],['YC Research','/proxy/ycr/','pages-ycr.html'],['Fork Helios','helios_fork.html'],['Repository documentation','https://github.com/adnanwahab/Helios.AI/tree/main/docs']]]
];
// The archive is an allowlisted browser of old pages, not a stack of 32
// running simulations. Never pass the private journal to a frame or its URL.
const docs=$('docs-drawer'), frameSlot=$('docs-frame-slot');
let activeDoc=null,docsView='tabs';
function entryFor(name,live,staticHref){
 const href=isStatic&&staticHref?staticHref:live;
 // The original dashboard embeds the research proxy; keep that dashboard
 // and live proxied third-party scripts outside the journal's document.
 const separate=name==='Original multi-tab dashboard'||name==='Repository documentation'||(!isStatic&&name==='YC Research')||(isStatic&&name==='Email signup');
 return {name,href,separate};
}
function clearFrame(){
 frameSlot.querySelector('iframe')?.remove();
 $('docs-empty').hidden=false;
}
function setDocsLayout(next){
 docsView=next;docs.dataset.view=next;
 const wide=next==='tabs';
 $('docs-layout').textContent=wide?'Compact drawer':'Expand tabs';
 $('docs-layout').setAttribute('aria-pressed',String(wide));
 if(!wide)clearFrame();
 else if(activeDoc&&!activeDoc.separate&&!frameSlot.querySelector('iframe'))loadDoc(activeDoc);
}
function selectDoc(entry){
 activeDoc=entry;setDocsLayout('tabs');
 // setDocsLayout may have restored this exact selection after compact mode.
 if(frameSlot.querySelector('iframe')?.dataset.experience!==entry.name)loadDoc(entry);
 renderDocs($('docs-search').value);
}
function loadDoc(entry){
 clearFrame();
 $('docs-current').textContent=entry.name;
 $('docs-external').href=entry.href;$('docs-external').hidden=false;
 if(entry.separate){
   $('docs-viewer-note').textContent='This page is kept separate from the journal. Use Open in new tab to view it.';
   return;
 }
 const url=new URL(entry.href,document.baseURI);
 if(!['http:','https:'].includes(url.protocol))return;
 const frame=create('iframe');frame.id='docs-frame';frame.title=entry.name;frame.dataset.experience=entry.name;
 frame.referrerPolicy='no-referrer';
 // Only the repository's own, explicitly listed pages receive their normal
 // origin so localStorage and same-origin APIs work. External frames remain
 // opaque and cannot read the journal. Neither can navigate the top page.
 const trusted=url.origin===location.origin;
 frame.setAttribute('sandbox','allow-scripts allow-forms allow-downloads allow-popups allow-popups-to-escape-sandbox'+(trusted?' allow-same-origin':''));
 frame.setAttribute('allow','fullscreen');frame.setAttribute('allowfullscreen','');
 frame.src=url.href;
 $('docs-empty').hidden=true;frameSlot.append(frame);
 $('docs-viewer-note').textContent='One experience is loaded at a time. If a site refuses embedding, use Open in new tab.';
}
function renderDocs(query=''){
 const needle=query.trim().toLowerCase(),root=$('docs-links');root.replaceChildren();
 for(const [label,items] of groups){
   const matches=items.filter(([name])=>name.toLowerCase().includes(needle)||label.toLowerCase().includes(needle));
   if(!matches.length)continue;const group=create('div',undefined,'docs-group');group.append(create('h3',label));
   for(const [name,live,staticHref] of matches){
     const entry=entryFor(name,live,staticHref),a=create('a',name+(entry.separate?' ↗':''));
     a.href=entry.href;a.target='_blank';a.rel='noopener noreferrer';a.dataset.experience=name;
     if(entry.separate)a.dataset.separate='true';
     if(activeDoc?.name===name)a.setAttribute('aria-current','true');
     // Preserve ordinary browser link behavior for modifier-click and
     // link-only entries. A plain click on an embeddable tab stays here.
     a.addEventListener('click',e=>{
       if(e.defaultPrevented||e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||entry.separate)return;
       e.preventDefault();selectDoc(entry);
       // Re-rendering the archive replaces the clicked link; restore focus.
       [...root.querySelectorAll('a')].find(link=>link.dataset.experience===name)?.focus({preventScroll:true});
     });
     group.append(a);
   }
   root.append(group);
 }
 if(!root.childElementCount)root.append(create('p','No matching experience.','hint'));
}
renderDocs();
$('docs-open').addEventListener('click',()=>{
 docs.showModal();setDocsLayout('tabs');$('docs-search').focus();
});
$('docs-layout').addEventListener('click',()=>setDocsLayout(docsView==='tabs'?'drawer':'tabs'));
$('docs-close').addEventListener('click',()=>docs.close());
// A focused search input can consume Escape before native dialog cancel.
docs.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();docs.close()}},true);
docs.addEventListener('click',e=>{if(e.target===docs){const b=docs.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)docs.close()}});
docs.addEventListener('close',()=>{
 // Stop WebGPU, animation and network activity in the closed overlay.
 clearFrame();activeDoc=null;renderDocs($('docs-search').value);
 $('docs-current').textContent='Choose an experience';$('docs-external').hidden=true;
 $('docs-viewer-note').textContent='Some external or restricted pages must be opened in a separate tab.';
 $('docs-open').focus();
});
$('docs-search').addEventListener('input',()=>renderDocs($('docs-search').value));
let board=sampleBoard(),connected=false,selected=readCivicRoute().clause||'S-001',busy=false,refreshing=false,connecting=false,csrf=null,lastWrite=null,related=null;
let practiceMode=isStatic||readCivicRoute().practice,connectionEpoch=0;
const commentDrafts=new Map();
const unavailable=()=>!connected&&!practiceMode;
const blocked=()=>busy||unavailable();
function setSelected(id){
 if(id!==selected){
   if(selected)commentDrafts.set(selected,$('clause-comment').value);
   $('clause-comment').value=commentDrafts.get(id)||'';$('comment-consent').checked=false;$('comment-auto-consent').checked=false;message('comment-status','');message('clause-status','');
 }
 selected=id;
}
function updateLiveLink(){
 const route=readCivicRoute(),a=$('board-live-link').querySelector('a');
 a.href=civicUrl('https://helios-ai-laws.fly.dev/',{clause:route.clause,law:route.law,anchor:route.anchor||'review-title',practice:false}).href;
 $('board-live-link').hidden=!(isStatic||unavailable()&&!connecting&&location.hostname!=='helios-ai-laws.fly.dev');
}
function applyRequestedClause(){
 const id=readCivicRoute().clause;
 if(id&&rows().some(row=>row.id===id))setSelected(id);
 else if(!rows().some(row=>row.id===selected))setSelected(rows()[0]?.id);
}
function requestedUnavailable(){const id=readCivicRoute().clause;return id&&!rows().some(row=>row.id===id)}
function selectedBoardPath(){const id=readCivicRoute().clause;return '/api/constitution'+(id?.startsWith('C-')?'?clause='+encodeURIComponent(id):'')}

const practiceVotes=new Map(),practiceComments=new Map(),practiceClauses=new Map();
function rows(){return practiceMode?[...board.clauses,...practiceClauses.values()]:board.clauses}
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
function choose(id,{navigate=true}={}){
 if(busy||!rows().some(r=>r.id===id))return;
 const changed=id!==selected;setSelected(id);
 if(navigate)updateCivicRoute({clause:validClause(id)?id:null,...(changed?{law:null}:{}),anchor:'review-title'});
 if(!navigate)$('clause-search').value='';
 drawList();drawReview(navigate?'user':'history');updateLiveLink();
}
function drawReview(navigation='sync'){
 const row=current();if(!row)return;selected=row.id;
 $('clause-topic').textContent=row.topic+' · '+row.id.slice(0,18)+(row.id.length>18?'…':'');
 $('clause-text').textContent=row.text;
 document.dispatchEvent(new CustomEvent('helios:clause-selected',{detail:{id:row.id,topic:row.topic,text:row.text,source:row.source,navigation}}));
 $('clause-synthetic').textContent=row.source==='synthetic'?'Synthetic: '+syntheticLabel(row.synthetic)+' · '+fmt(row.synthetic.mentions)+' distinct sample participants.':'No synthetic votes for this community clause.';
 const real=$('clause-real');real.replaceChildren(create('strong',connected?'Shared advisory votes (browser sessions)':practiceMode?'Practice only · no shared votes loaded':connecting?'Loading shared review…':'Shared database unavailable'),create('span',connected?liveLabel(row.live)+' · '+fmt(row.live.contributors)+' opted-in contributions':practiceMode?'Your choices here are not sent or counted publicly.':'No votes or comments will be saved until the connection is restored.'));
 const position=connected?row.myVote:practiceMode?practiceVotes.get(row.id):null;
 for(const b of document.querySelectorAll('[data-clause-vote]')){b.setAttribute('aria-pressed',String(position===b.dataset.clauseVote));b.disabled=blocked()}
 $('clear-vote').disabled=blocked();
 const comments=$('clause-comments');comments.replaceChildren();
 const data=connected?row.comments:practiceMode?(practiceComments.get(row.id)||[]):[];
 if(!data.length)comments.append(create('p',connected?'No visible comments yet.':practiceMode?'No practice comments yet.':'Comments unavailable until connected.','hint'));
 for(const item of data){const card=create('div',item.text,'comment-card');card.append(create('small',item.status==='pending'?'Your comment · pending moderation':item.status==='practice'?'Practice · not public':'Approved public comment'));comments.append(card)}
 $('review-mode').textContent=connected?'Shared':practiceMode?'Practice':connecting?'Connecting':'Unavailable';$('comment-consent-wrap').hidden=!connected;$('contribution-consent-wrap').hidden=!connected;$('comment-auto-consent-wrap').hidden=!connected;$('clause-auto-consent-wrap').hidden=!connected;
 $('post-comment').textContent=practiceMode?'Add practice comment':'Submit comment for review';
 $('contribute-clause').textContent=practiceMode?'Add to practice draft':'Submit public clause';
 $('post-comment').disabled=blocked();$('contribute-clause').disabled=blocked();
}
function drawPending(){
 const node=$('pending-clauses');node.replaceChildren();node.hidden=!connected||!board.pending?.length;if(!connected)return;
 for(const p of board.pending||[])node.append(create('p','Pending moderation: '+p.text));
}
function draw(){
 const s=board.synthetic;$('synthetic-people').textContent=fmt(s.participants);$('synthetic-clauses').textContent=fmt(s.clauses);$('synthetic-duplicates').textContent=fmt(s.rawMentions-s.uniqueMentions);
 $('board-mode').textContent=connected?'Shared + sample':practiceMode?'Synthetic sample':connecting?'Connecting':'Unavailable';$('board-connect').hidden=connected||isStatic;$('board-connect').disabled=connecting||busy;$('board-connect').textContent=connecting?'Connecting…':practiceMode?'Join shared review':'Retry shared review';$('board-practice').hidden=isStatic||practiceMode||connecting;$('board-practice').disabled=busy;$('board-refresh').hidden=!connected;
 if(!rows().some(r=>r.id===selected))setSelected(rows()[0]?.id);updateLiveLink();
 drawList();drawReview();drawPending();updateDedupe();
}
async function request(path,options={}){
 const r=await fetch(path,{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000),...options});
 const data=await r.json().catch(()=>null);if(!r.ok||!data)throw Error(data?.error||'HTTP '+r.status);return data;
}
async function connect({restoreScroll=false}={}){
 if(isStatic||connected||connecting||busy||practiceMode)return;
 const epoch=++connectionEpoch;connecting=true;draw();message('board-status','Loading shared constitution from the database…');
 try{
   const next=await request(selectedBoardPath());
   if(epoch!==connectionEpoch||practiceMode)return;
   if(!Array.isArray(next.clauses)||!next.synthetic)throw Error('Invalid board response');
   board=next;connected=true;applyRequestedClause();
   message('board-status',requestedUnavailable()?'The requested clause is not publicly available. Showing the shared board.':'Shared review is live. Advisory positions save to the database; comments and new clauses await moderation.');
 }catch(e){if(epoch!==connectionEpoch)return;connected=false;message('board-status','Shared database unavailable: '+e.message+' · nothing was saved. Retry, or explicitly choose private practice.',true)}
 finally{if(epoch===connectionEpoch){connecting=false;draw();updatePulse();if(restoreScroll)scrollToCivicRoute('review-title','constitution-title')}}
}
async function refresh(){
 if(!connected||refreshing||busy)return;const epoch=connectionEpoch;refreshing=true;$('board-refresh').disabled=true;
 try{
   const next=await request(selectedBoardPath());
   if(epoch!==connectionEpoch||practiceMode)return;
   if(!Array.isArray(next.clauses)||!next.synthetic)throw Error('Invalid board response');
   board=next;applyRequestedClause();draw();message('board-status',requestedUnavailable()?'The requested clause is not publicly available. Showing the shared board.':'Shared board updated. Counts are advisory browser-session totals, separate from the synthetic corpus.')
 }catch(e){if(epoch===connectionEpoch){connected=false;draw();message('board-status','Could not refresh the shared database: '+e.message+' · writes are disabled until you reconnect.',true)}}
 finally{refreshing=false;$('board-refresh').disabled=false}
}
function enterPractice({navigate=true}={}){
 ++connectionEpoch;connected=false;connecting=false;practiceMode=true;board=sampleBoard();$('comment-consent').checked=false;$('comment-auto-consent').checked=false;$('contribution-consent').checked=false;$('clause-auto-consent').checked=false;
 if(navigate)updateCivicRoute({practice:true});
 applyRequestedClause();draw();updatePulse();
 message('board-status',isStatic?'Preview practice · no shared review writes. Use the live app to save votes and comments.':'Private practice · votes and comments stay in this page only. Join shared review to save new activity.');
}
function leavePractice({navigate=true}={}){
 if(isStatic||busy)return;
 if(practiceMode)board=sampleBoard();practiceMode=false;$('comment-consent').checked=false;$('comment-auto-consent').checked=false;$('contribution-consent').checked=false;$('clause-auto-consent').checked=false;
 if(navigate)updateCivicRoute({practice:false});
 connect({restoreScroll:true});
}
$('board-connect').addEventListener('click',()=>leavePractice());
$('board-practice').addEventListener('click',()=>{if(!busy)enterPractice()});
function restoreClauseRoute(){
 if(busy)return;
 const route=readCivicRoute(),shouldPractice=isStatic||route.practice;
 if(shouldPractice!==practiceMode){if(shouldPractice)enterPractice({navigate:false});else leavePractice({navigate:false})}
 const id=route.clause||'S-001';
 if(rows().some(row=>row.id===id))choose(id,{navigate:false});
 else if(connected&&route.clause)refresh();
 scrollToCivicRoute('review-title','constitution-title');updateLiveLink();
}
window.addEventListener('popstate',restoreClauseRoute);
$('board-refresh').addEventListener('click',refresh);
setInterval(()=>{if(connected&&!document.hidden)refresh()},20000);
// Offer the optional fast safety check without changing the existing public consent.
for(const [existing, id] of [['comment-consent','comment-auto-consent'],['contribution-consent','clause-auto-consent']]){
 const original=$(existing), label=document.createElement('label'), input=document.createElement('input');
 input.type='checkbox';input.id=id;label.append(input,document.createTextNode(' Allow OpenAI to screen this exact public text for automatic safety approval (otherwise human review).'));
 label.id=id+'-wrap';label.className='consent';label.hidden=true;original.parentElement.after(label);
}
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
   lastWrite=null;onSuccess(result);message(statusId,action==='vote'?'Position recorded in the database.':result.status==='approved'&&result.moderation==='unflagged'?'Safety check passed; published for discussion.':result.status==='pending'?'Saved to database · pending moderation.':action==='comment'?'Comment saved.':'Contribution grouped with the existing clause.');
 }catch(e){message(statusId,'Submission not confirmed: '+e.message+' · retry unchanged to reuse the request key.',true)}
 finally{busy=false;drawReview();if(result)await refresh();const route=readCivicRoute();if((route.clause&&route.clause!==selected)||(!isStatic&&route.practice!==practiceMode))restoreClauseRoute()}
}
for(const b of document.querySelectorAll('[data-clause-vote]'))b.addEventListener('click',()=>{
 const row=current(),position=b.dataset.clauseVote;if(!row||blocked())return;
 if(connected)write('vote',{clauseId:row.id,position},'clause-status',()=>{});
 else{practiceVotes.set(row.id,position);drawReview();message('clause-status','Practice position saved in this page only.')}
});
$('clear-vote').addEventListener('click',()=>{
 const row=current();if(!row||blocked())return;
 if(connected)write('vote',{clauseId:row.id,position:null},'clause-status',()=>{});
 else{practiceVotes.delete(row.id);drawReview();message('clause-status','Practice position cleared.')}
});
$('post-comment').addEventListener('click',()=>{
 const row=current(),text=$('clause-comment').value.trim();if(blocked())return;if(!row||!text)return message('comment-status','Write a comment first.',true);
 if(connected){if(!$('comment-consent').checked)return message('comment-status','Confirm the exact public comment before submitting.',true);write('comment',{clauseId:row.id,text,consent:true,...($('comment-auto-consent').checked?{autoModerationConsent:true}:{})},'comment-status',()=>{$('clause-comment').value='';commentDrafts.delete(row.id);$('comment-consent').checked=false;$('comment-auto-consent').checked=false})}
 else{const list=practiceComments.get(row.id)||[];list.unshift({text,status:'practice'});practiceComments.set(row.id,list.slice(0,8));$('clause-comment').value='';commentDrafts.delete(row.id);drawReview();message('comment-status','Practice comment added. Nothing was sent.')}
});
$('clause-comment').addEventListener('input',()=>{$('comment-consent').checked=false;$('comment-auto-consent').checked=false});
const emptyTally=()=>({support:0,oppose:0,unsure:0,contributors:0,commentCount:0});
function updateDedupe(){
 const text=$('new-clause').value.trim();const hit=text&&rows().find(r=>normalizeClause(r.text)===normalizeClause(text));
 $('dedupe-hint').textContent=!text?'':hit?'Same normalized wording as '+hit.id+' — this will join the existing clause instead of creating a duplicate.':'New wording · separate clause; no semantic equivalence assumed.';
}
$('new-clause').addEventListener('input',()=>{$('contribution-consent').checked=false;$('clause-auto-consent').checked=false;updateDedupe()});
$('use-concern').addEventListener('click',()=>{
 const first=$('journal').value.trim().split(/(?<=[.!?])\s+|\n/)[0];if(!first)return message('contribution-status','Write a private concern first.',true);
 if($('new-clause').value.trim()&&!confirm('Replace your unsent clause draft?'))return;
 $('new-clause').value=first.slice(0,280);$('contribution-consent').checked=false;$('clause-auto-consent').checked=false;updateDedupe();$('new-clause').focus();
});
$('contribute-clause').addEventListener('click',()=>{
 const text=$('new-clause').value.trim();if(blocked())return;if(!text)return message('contribution-status','Write a short clause first.',true);
 if(connected){if(!$('contribution-consent').checked)return message('contribution-status','Confirm the exact public wording before submitting.',true);write('contribute',{text,consent:true,...($('clause-auto-consent').checked?{autoModerationConsent:true}:{})},'contribution-status',()=>{$('new-clause').value='';$('contribution-consent').checked=false;$('clause-auto-consent').checked=false})}
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
if(practiceMode){enterPractice({navigate:false});scrollToCivicRoute('review-title','constitution-title')}else{connect({restoreScroll:true})}
