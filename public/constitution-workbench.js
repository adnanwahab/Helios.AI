import {normalizeClause,sampleBoard} from './constitution-model.js';
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
// Shared constitution board. Practice activity is saved in this browser only
// (localStorage); shared activity goes through the existing consent-gated API.
const M=window.HeliosMatch;
const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
const emptyTally=()=>({support:0,oppose:0,unsure:0,contributors:0,commentCount:0});
let board=sampleBoard(),connected=false,selected='S-001',busy=false,refreshing=false,csrf=null,lastWrite=null,related=null,lastRelatedId=null,ready=false,lastWhy=[];
const practiceVotes=new Map(),practiceComments=new Map(),practiceClauses=new Map(),commentDrafts=new Map();let eventLog=[];
const PRACTICE_KEY='helios-practice-v1';
function storage(){try{return window.localStorage}catch(e){return null}}
function savePractice(){const s=storage();if(!s)return;try{s.setItem(PRACTICE_KEY,JSON.stringify({v:1,votes:[...practiceVotes],comments:[...practiceComments],clauses:[...practiceClauses.values()].map(({id,topic,text,parent})=>({id,topic,text,parent})),drafts:[...commentDrafts].filter(([,t])=>String(t).trim()),log:eventLog.slice(-80)}))}catch(e){}}
function practiceRow(id,text,topic='Your practice contribution',parent=null){return {id,topic,text,parent,source:'practice',synthetic:{mentions:0,support:0,oppose:0,unsure:0},live:emptyTally(),comments:[]}}
function loadPractice(){let data=null;try{data=JSON.parse(storage()?.getItem(PRACTICE_KEY)||'null')}catch(e){}if(!data||data.v!==1)return;
 for(const c of Array.isArray(data.clauses)?data.clauses:[])if(c&&typeof c.id==='string'&&/^P-/.test(c.id)&&typeof c.text==='string')practiceClauses.set(c.id,practiceRow(c.id,c.text.slice(0,280),typeof c.topic==='string'?c.topic:undefined,typeof c.parent==='string'?c.parent:null));
 const known=id=>board.clauses.some(r=>r.id===id)||practiceClauses.has(id);
 for(const [id,pos] of Array.isArray(data.votes)?data.votes:[])if(known(id)&&['support','oppose','unsure'].includes(pos))practiceVotes.set(id,pos);
 for(const [id,list] of Array.isArray(data.comments)?data.comments:[])if(known(id)&&Array.isArray(list))practiceComments.set(id,list.filter(x=>x&&typeof x.text==='string').slice(0,8).map(x=>({text:x.text.slice(0,500),status:'practice'})));
 for(const [id,text] of Array.isArray(data.drafts)?data.drafts:[])if(known(id)&&typeof text==='string')commentDrafts.set(id,text.slice(0,500));
 eventLog=(Array.isArray(data.log)?data.log:[]).filter(e=>e&&typeof e.type==='string').slice(-80)}
function emit(type){document.dispatchEvent(new CustomEvent('helios:board',{detail:{type}}))}
function logEvent(type,data={}){eventLog.push({type,t:Date.now(),...data});if(eventLog.length>120)eventLog=eventLog.slice(-120);savePractice();emit(type)}
function rows(){return connected?board.clauses:[...practiceClauses.values(),...board.clauses]}
function current(){return rows().find(x=>x.id===selected)||rows()[0]}
function myVote(row){return connected?row.myVote:practiceVotes.get(row.id)}
// Synthetic counts plus your own practice vote, so voting visibly moves the bar.
function shown(row){const s=row.synthetic||{},v=connected?null:practiceVotes.get(row.id);return {support:(s.support||0)+(v==='support'?1:0),oppose:(s.oppose||0)+(v==='oppose'?1:0),unsure:(s.unsure||0)+(v==='unsure'?1:0),mine:v||null}}
function liveTotal(l){return (l?.support||0)+(l?.oppose||0)+(l?.unsure||0)}
function shortId(id){return /^P-/.test(id)?'your practice clause':id.length>14?id.slice(0,12)+'…':id}
function syntheticLabel(s){return fmt(s.support)+' support · '+fmt(s.oppose)+' oppose · '+fmt(s.unsure)+' unsure'}
function liveLabel(l){return fmt(l.support)+' support · '+fmt(l.oppose)+' oppose · '+fmt(l.unsure)+' unsure'}
function meter(s){const el=create('div',undefined,'vote-meter');el.setAttribute('aria-hidden','true');for(const name of ['support','oppose','unsure']){const span=create('span',undefined,'vote-'+name);span.style.flexGrow=String(s[name]||0);el.append(span)}return el}
function cardFor(id){return [...document.querySelectorAll('#constitution-list .clause-card')].find(c=>c.dataset.clauseId===id)||null}
function flash(id,cls){const card=cardFor(id);if(!card)return;card.classList.remove(cls);void card.offsetWidth;card.classList.add(cls);card.scrollIntoView({block:'nearest',behavior:reduceMotion?'auto':'smooth'})}
function bump(id,position){if(reduceMotion||!position)return;const wrap=cardFor(id)?.querySelector('.meter-wrap');if(!wrap)return;const tag=create('span','+1 '+position,'plus-one');wrap.append(tag);setTimeout(()=>tag.remove(),1100)}
function quickActions(row){
 const box=create('div',undefined,'clause-quick');box.setAttribute('role','group');box.setAttribute('aria-label','Quick position on this clause');const mine=myVote(row);
 for(const [position,label] of [['support','Support'],['oppose','Oppose'],['unsure','Unsure']]){const b=create('button',label,'secondary');b.type='button';b.dataset.quickVote=position;b.setAttribute('aria-pressed',String(mine===position));b.disabled=busy;b.addEventListener('click',()=>castVote(row.id,position));box.append(b)}
 const discuss=create('button','Discuss →','quiet quick-discuss');discuss.type='button';discuss.addEventListener('click',()=>{$('clause-comment').focus({preventScroll:true});$('clause-comment').scrollIntoView({block:'center',behavior:reduceMotion?'auto':'smooth'})});box.append(discuss);
 return box;
}
function drawList(){
 const query=$('clause-search').value.trim(),root=$('constitution-list');root.replaceChildren();
 const list=M.search(rows(),query,{fields:r=>r.text+' '+r.topic,id:r=>r.id});
 for(const row of list){
   const btn=create('button',undefined,'clause-card');btn.type='button';btn.dataset.clauseId=row.id;btn.setAttribute('aria-pressed',String(row.id===selected));
   const meta=create('span',undefined,'clause-meta');meta.append(create('span',row.topic),create('span',row.source==='synthetic'?fmt(row.synthetic.mentions)+' sample mentions':row.source==='practice'?'Your practice clause':'Community clause'));btn.append(meta,create('span',row.text,'clause-text'));
   if(row.source==='synthetic'){const c=shown(row),wrap=create('span',undefined,'meter-wrap');wrap.append(meter(c));btn.append(wrap,create('span','Synthetic: '+syntheticLabel(c)+(c.mine?' · incl. your practice vote':''),'vote-counts'))}
   if(connected)btn.append(create('span',liveTotal(row.live)?'Shared: '+liveLabel(row.live):'Shared: no votes yet. Be the first.','vote-counts'));
   btn.addEventListener('click',()=>choose(row.id));root.append(btn);
   if(row.id===selected)root.append(quickActions(row));
 }
 if(!list.length){const p=create('p','No clause matches “'+query+'”. ','hint'),b=create('button','Suggest it as a new clause','quiet inline');b.type='button';b.addEventListener('click',()=>{if(!$('new-clause').value.trim()){$('new-clause').value=query;updateDedupe()}$('new-clause').focus({preventScroll:true});$('new-clause').scrollIntoView({block:'center',behavior:reduceMotion?'auto':'smooth'})});p.append(b);root.append(p)}
}
// Unsent comments are kept per clause, so switching clauses never asks or loses text.
function choose(id){
 if(busy||!rows().some(r=>r.id===id))return;
 if(id!==selected){commentDrafts.set(selected,$('clause-comment').value);const draft=commentDrafts.get(id)||'';$('clause-comment').value=draft;$('comment-consent').checked=false;$('comment-auto-consent').checked=false;message('comment-status',draft.trim()?'Your unsent comment for this clause is back.':'');message('clause-status','');savePractice()}
 selected=id;drawList();drawReview();renderMatchCardFor(related,lastWhy);emit('select');
}
function drawReview(){
 const row=current();if(!row)return;selected=row.id;
 $('clause-topic').textContent=row.topic+' · '+shortId(row.id);
 $('clause-text').textContent=row.text;
 const c=shown(row);
 $('clause-synthetic').textContent=row.source==='synthetic'?'Synthetic: '+syntheticLabel(c)+' · '+fmt(row.synthetic.mentions)+' distinct sample participants'+(c.mine?' · incl. your practice vote':'')+'.':row.source==='practice'?'Your own clause, on this device only.':'No synthetic votes for this community clause.';
 const real=$('clause-real');real.replaceChildren(create('strong',connected?'Shared advisory votes (browser sessions)':'Practice'),create('span',connected?(liveTotal(row.live)?liveLabel(row.live)+' · '+fmt(row.live.contributors)+' opted-in contributions':'No shared votes yet on this clause. Yours would be the first.'):'Your position is saved on this device only.'));
 const position=myVote(row);
 for(const b of document.querySelectorAll('[data-clause-vote]')){b.setAttribute('aria-pressed',String(position===b.dataset.clauseVote));b.disabled=busy}
 $('clear-vote').disabled=busy;
 const comments=$('clause-comments');comments.replaceChildren();
 const data=connected?row.comments:(practiceComments.get(row.id)||[]);
 if(!data.length)comments.append(create('p',connected?'No visible comments yet.':'No practice comments yet.','hint'));
 for(const item of data){const card=create('div',item.text,'comment-card');card.append(create('small',item.status==='pending'?'Your comment · pending moderation':item.status==='practice'?'Practice · not public':'Approved public comment'));comments.append(card)}
 $('review-mode').textContent=connected?'Shared':'Practice';$('comment-consent-wrap').hidden=!connected;$('contribution-consent-wrap').hidden=!connected;$('comment-auto-consent-wrap').hidden=!connected;$('clause-auto-consent-wrap').hidden=!connected;
 $('post-comment').textContent=connected?'Submit comment for review':'Add practice comment';
 $('contribute-clause').textContent=connected?'Submit public clause':'Add to practice draft';
 $('post-comment').disabled=busy;$('contribute-clause').disabled=busy;
}
function drawPending(){
 const node=$('pending-clauses');node.replaceChildren();node.hidden=!board.pending?.length;
 for(const p of board.pending||[])node.append(create('p','Pending moderation: '+p.text));
}
function draw(){
 const s=board.synthetic,mine=connected?0:practiceClauses.size;$('synthetic-people').textContent=fmt(s.participants);$('synthetic-clauses').textContent=fmt(s.clauses+mine);$('yours-count').hidden=!mine;$('yours-count').textContent=mine?'incl. '+mine+' yours':'';$('synthetic-duplicates').textContent=fmt(s.rawMentions-s.uniqueMentions);
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
 try{const next=await request('/api/constitution');if(!Array.isArray(next.clauses)||!next.synthetic)throw Error('Invalid board response');board=next;draw();emit('refresh');message('board-status','Shared board updated. Counts are advisory browser-session totals, separate from the synthetic corpus.')}
 catch(e){message('board-status','Could not refresh: '+e.message,true)}
 finally{refreshing=false;$('board-refresh').disabled=false}
}
$('board-connect').addEventListener('click',async()=>{
 if(isStatic||connected||busy)return;$('board-connect').disabled=true;message('board-status','Connecting to the shared board…');
 try{const session=await request('/api/session');if(typeof session.csrfToken!=='string')throw Error('No session token');const next=await request('/api/constitution');if(!Array.isArray(next.clauses)||!next.synthetic)throw Error('Invalid board response');csrf=session.csrfToken;board=next;connected=true;$('board-live-link').hidden=true;draw();emit('connect');message('board-status','Connected. Practice activity was not uploaded. Votes are public advisory counts; comments and new clauses await review.')}
 catch(e){message('board-status','Connection unavailable: '+e.message+' · practice remains available.',true);$('board-live-link').hidden=false}
 finally{$('board-connect').disabled=false}
});
$('board-refresh').addEventListener('click',refresh);
setInterval(()=>{if(connected&&!document.hidden)refresh()},20000);
// Offer the optional fast safety check without changing the existing public consent.
for(const [existing, id] of [['comment-consent','comment-auto-consent'],['contribution-consent','clause-auto-consent']]){
 const original=$(existing), label=document.createElement('label'), input=document.createElement('input');
 input.type='checkbox';input.id=id;label.append(input,document.createTextNode(' Allow OpenAI to screen this exact public text for automatic safety approval (otherwise human review).'));
 label.id=id+'-wrap';label.className='consent';label.hidden=true;original.parentElement.after(label);
}
async function write(action,data,statusId,onSuccess){
 if(!connected||busy)return null;
 if(refreshing){message(statusId,'Refreshing the shared board. Please try again in a moment.');return null}
 busy=true;drawReview();const body=JSON.stringify(data),fingerprint=action+'|'+body;
 if(!lastWrite||lastWrite.fingerprint!==fingerprint)lastWrite={fingerprint,key:crypto.randomUUID()};
 message(statusId,'Submitting…');
 let result=null;
 try{
   const session=await request('/api/session');csrf=session.csrfToken;
   result=await request('/api/constitution/'+action,{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf,'Idempotency-Key':lastWrite.key},body});
   lastWrite=null;onSuccess(result);message(statusId,action==='vote'?'Position recorded.':result.status==='approved'&&result.moderation==='unflagged'?'Safety check passed; published for discussion.':result.status==='pending'?'Saved · pending moderation.':action==='comment'?'Comment saved.':'Contribution grouped with the existing clause.');
 }catch(e){message(statusId,'Submission not confirmed: '+e.message+' · retry unchanged to reuse the request key.',true)}
 finally{busy=false;drawReview();if(result)await refresh()}
 return result;
}
// One path for every vote button (review lane, quick row, match card, daily deck).
async function castVote(id,position){
 const row=rows().find(r=>r.id===id);if(!row||busy)return false;
 if(id!==selected)choose(id);
 if(connected){const result=await write('vote',{clauseId:row.id,position},'clause-status',()=>{});if(result)logEvent('vote',{id:row.id,topic:row.topic,text:row.text,position,shared:true});return !!result}
 const previous=practiceVotes.get(row.id);practiceVotes.set(row.id,position);drawList();drawReview();renderMatchCardFor(related,lastWhy);
 if(previous!==position)bump(row.id,position);
 message('clause-status',previous===position?'Practice position kept: '+position+'.':'Practice position saved on this device: '+position+'.');
 if(previous!==position)logEvent('vote',{id:row.id,topic:row.topic,text:row.text,position,previous:previous||null});
 return true;
}
for(const b of document.querySelectorAll('[data-clause-vote]'))b.addEventListener('click',()=>{const row=current();if(row)castVote(row.id,b.dataset.clauseVote)});
$('clear-vote').addEventListener('click',()=>{
 const row=current();if(!row||busy)return;
 if(connected)write('vote',{clauseId:row.id,position:null},'clause-status',()=>{});
 else{practiceVotes.delete(row.id);drawList();drawReview();renderMatchCardFor(related,lastWhy);savePractice();emit('vote');message('clause-status','Practice position cleared.')}
});
$('post-comment').addEventListener('click',()=>{
 const row=current(),text=$('clause-comment').value.trim();if(!row||busy||!text)return message('comment-status','Write a comment first.',true);
 if(connected){if(!$('comment-consent').checked)return message('comment-status','Confirm the exact public comment before submitting.',true);write('comment',{clauseId:row.id,text,consent:true,...($('comment-auto-consent').checked?{autoModerationConsent:true}:{})},'comment-status',()=>{$('clause-comment').value='';commentDrafts.delete(row.id);$('comment-consent').checked=false;$('comment-auto-consent').checked=false})}
 else{const list=practiceComments.get(row.id)||[];list.unshift({text,status:'practice'});practiceComments.set(row.id,list.slice(0,8));$('clause-comment').value='';commentDrafts.delete(row.id);drawReview();message('comment-status','Practice comment added. Nothing was sent.');logEvent('comment',{id:row.id,topic:row.topic,text})}
});
let draftTimer=0;
$('clause-comment').addEventListener('input',()=>{$('comment-consent').checked=false;$('comment-auto-consent').checked=false;commentDrafts.set(selected,$('clause-comment').value);clearTimeout(draftTimer);draftTimer=setTimeout(savePractice,300)});
function updateDedupe(){
 const text=$('new-clause').value.trim();const hit=text&&rows().find(r=>normalizeClause(r.text)===normalizeClause(text));
 $('dedupe-hint').textContent=!text?'':hit?'Same normalized wording as '+shortId(hit.id)+' — this will join the existing clause instead of creating a duplicate.':'New wording · separate clause; no semantic equivalence assumed.';
}
$('new-clause').addEventListener('input',()=>{$('contribution-consent').checked=false;$('clause-auto-consent').checked=false;updateDedupe()});
$('use-concern').addEventListener('click',()=>{
 const main=M.pickProblem($('journal').value).text;if(!main)return message('contribution-status','Write a private concern first.',true);
 const before=$('new-clause').value;$('new-clause').value=main.slice(0,280);$('contribution-consent').checked=false;$('clause-auto-consent').checked=false;updateDedupe();$('new-clause').focus();
 if(before.trim()&&before!==$('new-clause').value&&window.HeliosUndo)window.HeliosUndo('Clause draft replaced.',()=>{$('new-clause').value=before;updateDedupe()});
});
function addPracticeClause(text,topic,parent=null){const id='P-'+crypto.randomUUID(),label=topic||'Your practice contribution';practiceClauses.set(id,practiceRow(id,String(text).slice(0,280),label,parent));selected=id;draw();flash(id,'fresh');logEvent(parent?'amendment':'clause',{id,topic:label,text:String(text).slice(0,280),parent});return id}
$('contribute-clause').addEventListener('click',()=>{
 const text=$('new-clause').value.trim();if(!text||busy)return message('contribution-status','Write a short clause first.',true);
 if(connected){if(!$('contribution-consent').checked)return message('contribution-status','Confirm the exact public wording before submitting.',true);write('contribute',{text,consent:true,...($('clause-auto-consent').checked?{autoModerationConsent:true}:{})},'contribution-status',()=>{$('new-clause').value='';$('contribution-consent').checked=false;$('clause-auto-consent').checked=false})}
 else{const hit=rows().find(r=>normalizeClause(r.text)===normalizeClause(text));if(hit){choose(hit.id);flash(hit.id,'echo');message('contribution-status','Matched existing wording. No duplicate clause added.')}
 else{addPracticeClause(text);message('contribution-status','Added to your practice draft, at the top of the constitution.')}
 $('new-clause').value='';updateDedupe()}
});
$('clause-search').addEventListener('input',drawList);
const pulse=$('typing-pulse');for(let i=0;i<32;i++)pulse.append(create('i'));
// The match moment: your words find their clause, fly over and light it up.
function renderMatchCardFor(row,why=null){
 const card=$('match-card');if(!row||!$('journal').value.trim()){card.hidden=true;return}card.hidden=false;
 $('match-kicker').textContent=row.source==='synthetic'?'You + '+fmt(row.synthetic.mentions)+' sample journals said something like this':row.source==='practice'?'Close to your own practice clause':'Close to a community clause';
 $('match-text').textContent='“'+row.text+'”'+(why&&why.length?' · matched on '+why.join(', '):'');
 const mine=myVote(row);$('match-support').textContent=mine==='support'?'Supported ✓':'Support it';$('match-support').disabled=busy||mine==='support';
}
function celebrate(row,why){
 if(!ready)return;const card=cardFor(row.id);if(!card)return;
 const finish=()=>{card.classList.remove('echo');void card.offsetWidth;card.classList.add('echo')};
 const from=$('journal').getBoundingClientRect(),to=card.getBoundingClientRect(),visible=r=>r.bottom>0&&r.top<innerHeight;
 if(reduceMotion||!visible(from)||!visible(to)){finish();return}
 const chip=create('div',(why&&why.length?why.slice(0,3).join(' · '):row.topic),'fly-chip');document.body.append(chip);
 chip.style.transform='translate('+Math.round(from.left+from.width*.4)+'px,'+Math.round(from.top+from.height*.5)+'px)';
 requestAnimationFrame(()=>requestAnimationFrame(()=>{chip.style.transform='translate('+Math.round(to.left+18)+'px,'+Math.round(to.top+to.height*.45)+'px) scale(.85)';chip.style.opacity='.25'}));
 setTimeout(()=>{chip.remove();finish()},800);
}
function updatePulse(){
 const value=$('journal').value.trim();pulse.classList.toggle('active',!!value);
 [...pulse.children].forEach((bar,i)=>{bar.style.height=value?(5+((value.charCodeAt((i*7)%value.length)||0)+i*11+value.length*3)%25)+'px':'5px'});
 const best=value?M.rank(rows(),value,{fields:r=>r.text+' '+r.topic,limit:1})[0]:null;
 related=best?best.record:null;lastWhy=best?best.why:[];
 const label=$('local-signal');label.replaceChildren();
 label.append(document.createTextNode(value?M.plural(value.split(/\s+/).length,'word')+' · ':''));
 label.append(related?create('strong','Related wording: '+related.topic+' · '+shortId(related.id)):document.createTextNode(value?'No match yet. Your idea can start a new clause.':'Write a thought to discover related clauses as you type.'));
 $('review-match').hidden=!related;
 renderMatchCardFor(related,lastWhy);
 if(related&&related.id!==lastRelatedId)celebrate(related,lastWhy);
 lastRelatedId=related?related.id:null;
}
$('match-support').addEventListener('click',()=>{if(related)castVote(related.id,'support')});
$('journal').addEventListener('input',updatePulse);
$('example').addEventListener('click',updatePulse);
$('restart').addEventListener('click',updatePulse);
$('review-match').addEventListener('click',()=>{if(related){choose(related.id);$('review-title').scrollIntoView({block:'nearest'})}});
// Small API for the play features in workshop-play.js.
window.HeliosBoard=Object.freeze({
 rows:()=>rows(),current:()=>current(),select:id=>choose(id),vote:(id,position)=>castVote(id,position),
 positionOf:id=>{const r=rows().find(x=>x.id===id);return r?myVote(r)||null:null},
 counts:id=>{const r=rows().find(x=>x.id===id);return r?shown(r):null},
 connected:()=>connected,isStatic:()=>isStatic,
 addPracticeClause:(text,topic,parent)=>addPracticeClause(text,topic,parent),
 log:()=>eventLog.slice(),note:(type,data)=>logEvent(type,data),
 stats:()=>({...board.synthetic,practiceClauses:practiceClauses.size})
});
loadPractice();$('clause-comment').value=commentDrafts.get(selected)||'';
draw();message('board-status',isStatic?'Static practice · no network writes or public tallies.':'Practice mode. Connect to see shared counts and cast advisory votes.');updatePulse();ready=true;emit('ready');
