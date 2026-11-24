// Standalone, deterministic visual-novel encounter for the first grid panel.
// All dialogue and art are fictional and local. No network requests or storage.
import {mountPopulation} from './population-chamber.js';
const $=id=>document.getElementById(id);
const modal=$('story-modal'), canvas=$('story-canvas'), ctx=canvas.getContext('2d');
const edit={label:'[Edit] Open the constitution editor.',detail:'Return to your three fragments; your place in the story is preserved.',action:'edit'};
const scenes={
  arrival:{place:'The Lagrange Archive · 2036',speaker:'NARRATOR',title:'A message from a future that never happened.',art:'arrival',text:'The airlock opens onto a cathedral of glass and machinery. Below its windows, Earth turns silently. A silver projection of Helios stands between two living archives: the violet Netherbrain and the multicolored Rainbow Brain. Three strips of luminous text hang between them.\n“You were not expected for another ten years. Yet here you are. The city reviewed a hundred proposals. The Netherbrain insists the records agree. The Rainbow Brain remembers a dissenting resident. One promise disappeared between review and execution.”',objective:'Quest: find the missing promise. You may inspect the record or edit it at any point.',choices:[{label:'“Show me the missing page.”',detail:'Follow Helios into the memory vault.',next:'vault'},{label:'[Insight] “Who decided the city was finished?”',detail:'Question the source of the record.',next:'witness'},edit]},
  vault:{place:'Memory vault · Record 100',speaker:'HELIOS · ARCHIVE INTELLIGENCE',title:'One hundred proposals. One impossible silence.',art:'vault',text:'Three panes hang over a dark circular altar: a resident’s journal, a city engineer’s report, and the constitution they became. The Netherbrain compressed them into one answer; the Rainbow Brain retained their differences. A holographic station flickers. Its platform is empty.\n“I can recover the records. I cannot know what the residents wanted unless someone asks. Will you decide what belongs in the next draft?”',objective:'Evidence: a confident synthesis is not proof of consent. Compare the source fragments to find who was responsible for the connection.',choices:[{label:'[Investigate] Compare the resident and engineer accounts.',detail:'Hear the witness before choosing an interpretation.',next:'witness'},{label:'“Test a different future before we touch the record.”',detail:'Open the counterfactual chamber.',next:'mirror'},{label:'[Investigate] Enter the chamber of eight billion memories.',detail:'Examine synthetic citizens before interpreting the missing promise.',next:'population'},edit]},
  witness:{place:'Witness chamber · Transit district',speaker:'MIRA VALE · RESIDENT WITNESS',title:'The station was beautiful. I could not reach it.',art:'witness',text:'A woman appears in the archive’s blue light, rain suspended around her like beads of glass. Behind her, the station glows on the horizon.\n“They counted the opening ceremony as a victory. But our footbridge was never built. I asked who owned the connection. Everyone pointed at someone else.”',objective:'Evidence: completing a building is not the same as improving access.',choices:[{label:'“Let us test what a connection would have changed.”',detail:'Compare a second future.',next:'mirror'},{label:'“No promise should disappear without an explanation.”',detail:'Ask Helios to reveal the final record.',next:'council'},edit]},
  mirror:{place:'Counterfactual chamber · Twin timelines',speaker:'HELIOS',title:'Two cities. The same beginning.',art:'mirror',text:'The Rainbow Brain refracts the planet into two shimmering models. The Netherbrain’s single prediction cannot show the disagreement. In one, an immaculate station stands alone. In the other, bridges and transit routes converge on its platform.\n“These are illustrations, not predictions. A model can reveal an assumption; only evidence and human judgment can tell us whether it holds.”',objective:'Quest: carry the access question into the city simulator.',choices:[{label:'[Compare] Investigate who measures the outcome.',detail:'Return to the final record.',next:'council'},{label:'“Open the city simulator. I want to change the assumptions.”',detail:'Leave the modal and explore Panel 2.',action:'city'},edit]},
  population:{place:'The chamber of eight billion · Synthetic minds',speaker:'HELIOS · POPULATION ARCHIVE',title:'A ballot is not a life.',art:'population',text:'Beyond the archive, eight billion lights flicker. Helios can reconstruct a fictional citizen from an address, with needs, priorities and memories. One resident remembers being stranded by a missing footbridge. Another fears losing income during construction. Neither is a statistic to dismiss.\n“Change a proposal, not their memories. Observe the simulated disagreement. Then tell me what the model cannot know.”',objective:'Quest: inspect a citizen, change the assumptions and rerun the illustrative ballot. These are synthetic people, never real voters.',choices:[{label:'[Insight] “A simulation cannot replace consent.”',detail:'Bring the unresolved needs back to the council.',next:'council'},{label:'“Compare the actual city outcomes.”',detail:'Return to the twin timelines.',next:'mirror'},edit]},
  council:{place:'Council of echoes · The final record',speaker:'HELIOS',title:'Who gets to write tomorrow?',art:'council',text:'A hundred lanterns illuminate the circular chamber. Each represents a proposal, not a law. The empty chair is yours.\n“The two minds agree on one thing: their records were incomplete. The missing promise was accountability. A named owner, a connection residents could actually use, and a date to measure the result. I can offer possibilities. You and your community must judge them.”',objective:'The archive is ready for your review. The original draft is still yours to change.',choices:[edit,{label:'[Draft] Review the 100 implementation proposals.',detail:'Generate reviewable cards from the existing catalog, not enacted laws.',action:'draft'},{label:'“I need to hear the other witnesses.”',detail:'Continue the investigation in Panel 3.',action:'chat'},{label:'Return to the memory vault.',next:'vault'}]}
};
let scene='arrival',visited=new Set();
const population=mountPopulation($('story-objective'));
const palettes={
 arrival:['#0a111e','#23474b','#b6d8bf','#f0c88c'],
 vault:['#100e21','#3e345d','#b2c3ec','#e8bd91'],
 witness:['#101927','#31435b','#90c7e2','#f2c382'],
 mirror:['#080f20','#164b52','#79e6d0','#edba77'],
 population:['#070e19','#153b43','#8bd8bd','#f0c88c'],
 council:['#160f16','#51403d','#e4c6a0','#f8d98a']
};
function draw(art){
 if(!ctx)return;
 const W=canvas.width,H=canvas.height,[dark,mid,light,gold]=palettes[art];
 let seed=1501;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
 function path(points,fill,stroke,width=1){ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill()}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke()}}
 function line(points,color,width=1){ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke()}
 function ellipse(x,y,rx,ry,fill,stroke,width=1){ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);if(fill){ctx.fillStyle=fill;ctx.fill()}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke()}}
 function glow(x,y,r,color,alpha=.7){ctx.save();ctx.globalAlpha=alpha;const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,color);g.addColorStop(1,'transparent');ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);ctx.restore()}
 let sky=ctx.createLinearGradient(0,0,0,H);sky.addColorStop(0,dark);sky.addColorStop(.65,mid);sky.addColorStop(1,dark);ctx.fillStyle=sky;ctx.fillRect(0,0,W,H);
 glow(600,185,420,light,.21);
 // Deep-space light, a planet and a thin atmospheric rim behind the vaulted window.
 ctx.save();ctx.beginPath();ctx.rect(0,0,W,345);ctx.clip();for(let i=0;i<260;i++){let x=rand()*W,y=rand()*340;ctx.globalAlpha=.15+rand()*.65;ctx.fillStyle=i%7?light:gold;ctx.fillRect(x,y,i%19?1.4:3,i%19?1.4:3)}ctx.globalAlpha=1;
 const px=art==='mirror'?600:865,py=art==='mirror'?205:310,pr=art==='mirror'?105:195;
 glow(px,py,pr*1.4,light,.42);const planet=ctx.createRadialGradient(px-pr*.35,py-pr*.58,15,px,py,pr);planet.addColorStop(0,light);planet.addColorStop(.45,mid);planet.addColorStop(1,dark);
 ellipse(px,py,pr,pr,planet,light,2);ctx.save();ctx.beginPath();ctx.arc(px,py,pr,0,Math.PI*2);ctx.clip();for(let i=0;i<28;i++){let y=py-pr+i*pr/14;ctx.globalAlpha=.08+rand()*.1;line([[px-pr,y],[px-40,y+rand()*18],[px+pr,y-13]],i%2?light:gold,3+rand()*9)}ctx.restore();ctx.restore();
 // Floor panels, distant stairs and monumental Gothic-in-space ribs.
 path([[0,346],[1200,346],[1200,H],[0,H]],dark);
 for(let i=-8;i<=8;i++)line([[600+i*40,346],[600+i*180,H]],mid,2);
 for(let i=0;i<11;i++){let t=i/10,y=346+t*t*188;line([[0,y],[W,y]],mid,1)}
 for(let i=0;i<5;i++){const x=30+i*30;line([[x,H],[x+28,168],[160+i*42,40],[400+i*38,0]],'#0a1016',22);line([[W-x,H],[W-x-28,168],[W-160-i*42,40],[W-400-i*38,0]],'#0a1016',22);line([[x+13,357],[x+43,169],[160+i*42+12,42],[400+i*38+10,0]],gold+'55',2);line([[W-x-13,357],[W-x-43,169],[W-160-i*42-12,42],[W-400-i*38-10,0]],gold+'55',2)}
 for(let i=0;i<5;i++){let y=380+i*13;path([[360-i*28,y],[840+i*28,y],[855+i*28,y+10],[345-i*28,y+10]],i%2?mid:dark,gold+'33')}
 // Concentric interface glyphs and illuminated architecture.
 const ringX=art==='witness'?850:600;for(let i=0;i<4;i++)ellipse(ringX,315,120+i*33,17+i*5,null,light+'44',1.5);
 function holo(x,y,w,h,label){glow(x+w/2,y+h/2,w*.9,light,.12);path([[x,y+13],[x+w,y],[x+w,y+h],[x,y+h-13]],mid+'9e',light+'bb',1.5);for(let i=0;i<8;i++){let yy=y+28+i*(h-42)/8;line([[x+13,yy],[x+13+rand()*(w-26),yy-3]],light+'88',1.6)}ctx.fillStyle=gold;ctx.font='12px monospace';ctx.fillText(label,x+12,y+h-12)}
 function silhouette(x,y,s,kind){
  ctx.save();ctx.translate(x,y);ctx.scale(s,s);glow(0,-118,106,kind==='mira'?light:gold,.23);ellipse(0,-115,22,28,dark,light+'99',2);path([[-16,-138],[0,-151],[17,-139],[22,-108],[13,-99],[-15,-101],[-22,-109]],dark,kind==='helios'?gold:light,1.6);
  if(kind==='helios'){line([[-13,-122],[13,-122]],light,3);line([[0,-151],[0,-171]],gold,2)}
  path([[-20,-101],[-42,-82],[-57,-22],[-42,-7],[-26,-57],[-31,10],[-45,65],[-12,66],[0,15],[13,66],[47,65],[32,10],[27,-56],[42,-7],[57,-22],[42,-82],[20,-101]],dark,light+'99',2);
  path([[-20,-95],[0,-78],[20,-95],[25,-40],[0,-18],[-25,-40]],mid,light+'88',1.5);
  line([[-38,-80],[-25,-61],[0,-68],[25,-61],[38,-80]],gold+'cc',2);line([[0,-78],[0,-20]],gold,2);ellipse(0,-68,5,5,light,gold);ctx.restore();
 }
 if(art==='arrival'){silhouette(600,340,1.55,'helios');holo(360,132,100,100,'JOURNAL');holo(742,140,106,104,'RECORD');}
 if(art==='vault'||art==='arrival'){
   for(const [cx,rainbow] of [[110,false],[1090,true]]){glow(cx,160,90,rainbow?'#7dceb2':'#b18bdc',.22);ellipse(cx,160,65,44,null,rainbow?'#92cbb0':'#c3a4e6',1.5);for(let j=0;j<9;j++){const a=j*Math.PI*2/9,xx=cx+Math.cos(a)*53,yy=160+Math.sin(a)*34;line([[cx,160],[xx,yy]],rainbow?['#e4a5a2','#f0d18b','#a9d5ad','#78d1c9','#a5bdec','#d9ace9'][j%6]+'99':'#b399d788',1.6);ellipse(xx,yy,3.6,3.6,rainbow?['#e4a5a2','#f0d18b','#a9d5ad','#78d1c9','#a5bdec','#d9ace9'][j%6]:'#c5abea')}ellipse(cx,160,9,9,rainbow?'#90d4ad':'#bc9ce7');ctx.fillStyle=gold;ctx.font='10px monospace';ctx.fillText(rainbow?'RAINBOW BRAIN':'NETHERBRAIN',cx-45,218)}
 }
 if(art==='vault'){for(let i=0;i<3;i++)holo(290+i*210,105-i%2*18,175,220,['RESIDENT','ENGINEER','CONSTITUTION'][i]);silhouette(600,405,.7,'helios')}
 if(art==='witness'){silhouette(600,328,1.48,'mira');for(let i=0;i<50;i++){let x=370+rand()*460,y=rand()*320;line([[x,y],[x-4,y+16]],light+'55',1)}holo(775,220,145,92,'ACCESS / NULL')}
 if(art==='mirror'){for(let j=0;j<2;j++){let cx=j?817:383;glow(cx,238,175,j?light:gold,.19);path([[cx,145],[cx+160,235],[cx,325],[cx-160,235]],mid,light+'aa',1.5);for(let i=0;i<17;i++){let a=rand()*.8+.1,b=rand()*.8+.1,x=cx+(a-b)*145,y=175+(a+b)*52,h=15+rand()*55;path([[x-7,y],[x-7,y-h],[x+6,y-h-7],[x+17,y-h],[x+17,y],[x+5,y+7]],dark,j?light:gold,1)}line([[cx-140,244],[cx,308],[cx+130,244]],j?light:gold,j?4:1);ctx.fillStyle=gold;ctx.font='12px monospace';ctx.fillText(j?'BRANCH B / CONNECTED':'BRANCH A / ISOLATED',cx-85,355)}silhouette(600,425,.75,'helios')}
 if(art==='population'){for(let i=0;i<3800;i++){let a=rand()*Math.PI*2,r=Math.sqrt(rand()),x=600+Math.cos(a)*r*360,y=232+Math.sin(a)*r*154;ctx.globalAlpha=.22+rand()*.65;ellipse(x,y,i%47?1.3:2.6,i%47?1.3:2.6,i%5?light:gold)}ctx.globalAlpha=1;silhouette(600,396,.9,'helios');ctx.fillStyle=gold;ctx.font='15px monospace';ctx.fillText('8,000,000,000 SYNTHETIC IDENTITIES',430,460)}
 if(art==='council'){for(let i=0;i<100;i++){let a=Math.PI*2*i/100,x=600+Math.cos(a)*350,y=275+Math.sin(a)*112;glow(x,y,14,gold,.44);ellipse(x,y,2.6,4,gold)}silhouette(600,330,1.3,'helios');}
 // Frame, film grain, vignette, and foreground.
 ctx.save();ctx.globalAlpha=.13;for(let i=0;i<5500;i++){let x=rand()*W,y=rand()*H;ctx.fillStyle=i%2?'#fff':'#000';ctx.fillRect(x,y,1,1)}ctx.restore();
 const v=ctx.createRadialGradient(W*.5,H*.42,H*.22,W*.5,H*.5,W*.56);v.addColorStop(0,'transparent');v.addColorStop(1,'#04070bdc');ctx.fillStyle=v;ctx.fillRect(0,0,W,H);
 ctx.strokeStyle=gold+'88';ctx.lineWidth=1;ctx.strokeRect(12,12,W-24,H-24);
}
function render(focus=true){const node=scenes[scene];visited.add(scene);window.dispatchEvent(new CustomEvent('helios:story-progress',{detail:{seen:visited.size}}));$('story-location').textContent=node.place;$('story-speaker').textContent=node.speaker;$('story-heading').textContent=node.title;$('story-text').textContent=node.text;$('story-objective').textContent=node.objective;$('story-chapter').textContent='HELIOS / CHAPTER I · '+String(visited.size).padStart(2,'0')+'/'+String(Object.keys(scenes).length).padStart(2,'0')+' scenes seen';canvas.setAttribute('aria-label','Fictional cinematic scene: '+node.place);draw(node.art);population.show(scene==='population');const buttons=node.choices.map((choice,i)=>{const b=document.createElement('button');b.type='button';b.className='story-choice'+(choice.action==='edit'?' edit':'');const shortcut=String(i+1);b.setAttribute('aria-keyshortcuts',shortcut+(choice.action==='edit'?' E':''));const n=document.createElement('kbd');n.textContent=shortcut;n.setAttribute('aria-hidden','true');const t=document.createElement('span');t.textContent=choice.label;if(choice.detail){const sub=document.createElement('small');sub.textContent=choice.detail;t.append(sub)}b.append(n,t);if(choice.action==='edit'){const e=document.createElement('kbd');e.className='edit-key';e.textContent='E';e.setAttribute('aria-hidden','true');b.append(e)}b.addEventListener('click',()=>choose(choice));return b});$('story-choices').replaceChildren(...buttons);if(focus)$('story-heading').focus({preventScroll:true});modal.scrollTop=0}
function closeTo(id){modal.close();window.heliosRoute?.(id==='constitution'?'demo':id==='year'?'visualize':'chat');const target=$(id);target?.focus();target?.scrollIntoView({block:'center',behavior:'instant'})}
function choose(choice){if(choice.next){scene=choice.next;render();return}switch(choice.action){case 'edit':closeTo('constitution');break;case 'city':closeTo('year');break;case 'chat':closeTo('message');break;case 'draft':modal.close();window.heliosRoute?.('demo');if(!$('generate').disabled)$('generate').click();$('generate').scrollIntoView({block:'center'});($('generate').disabled?$('constitution'):$('generate')).focus();break}}
function open(){if(!modal.open)modal.showModal();render()}
function reset(){scene='arrival';visited.clear();window.dispatchEvent(new CustomEvent('helios:story-progress',{detail:{seen:0}}));population.reset();if(modal.open)render()}
window.addEventListener('helios:open-story',open);$('story-open').addEventListener('click',open);$('story-close').addEventListener('click',()=>modal.close());$('story-restart').addEventListener('click',reset);$('reset').addEventListener('click',reset);modal.addEventListener('click',e=>{if(e.target===modal){const r=modal.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)modal.close()}});
// Scope shortcuts to the open dialog. Native Tab/Enter/Space and Escape still work.
modal.addEventListener('keydown',event=>{
  if(!modal.open||event.defaultPrevented||event.isComposing||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey)return;
  if(event.target instanceof Element && (event.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]')||event.target.isContentEditable))return;
  const buttons=[...$('story-choices').querySelectorAll('button:not(:disabled)')];
  let index=-1;
  if(/^[1-9]$/.test(event.key))index=Number(event.key)-1;
  else if(event.key.toLowerCase()==='e')index=buttons.findIndex(b=>b.classList.contains('edit'));
  else if(event.key==='ArrowDown'||event.key==='ArrowUp'){
    if(!buttons.length)return;
    event.preventDefault();
    const current=buttons.indexOf(document.activeElement), direction=event.key==='ArrowDown'?1:-1;
    buttons[current<0?(direction===1?0:buttons.length-1):(current+direction+buttons.length)%buttons.length].focus();
    return;
  }else return;
  if(!buttons[index])return;
  event.preventDefault();
  if(!event.repeat)buttons[index].click();
});
const entry=new URLSearchParams(location.search).get('story');
if(entry==='population'){scene='population';open()}else if(entry==='1'||location.pathname==='/story'||new URLSearchParams(location.search).get('stage')==='story')open();
