// Fixed, source-checked Katy shortlist. No address is embedded in public code.
// The private #origin=... setup fragment is consumed locally and removed from the URL.
const places=[
{id:'yark',name:'Yark Green Thai',food:'Thai · Curries, pad Thai, fried rice',icon:'🍛',address:'23227 Mercantile Pkwy Ste A4, Katy, TX 77449',menu:'https://yarkgreenthairestaurant.toast.site/menu-2',featured:true},
{id:'phat',name:'Phat Eatery',food:'Malaysian · Roti, noodles, shareable plates',icon:'🥘',address:'23119 Colonial Pkwy Ste B-2, Katy, TX 77449',menu:'https://www.phateatery.com/'},
{id:'dumplings',name:'Supreme Dumplings',food:'Taiwanese · Soup dumplings and noodles',icon:'🥟',address:'23119 Colonial Pkwy A12, Katy, TX 77449',menu:'https://katyasiantownandmarketplace.com/our-directories/'},
{id:'kizuki',name:'Kizuki Ramen',food:'Japanese · Ramen and rice bowls',icon:'🍜',address:'23220 Grand Circle Blvd Suite 140, Katy, TX',menu:'https://www.kizuki.com/texas-katy/'},
{id:'redrobin',name:'Red Robin',food:'American · Burgers, fries and shakes',icon:'🍔',address:'Red Robin, Mercantile Parkway, Katy, TX',menu:'https://www.redrobin.com/locations/tx/katy/katy-503'}
];
const members=['Member 1','Member 2','Member 3','Member 4'];
const $=id=>document.getElementById(id);
const storageKey='helios.lunch.origin.v1';
const ballotKey='helios.lunch.ballot.v1';
function read(key){try{return localStorage.getItem(key)}catch{return null}}
function write(key,value){try{localStorage.setItem(key,value);return true}catch{return false}}
function remove(key){try{localStorage.removeItem(key)}catch{}}
function validOrigin(x){return typeof x==='string'&&x.trim().length>0&&x.trim().length<=180&&!/[\u0000-\u001f\u007f]/.test(x)}
let origin=read(storageKey)||'',gps=null,locationAttempt=0;
if(!validOrigin(origin))origin='';
const setup=new URLSearchParams(location.hash.slice(1));const supplied=setup.get('origin');
if(validOrigin(supplied)){origin=supplied.trim();write(storageKey,origin);history.replaceState(null,'',location.pathname+location.search)}
$('origin').value=origin;
let votes=Array(4).fill(null),active=0;
try{const saved=JSON.parse(read(ballotKey)||'null');if(Array.isArray(saved)&&saved.length===4&&saved.every(x=>x===null||places.some(p=>p.id===x)))votes=saved}catch{}
const firstUnvoted=votes.indexOf(null);if(firstUnvoted!==-1)active=firstUnvoted;
function node(tag,text,className){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el}
function counts(){return places.map(p=>votes.filter(v=>v===p.id).length)}
function leaders(){const c=counts(),max=Math.max(...c);return max?places.filter((p,i)=>c[i]===max):[]}
function choose(id){if(!places.some(p=>p.id===id))return;const who=active;votes[who]=id;write(ballotKey,JSON.stringify(votes));let next=-1;for(let i=1;i<=4;i++){const j=(who+i)%4;if(votes[j]===null){next=j;break}}if(next>=0)active=next;render();$('vote-note').textContent=members[who]+' voted for '+places.find(p=>p.id===id).name+'. '+(next>=0?members[next]+", you're next.":'All four votes are in. Select any person to change a vote.');$('family').children[active]?.focus()}
function maps(destination){const q=new URLSearchParams({api:'1',destination,travelmode:'driving'});const start=gps?gps.join(','):origin;if(start)q.set('origin',start);window.open('https://www.google.com/maps/dir/?'+q,'_blank','noopener,noreferrer')}
function nearby(){const q=new URLSearchParams({api:'1',query:'restaurants near '+(gps?gps.join(','):origin||'Katy Asian Town, Katy, TX')});window.open('https://www.google.com/maps/search/?'+q,'_blank','noopener,noreferrer')}
function render(){const total=votes.filter(Boolean).length,c=counts(),top=leaders();$('voter-count').textContent=total+' / 4 voted';$('active-member').textContent=members[active]+"'s turn";
 const family=members.map((name,i)=>{const b=node('button',undefined,'member');b.type='button';b.setAttribute('aria-pressed',String(active===i));b.dataset.voted=String(Boolean(votes[i]));b.append(node('span',String(i+1),'avatar'),node('b',name),node('small',votes[i]?'✓ Voted':'Not voted'));b.addEventListener('click',()=>{active=i;render();$('family').children[i].focus()});return b});$('family').replaceChildren(...family);
 const cards=places.map((p,i)=>{const article=node('article',undefined,'restaurant'+(p.featured?' featured':''));const art=node('div',p.icon,'dish');art.setAttribute('aria-hidden','true');const text=node('div');if(p.featured)text.append(node('div','First on the ballot','tag'));text.append(node('h3',p.name),node('p',p.food),node('p',p.address));const links=node('div',undefined,'links');const menu=node('a',p.id==='dumplings'?'Directory ↗':'Menu / website ↗');menu.href=p.menu;menu.target='_blank';menu.rel='noopener noreferrer';const directions=node('button','Directions ↗','button-link');directions.type='button';directions.addEventListener('click',()=>maps(p.name+', '+p.address));links.append(menu,directions);text.append(links);const b=node('button',votes[active]===p.id?'✓ Voted':'Vote','vote');b.type='button';b.dataset.place=p.id;b.setAttribute('aria-pressed',String(votes[active]===p.id));b.setAttribute('aria-label','Vote for '+p.name+' as '+members[active]);b.addEventListener('click',()=>choose(p.id));article.append(art,text,b);return article});$('restaurants').replaceChildren(...cards);
 const rows=places.map((p,i)=>{const row=node('div',undefined,'tally-row');const head=node('div',undefined,'tally-title');head.append(node('span',p.name),node('b',String(c[i])+' / 4'));const bar=node('div',undefined,'bar');bar.setAttribute('role','progressbar');bar.setAttribute('aria-label',p.name+' votes');bar.setAttribute('aria-valuenow',String(c[i]));bar.setAttribute('aria-valuemin','0');bar.setAttribute('aria-valuemax','4');const fill=node('div',undefined,'fill');fill.style.width=c[i]*25+'%';bar.append(fill);row.append(head,bar);return row});$('tallies').replaceChildren(...rows);
 $('result-label').textContent=total===0?'LET THE VOTING BEGIN':total<4?'CURRENT TALLY':top.length===1?'FAMILY WINNER':'TIE — TALK IT OVER';
 $('result-title').textContent=total===0?'What’s for lunch?':top.length===1?top[0].name:top.map(p=>p.name).join(' · ');
 $('result-detail').textContent=total===0?'One vote per person. Everyone can change their mind.':total<4?(4-total)+' vote'+(4-total===1?'':'s')+' remaining. No final result yet.':top.length===1?'All four votes are in. Enjoy lunch!':'All four votes are in. Re-vote or decide together.';
 $('winner-directions').disabled=total!==4||top.length!==1;
}
function updateLocation(message){$('location-mode').textContent=gps?'Device location · enabled':origin?'Saved starting address':'Katy, Texas · curated lunch choices';$('location-status').textContent=message|| (gps?'GPS will be used when you open Maps.':origin?'Default address ready for directions.':'Choose an address or enable GPS for directions. No live location requested automatically.')}
$('location-form').addEventListener('submit',e=>{e.preventDefault();const value=$('origin').value.trim();if(!validOrigin(value)){updateLocation('Enter a valid starting address or area.');return}locationAttempt++;gps=null;origin=value;const saved=write(storageKey,origin);updateLocation(saved?'Default saved on this browser.':'Default set for this visit; browser storage unavailable.')});
$('gps').addEventListener('click',()=>{if(!navigator.geolocation){updateLocation('GPS is unavailable in this browser. Use your default address.');return}const attempt=++locationAttempt;updateLocation('Requesting your permission…');navigator.geolocation.getCurrentPosition(p=>{if(attempt!==locationAttempt)return;gps=[p.coords.latitude,p.coords.longitude];updateLocation('Device location enabled. Your saved default is unchanged.')},()=>{if(attempt!==locationAttempt)return;gps=null;updateLocation('Location unavailable or denied. Using your saved address or Katy fallback.')},{enableHighAccuracy:false,timeout:12000,maximumAge:60000})});
$('forget').addEventListener('click',()=>{locationAttempt++;gps=null;origin='';remove(storageKey);$('origin').value='';updateLocation('Saved location removed. No location is active.')});
$('nearby').addEventListener('click',nearby);$('winner-directions').addEventListener('click',()=>{const top=leaders();if(votes.every(Boolean)&&top.length===1)maps(top[0].name+', '+top[0].address)});
$('reset').addEventListener('click',()=>{votes=Array(4).fill(null);active=0;remove(ballotKey);render();$('vote-note').textContent='New ballot ready. Member 1, you’re up.';$('family').children[0]?.focus()});
render();updateLocation();
