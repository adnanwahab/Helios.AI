// Play features for the civic workshop. Everything here is local and illustrative:
// the daily deck uses the same vote path as the review lane, the "opposers" are
// simulated, and the sketches are drawings, not forecasts.
const $=id=>document.getElementById(id);
const M=window.HeliosMatch,B=window.HeliosBoard;
const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
const make=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n};
const button=(text,cls='secondary')=>{const b=make('button',text,cls);b.type='button';return b};
const fmt=n=>Number(n||0).toLocaleString();
const money=n=>'$'+Math.round(n).toLocaleString();
const store={get(key){try{return JSON.parse(localStorage.getItem(key)||'null')}catch(e){return null}},set(key,value){try{localStorage.setItem(key,JSON.stringify(value))}catch(e){}}};
function dayKey(d=new Date()){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function shiftDay(key,days){const [y,m,d]=key.split('-').map(Number);return dayKey(new Date(y,m-1,d+days))}
function seeded(seed){let s=0;for(const c of seed)s=(Math.imul(s,31)+c.charCodeAt(0))>>>0;return()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296}}
function meter(c){const el=make('div',undefined,'vote-meter');el.setAttribute('aria-hidden','true');for(const k of ['support','oppose','unsure']){const s=make('span',undefined,'vote-'+k);s.style.flexGrow=String(c[k]||0);el.append(s)}return el}
function majority(c){return ['support','oppose','unsure'].reduce((a,b)=>(c[b]||0)>(c[a]||0)?b:a,'support')}

/* ---------- Today's five: a daily swipe deck with a streak ---------- */
const DECK_KEY='helios-deck-v1',deckRoot=$('daily-deck');
function deckState(){const today=dayKey(),saved=store.get(DECK_KEY)||{};const base={streak:Number(saved.streak)||0,lastComplete:typeof saved.lastComplete==='string'?saved.lastComplete:null};if(saved.day!==today)return {...base,day:today,started:false,index:0,votes:{}};return {...base,day:today,started:!!saved.started,index:Math.max(0,Number(saved.index)||0),votes:saved.votes&&typeof saved.votes==='object'?saved.votes:{}}}
let deck=deckState();
function todaysClauses(){const pool=B.rows().filter(r=>r.source==='synthetic'),rand=seeded('helios-'+deck.day),list=[...pool];for(let i=list.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[list[i],list[j]]=[list[j],list[i]]}return list.slice(0,5)}
function streakText(){const alive=deck.lastComplete===deck.day||deck.lastComplete===shiftDay(deck.day,-1);const n=alive?deck.streak:0;return n?'Streak: '+M.plural(n,'day'):'Start a streak today'}
let deckBusy=false;
function renderDeck(){
 if(!deckRoot)return;const cards=todaysClauses(),done=deck.index>=cards.length&&cards.length>0;deckRoot.replaceChildren();
 const head=make('div',undefined,'deck-head'),dots=make('div',undefined,'deck-dots');dots.setAttribute('aria-label',Math.min(deck.index,cards.length)+' of '+cards.length+' done');
 cards.forEach((_,i)=>dots.append(make('i',undefined,i<deck.index?'on':'')));
 head.append(make('h3',"Today's five",undefined),dots,make('span',streakText(),'streak'));head.firstChild.id='deck-title';deckRoot.append(head);
 if(!cards.length){deckRoot.append(make('p','Clauses are still loading.','deck-hint'));return}
 if(done){
   const agree=cards.filter(r=>deck.votes[r.id]&&deck.votes[r.id]===majority(r.synthetic)).length;
   deckRoot.append(make('p','Done for today. You sided with the synthetic majority on '+agree+' of '+cards.length+'. Come back tomorrow for five more.','deck-summary'));return;
 }
 if(!deck.started){deckRoot.append(make('p','Five clauses a day. Swipe, tap, or use ← → ↑. '+(B.connected()?'Votes count on the shared board.':'Practice votes stay on this device.'),'deck-hint'));const start=button(deck.index?'Continue today’s five':'Start today’s five','secondary deck-start');start.addEventListener('click',()=>{deck.started=true;store.set(DECK_KEY,deck);renderDeck();deckRoot.querySelector('.deck-card')?.focus()});deckRoot.append(start);return}
 const row=cards[deck.index],counts=B.counts(row.id)||row.synthetic;
 const card=make('div',undefined,'deck-card');card.tabIndex=0;card.setAttribute('role','group');card.setAttribute('aria-label','Clause '+(deck.index+1)+' of '+cards.length+': '+row.text+'. Left arrow opposes, right arrow supports, up arrow is unsure.');
 card.append(make('p',row.topic+' · '+row.id,'eyebrow'),make('p',row.text,'deck-text'),meter(counts),make('p','← Oppose · ↑ Unsure · Support →','deck-hint'));
 const actions=make('div',undefined,'deck-actions');
 for(const [position,label] of [['oppose','← Oppose'],['unsure','↑ Unsure'],['support','Support →']]){const b=button(label);b.dataset.deck=position;b.addEventListener('click',()=>swipe(position,card));actions.append(b)}
 card.addEventListener('keydown',e=>{const key={ArrowLeft:'oppose',ArrowRight:'support',ArrowUp:'unsure'}[e.key];if(key){e.preventDefault();swipe(key,card)}});
 let start=null;
 card.addEventListener('pointerdown',e=>{if(e.button!==0)return;start={x:e.clientX,y:e.clientY};card.setPointerCapture(e.pointerId);card.classList.add('dragging')});
 card.addEventListener('pointermove',e=>{if(!start)return;const dx=e.clientX-start.x,dy=Math.min(0,e.clientY-start.y);card.style.transform='translate('+dx+'px,'+dy+'px) rotate('+dx/18+'deg)'});
 const end=e=>{if(!start)return;const dx=e.clientX-start.x,dy=e.clientY-start.y;start=null;card.classList.remove('dragging');card.style.transform='';if(dx>90)swipe('support',card);else if(dx<-90)swipe('oppose',card);else if(dy<-80)swipe('unsure',card)};
 card.addEventListener('pointerup',end);card.addEventListener('pointercancel',()=>{start=null;card.classList.remove('dragging');card.style.transform=''});
 deckRoot.append(card,actions);
}
async function swipe(position,card){
 if(deckBusy)return;const cards=todaysClauses(),row=cards[deck.index];if(!row)return;deckBusy=true;
 const ok=await B.vote(row.id,position);
 if(!ok){deckBusy=false;return}
 deck.votes[row.id]=position;
 const animate=!reduceMotion&&card&&card.isConnected;
 if(animate)card.classList.add(position==='support'?'out-right':position==='oppose'?'out-left':'out-up');
 setTimeout(()=>{deck.index++;
   if(deck.index>=cards.length){if(deck.lastComplete!==deck.day){deck.streak=deck.lastComplete===shiftDay(deck.day,-1)?deck.streak+1:1;deck.lastComplete=deck.day;B.note('deck',{day:deck.day,streak:deck.streak})}}
   store.set(DECK_KEY,deck);deckBusy=false;renderDeck();deckRoot.querySelector('.deck-card')?.focus({preventScroll:true})},animate?260:0);
}

/* ---------- Win over the opposers (simulated residents) ---------- */
const persuadeRoot=$('persuade-body'),persuadeBox=$('persuade');
let persuadeFor=null;
function renderPersuade(force=false){
 if(!persuadeRoot||!persuadeBox.open)return;const row=B.current();if(!row)return;
 if(!force&&persuadeFor===row.id)return;persuadeFor=row.id;persuadeRoot.replaceChildren();
 if(row.source!=='synthetic'||!(row.synthetic?.oppose>0)){persuadeRoot.append(make('p','Pick a sample clause with opposers to try this. Your own clauses have no simulated residents yet.','hint'));return}
 const list=M.concerns(row.topic);
 persuadeRoot.append(make('p',fmt(row.synthetic.oppose)+' simulated residents oppose “'+row.text+'” Address what worries them, in your own words.','hint'));
 const chips=make('div',undefined,'concern-list');for(const c of list){const chip=make('span',c.label+' · '+Math.round(row.synthetic.oppose*c.share),'concern');chip.dataset.concern=c.id;chips.append(chip)}
 const label=make('label','Your rewrite');label.htmlFor='persuade-text';
 const area=make('textarea');area.id='persuade-text';area.maxLength=280;area.value=row.text;
 const score=make('p','','persuade-score');score.id='persuade-score';score.setAttribute('aria-live','polite');
 const meterSlot=make('div');const save=button('Save as practice amendment');const status=make('p','','status');
 const update=()=>{const r=M.persuade({topic:row.topic,text:row.text,counts:row.synthetic},area.value);
   for(const chip of chips.children)chip.classList.toggle('done',r.concerns.find(c=>c.id===chip.dataset.concern)?.addressed||false);
   score.textContent=!r.sameIdea&&area.value.trim()!==row.text?'This no longer reads like the same clause, so nobody moves.':r.won||r.softened?'Won over '+r.won+' · softened '+r.softened+' to unsure · '+r.after.oppose+' still opposed':'No one has moved yet. Try naming cost, upkeep or fairness.';
   meterSlot.replaceChildren(meter(r.after));save.disabled=!(r.won||r.softened)};
 area.addEventListener('input',update);
 save.addEventListener('click',()=>{const text=area.value.trim();if(!text)return;B.addPracticeClause(text,row.topic+' · amendment',row.id);status.textContent='Saved as your practice amendment. It is at the top of the constitution.'});
 persuadeRoot.append(chips,label,area,score,meterSlot,save,status,make('p','Simulated residents with fixed concerns. A teaching toy, not a prediction of real people.','hint'));
 update();
}
persuadeBox?.addEventListener('toggle',()=>renderPersuade(true));

/* ---------- Patch notes ---------- */
function isoWeek(d=new Date()){const t=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));const day=t.getUTCDay()||7;t.setUTCDate(t.getUTCDate()+4-day);const y=t.getUTCFullYear(),w=Math.ceil(((t-Date.UTC(y,0,1))/86400000+1)/7);return {y,w}}
function noteLine(e){
 const ref=e.id?(/^P-/.test(e.id)?'your clause':e.id):'',quote=t=>'“'+String(t||'').slice(0,90)+(String(t||'').length>90?'…':'')+'”';
 if(e.type==='vote')return [{support:'BUFF',oppose:'NERF',unsure:'HOLD'}[e.position]||'VOTE',(e.topic||'')+' '+ref+' · '+(e.position==='support'?'+1 support':e.position==='oppose'?'+1 oppose':'+1 unsure')+(e.shared?' (shared)':' (you, practice)')];
 if(e.type==='clause')return ['NEW','Clause added: '+quote(e.text)];
 if(e.type==='amendment')return ['AMEND',(e.parent||'')+' reworded: '+quote(e.text)];
 if(e.type==='comment')return ['NOTE','Comment on '+(e.topic||'')+' '+ref];
 if(e.type==='deck')return ['DAILY',"Today's five done · "+M.plural(e.streak||1,'day')+' streak'];
 return null;
}
function patchText(lines,title){return [title,...lines.map(([tag,text])=>'- '+tag+' '+text)].join('\n')}
function renderPatch(){
 const body=$('patch-body');if(!body)return;const {y,w}=isoWeek(),title='Patch notes · '+y+'.'+String(w).padStart(2,'0');$('patch-title').textContent=title;
 const weekAgo=Date.now()-7*86400000,events=B.log().filter(e=>e.t>=weekAgo).reverse();
 const lines=events.map(noteLine).filter(Boolean).slice(0,12);const s=B.stats();
 lines.push(['MERGE',fmt(s.rawMentions-s.uniqueMentions)+' repeated mentions merged into '+fmt(s.clauses)+' clauses (synthetic corpus)']);
 const list=make('ul');for(const [tag,text] of lines){const li=make('li');li.append(make('b',tag),document.createTextNode(text));list.append(li)}
 const copy=button('Copy patch notes'),status=make('span','','small');
 copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(patchText(lines,'Helios '+title));status.textContent=' Copied.'}catch(e){status.textContent=' Copy is blocked here; select the list instead.'}});
 body.replaceChildren(list,copy,status);
 if(!events.length)body.prepend(make('p','Vote, comment or add a clause and it shows up here, game-patch style.','hint'));
}

/* ---------- See it in the world ---------- */
const world=$('world-sketch');
const SCENES={
 stop:{label:'A sunbaked bus stop gets shade, seating and a tree',svg:`
<rect x="0" y="0" width="600" height="220" fill="#13241f"/><rect x="0" y="176" width="600" height="44" fill="#22302c"/><path d="M0 198H600" stroke="#59706a" stroke-dasharray="18 14" stroke-width="3"/><rect x="0" y="164" width="600" height="12" fill="#2c3f38"/>
<g class="before-only"><circle cx="520" cy="46" r="34" fill="#f4d49d"/><circle cx="520" cy="46" r="52" fill="#f4d49d" opacity=".15"/><path d="M250 92q8-8 0-16t0-16M290 92q8-8 0-16t0-16M330 92q8-8 0-16t0-16" stroke="#f5a799" stroke-width="3" fill="none"/>
<g fill="#a9bdb6"><circle cx="262" cy="118" r="8"/><rect x="255" y="128" width="14" height="36" rx="5"/><circle cx="300" cy="138" r="8"/><rect x="292" y="148" width="16" height="18" rx="5"/></g></g>
<g class="after"><circle cx="540" cy="40" r="20" fill="#f4d49d" opacity=".7"/><circle cx="420" cy="100" r="38" fill="#3f7a55"/><rect x="415" y="120" width="10" height="46" fill="#6b5a45"/>
<path d="M205 98H345L330 86H220Z" fill="#baf2be"/><rect x="214" y="98" width="6" height="66" fill="#6f9d84"/><rect x="330" y="98" width="6" height="66" fill="#6f9d84"/><rect x="214" y="98" width="122" height="66" fill="#0a1512" opacity=".35"/><rect x="232" y="140" width="86" height="7" rx="3" fill="#c9b8a0"/>
<g fill="#eff7ef"><circle cx="252" cy="122" r="8"/><rect x="245" y="131" width="14" height="14" rx="5"/><circle cx="292" cy="122" r="8"/><rect x="285" y="131" width="14" height="14" rx="5"/></g></g>
<rect x="160" y="88" width="4" height="78" fill="#a9bdb6"/><circle cx="162" cy="82" r="13" fill="#baf2be"/><text x="162" y="86" font-size="9" text-anchor="middle" fill="#14251b" font-weight="700">BUS</text>`},
 flood:{label:'A flooded street drains after the drain is cleared',svg:`
<rect x="0" y="0" width="600" height="220" fill="#13241f"/><g fill="#2c3f38"><rect x="60" y="92" width="90" height="70"/><rect x="250" y="80" width="100" height="82"/><rect x="450" y="96" width="90" height="66"/></g>
<g fill="#4a6a5d"><path d="M50 92L105 56L160 92Z"/><path d="M240 80L300 44L360 80Z"/><path d="M440 96L495 62L550 96Z"/></g><rect x="0" y="162" width="600" height="58" fill="#22302c"/>
<g class="before-only"><path d="M0 170Q40 160 80 170T160 170T240 170T320 170T400 170T480 170T560 170T640 170V220H0Z" fill="#5f8fb0" opacity=".75"/><g stroke="#8fb3c9" stroke-width="2"><path d="M80 10l-8 22M180 20l-8 22M280 8l-8 22M380 18l-8 22M480 6l-8 22M560 24l-8 22"/></g><path d="M372 184l16 16M388 184l-16 16" stroke="#f5a799" stroke-width="4"/></g>
<g class="after"><path d="M0 206Q60 202 120 206T240 206T360 206T480 206T600 206V220H0Z" fill="#5f8fb0" opacity=".45"/><rect x="364" y="184" width="32" height="14" rx="2" fill="#baf2be"/><path d="M370 184v14M378 184v14M386 184v14" stroke="#14251b" stroke-width="2"/><path d="M300 192h50M420 192h-12" stroke="#baf2be" stroke-width="3" marker-end="url(#arrow)"/><circle cx="530" cy="36" r="18" fill="#f4d49d" opacity=".8"/></g>
<defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#baf2be"/></marker></defs>`},
 homes:{label:'Empty lots near the train line become homes people can afford',svg:`
<rect x="0" y="0" width="600" height="220" fill="#13241f"/><rect x="0" y="186" width="600" height="34" fill="#22302c"/><path d="M0 196H600M0 206H600" stroke="#59706a" stroke-width="2"/><g stroke="#59706a" stroke-width="3"><path d="M30 190v20M90 190v20M150 190v20M210 190v20M270 190v20M330 190v20M390 190v20M450 190v20M510 190v20M570 190v20"/></g>
<rect x="40" y="100" width="90" height="80" fill="#2c3f38"/><path d="M30 100L85 66L140 100Z" fill="#4a6a5d"/>
<g class="before-only"><g fill="none" stroke="#59706a" stroke-dasharray="6 6" stroke-width="2"><rect x="170" y="110" width="110" height="70"/><rect x="310" y="110" width="110" height="70"/><rect x="450" y="110" width="110" height="70"/></g><g font-size="16" font-weight="800" fill="#f5a799" text-anchor="middle"><text x="225" y="150">$$$</text><text x="365" y="150">$$$</text><text x="505" y="150">$$$</text></g></g>
<g class="after"><g fill="#2f4d40"><rect x="170" y="100" width="110" height="80"/><rect x="310" y="90" width="110" height="90"/><rect x="450" y="104" width="110" height="76"/></g><g fill="#baf2be"><path d="M160 100L225 64L290 100Z"/><path d="M300 90L365 52L430 90Z"/><path d="M440 104L505 70L570 104Z"/></g><g fill="#f4d49d"><rect x="186" y="118" width="16" height="16"/><rect x="246" y="118" width="16" height="16"/><rect x="326" y="108" width="16" height="16"/><rect x="386" y="108" width="16" height="16"/><rect x="356" y="140" width="16" height="16"/><rect x="466" y="120" width="16" height="16"/><rect x="526" y="120" width="16" height="16"/></g></g>`},
 crossing:{label:'A fast, wide road near a school gets a safe crossing',svg:`
<rect x="0" y="0" width="600" height="220" fill="#13241f"/><rect x="380" y="30" width="180" height="70" fill="#2c3f38"/><path d="M370 30L470 4L570 30Z" fill="#4a6a5d"/><text x="470" y="72" font-size="14" text-anchor="middle" fill="#a9bdb6" font-weight="700">SCHOOL</text>
<rect x="0" y="110" width="600" height="90" fill="#22302c"/><path d="M0 132H600M0 178H600" stroke="#59706a" stroke-dasharray="20 14" stroke-width="3"/><path d="M0 155H600" stroke="#f4d49d" stroke-width="3"/>
<g class="before-only"><rect x="90" y="118" width="70" height="24" rx="6" fill="#a9bdb6"/><path d="M60 124h22M54 132h28M60 140h22" stroke="#f5a799" stroke-width="3"/><rect x="400" y="164" width="70" height="24" rx="6" fill="#a9bdb6"/><path d="M480 170h22M480 178h28" stroke="#f5a799" stroke-width="3"/><rect x="40" y="62" width="40" height="40" rx="4" fill="#eff7ef"/><text x="60" y="89" font-size="18" text-anchor="middle" font-weight="800" fill="#14251b">55</text><circle cx="230" cy="96" r="7" fill="#eff7ef"/><rect x="224" y="103" width="12" height="16" rx="4" fill="#eff7ef"/></g>
<g class="after"><g fill="#eff7ef"><rect x="260" y="112" width="12" height="86"/><rect x="284" y="112" width="12" height="86"/><rect x="308" y="112" width="12" height="86"/><rect x="332" y="112" width="12" height="86"/></g><rect x="40" y="62" width="40" height="40" rx="4" fill="#eff7ef"/><text x="60" y="89" font-size="18" text-anchor="middle" font-weight="800" fill="#14251b">25</text><circle cx="230" cy="96" r="8" fill="#f4d49d"/><rect x="223" y="104" width="14" height="18" rx="4" fill="#f4d49d"/><circle cx="244" cy="86" r="9" fill="#f5a799"/><rect x="242" y="92" width="3" height="16" fill="#eff7ef"/><circle cx="302" cy="140" r="7" fill="#eff7ef"/><rect x="296" y="147" width="12" height="16" rx="4" fill="#eff7ef"/></g>`},
 commons:{label:'A shared space that closed early stays open, lit and busy',svg:`
<rect x="0" y="0" width="600" height="220" fill="#13241f"/><rect x="0" y="180" width="600" height="40" fill="#22302c"/><rect x="180" y="70" width="240" height="110" fill="#2c3f38"/><path d="M165 70L300 26L435 70Z" fill="#4a6a5d"/><g fill="#1d2f28"><rect x="200" y="84" width="14" height="96"/><rect x="250" y="84" width="14" height="96"/><rect x="336" y="84" width="14" height="96"/><rect x="386" y="84" width="14" height="96"/></g><rect x="280" y="120" width="40" height="60" fill="#1a2a24"/>
<g class="before-only"><circle cx="70" cy="44" r="18" fill="#c5d9ff" opacity=".7"/><circle cx="78" cy="38" r="16" fill="#13241f"/><rect x="226" y="96" width="148" height="18" rx="4" fill="#3a2a2a"/><text x="300" y="109" font-size="11" text-anchor="middle" fill="#f5a799" font-weight="800">CLOSED · 6 PM</text></g>
<g class="after"><g fill="#f4d49d"><rect x="218" y="96" width="26" height="20"/><rect x="268" y="96" width="62" height="20"/><rect x="356" y="96" width="26" height="20"/><rect x="282" y="122" width="36" height="58" opacity=".9"/></g><g fill="#eff7ef"><circle cx="120" cy="158" r="7"/><rect x="114" y="165" width="12" height="16" rx="4"/><circle cx="470" cy="158" r="7"/><rect x="464" y="165" width="12" height="16" rx="4"/><circle cx="500" cy="160" r="6"/><rect x="495" y="166" width="10" height="14" rx="4"/></g><circle cx="80" cy="150" r="26" fill="#3f7a55"/><rect x="76" y="166" width="8" height="16" fill="#6b5a45"/><circle cx="540" cy="150" r="24" fill="#3f7a55"/><rect x="536" y="166" width="8" height="16" fill="#6b5a45"/></g>`}
};
let worldTimer=0,worldKey='';
function renderWorld(draft){
 if(!world||!draft)return;const text=[draft.issue,draft.outcome,draft.approach,draft.title].join(' '),kind=M.sceneKind(text),scene=SCENES[kind]||SCENES.commons,key=kind+'|'+text;
 if(key===worldKey&&!world.hidden)return;worldKey=key;world.hidden=false;world.classList.remove('is-after');world.replaceChildren();
 const bar=make('div',undefined,'world-bar'),h=make('h2','See it in the world');h.id='world-title';const toggle=make('div',undefined,'world-toggle');
 const before=button('Today'),after=button('With your idea');before.setAttribute('aria-pressed','true');after.setAttribute('aria-pressed','false');
 const set=on=>{world.classList.toggle('is-after',on);before.setAttribute('aria-pressed',String(!on));after.setAttribute('aria-pressed',String(on))};
 before.addEventListener('click',()=>{clearTimeout(worldTimer);set(false)});after.addEventListener('click',()=>{clearTimeout(worldTimer);set(true)});
 toggle.append(before,after);bar.append(h,toggle);
 const holder=make('div');holder.innerHTML='<svg viewBox="0 0 600 220" role="img" aria-label="Illustrative sketch: '+scene.label+'">'+scene.svg+'</svg>';
 const caption=make('p','Illustrative sketch of your draft, not a forecast. ','world-caption');
 for(const [href,label] of [['./public/helios-futures.html','Explore 100 futures ↗'],['./eight_billion_map.html','8 billion thoughts map ↗']]){const a=make('a',label);a.href=href;a.target='_blank';a.rel='noopener noreferrer';caption.append(a)}
 world.append(bar,holder,caption);
 clearTimeout(worldTimer);worldTimer=setTimeout(()=>set(true),reduceMotion?0:900);
}
document.addEventListener('helios:draft',e=>renderWorld(e.detail));
if(window.HeliosLatestDraft&&!$('screen-3').hidden)renderWorld(window.HeliosLatestDraft);

/* ---------- Government budget role-play ---------- */
const BUDGET={stop:{unit:'shaded stop',units:'stops',cost:25000,total:600},flood:{unit:'drain upgrade',units:'flood hot spots',cost:60000,total:40},homes:{unit:'home repair grant',units:'households',cost:15000,total:300},crossing:{unit:'safer crossing',units:'dangerous crossings',cost:45000,total:80},commons:{unit:'site season',units:'sites',cost:40000,total:30}};
const budgetRoot=$('budget-play');
function renderBudget(p){
 if(!budgetRoot||!p)return;const kind=M.sceneKind([p.title,p.sharedGoal,p.illustrativeLocalOption].join(' ')),cfg=BUDGET[kind]||BUDGET.commons;budgetRoot.hidden=false;budgetRoot.replaceChildren();
 const h=make('h2','Budget role-play');h.id='budget-title';
 const field=(id,label,min,max,step,value)=>{const wrap=make('div');const l=make('label',label);l.htmlFor=id;const out=make('output');out.htmlFor=id;out.id=id+'-out';const input=make('input');input.type='range';input.id=id;input.min=min;input.max=max;input.step=step;input.value=value;input.setAttribute('value',value);wrap.append(l,out,input);return wrap};
 const grid=make('div',undefined,'budget-grid');
 const fTotal=field('budget-total','Your budget',50000,2000000,25000,250000),fUnit=field('budget-unit','Cost per '+cfg.unit,5000,200000,5000,cfg.cost),fSites=field('budget-sites','How many '+cfg.units+' to fund now',0,cfg.total,1,Math.min(cfg.total,Math.floor(250000/cfg.cost)));
 fSites.style.gridColumn='1/-1';grid.append(fTotal,fUnit,fSites);
 const bar=make('div',undefined,'budget-bar'),fill=make('span');bar.append(fill);
 const verdict=make('p','','budget-verdict');verdict.setAttribute('aria-live','polite');
 const use=button('Add this to the evidence notes');const done=make('span','','small');
 budgetRoot.append(h,make('p','You run this program. Illustrative numbers you can change; nothing here is a real budget.','hint'),grid,bar,verdict,use,done);
 const read=()=>({total:Number($('budget-total').value),unit:Number($('budget-unit').value),sites:Number($('budget-sites').value)});
 const update=()=>{const {total,unit,sites}=read(),spend=sites*unit,share=cfg.total?sites/cfg.total:0;
   $('budget-total-out').textContent=money(total);$('budget-unit-out').textContent=money(unit);$('budget-sites-out').textContent=fmt(sites)+' of '+fmt(cfg.total)+' '+cfg.units;
   fill.style.width=Math.min(100,total?spend/total*100:0)+'%';bar.classList.toggle('over',spend>total);
   verdict.textContent=(spend>total?'Over budget by '+money(spend-total)+'. Fund fewer '+cfg.units+', find savings, or say what gets cut.':'Spends '+money(spend)+' of '+money(total)+(total>spend?', leaving '+money(total-spend)+'.':'.'))+' Covers '+(share*100).toFixed(1)+'% of '+fmt(cfg.total)+' '+cfg.units+'; '+fmt(Math.max(0,cfg.total-sites))+' still waiting.'};
 for(const id of ['budget-total','budget-unit','budget-sites'])$(id).addEventListener('input',update);
 use.addEventListener('click',()=>{const {total,unit,sites}=read(),line='Budget role-play (illustrative): '+fmt(sites)+' '+cfg.units+' × '+money(unit)+' = '+money(sites*unit)+' of '+money(total)+'; covers '+fmt(sites)+' of '+fmt(cfg.total)+'.',ev=$('gov-evidence');ev.value=(ev.value.trim()?ev.value.trim()+'\n':'')+line;ev.dispatchEvent(new Event('input',{bubbles:true}));done.textContent=' Added.'});
 update();
}
document.addEventListener('helios:gov-record',e=>renderBudget(e.detail));

/* ---------- Wiring ---------- */
document.addEventListener('helios:board',e=>{const type=e.detail?.type;renderPatch();if(!deckBusy&&type!=='deck'&&type!=='select')renderDeck();renderPersuade(type==='select'||type==='connect'||type==='refresh')});
renderDeck();renderPatch();
