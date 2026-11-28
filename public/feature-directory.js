import {FEATURE_ROUTES,FEATURE_GROUPS,staticFeatureHref,rewriteStaticFeatureLinks} from './feature-routes.js';

const $=id=>document.getElementById(id),states=new Map();
const staticMode=document.querySelector('meta[name="helios-mode"]')?.content==='static';
const descriptions={'Explore':'Six ways to start. No shared database required.','Participate':'Make something real, with a receipt you can trust.','Research together':'A shared question. Many perspectives. Human review.'};
const symbols={'Explore':['✳','◈','◎','◌','▤','✎'],'Participate':['✓','＋','◉','⑂','✦','✉'],'Research together':['✺','▦','◇']};
let filter='all',requestNumber=0;
const node=(tag,text,cls)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el};

function render(){
  const query=$('feature-search').value.trim().toLowerCase();
  const selected=FEATURE_ROUTES.filter(item=>(filter==='all'||item.kind===filter)&&[item.title,item.route,item.description,item.storage,item.category].some(text=>text.toLowerCase().includes(query)));
  const root=$('feature-list');root.replaceChildren();
  for(const group of FEATURE_GROUPS){
    const items=selected.filter(item=>item.category===group);if(!items.length)continue;
    const section=node('section',undefined,'feature-group'),heading=node('div',undefined,'group-header'),title=node('h2',group);
    title.id='group-'+group.toLowerCase().replaceAll(' ','-');section.setAttribute('aria-labelledby',title.id);
    heading.append(title,node('p',descriptions[group]));section.append(heading);
    const grid=node('div',undefined,'feature-grid');
    for(const feature of items){
      const originalIndex=FEATURE_ROUTES.filter(item=>item.category===group).findIndex(item=>item.id===feature.id);
      const card=node('article',undefined,'feature-card');card.dataset.feature=feature.id;
      card.style.setProperty('--card-accent',['var(--accent)','var(--sky)','var(--rose)','var(--lilac)','var(--warning)'][originalIndex%5]);
      const top=node('div',undefined,'card-top'),symbol=node('span',symbols[group][originalIndex],'card-symbol');symbol.setAttribute('aria-hidden','true');
      top.append(symbol,node('code',feature.route,'route-label'));card.append(top,node('h3',feature.title),node('p',feature.description,'card-description'),node('p',feature.storage,'card-storage'));
      const state=states.get(feature.id),badge=node('p',undefined,'card-status');
      if(feature.kind==='browser'){badge.textContent='Ready in your browser';badge.dataset.state='ready';}
      else if(state){badge.textContent=state.available===true?'Available here':state.state==='checking'?'Checking connection':'Setup needed';badge.dataset.state=state.available===true?'ready':'unavailable';}
      else{badge.textContent='Checking connection';badge.dataset.state='checking';}
      card.append(badge);
      if(feature.kind==='server'&&state?.reason)card.append(node('p',state.reason,'card-reason'));
      const link=node('a',feature.action,'card-open');link.href=staticMode?staticFeatureHref(feature.id):feature.route;card.append(link);grid.append(card);
    }
    section.append(grid);root.append(section);
  }
  $('empty-results').hidden=selected.length>0;
}

async function checkConnections(){
  const ticket=++requestNumber;$('refresh-capabilities').disabled=true;$('directory-status').textContent='Checking which shared tools are available on this deployment…';
  if(staticMode){for(const feature of FEATURE_ROUTES.filter(item=>item.kind==='server'))states.set(feature.id,{available:false,reason:'This static preview has no shared backend. You can explore the interface; no shared records are saved.'});$('directory-status').textContent='Static preview · 6 browser tools. Shared services are not connected.';$('refresh-capabilities').disabled=false;render();return;}
  try{
    const response=await fetch('/api/features',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(10000)});
    const data=await response.json();if(!response.ok||!Array.isArray(data.features))throw Error('Capability response unavailable');
    if(ticket!==requestNumber)return;
    states.clear();for(const feature of data.features)if(FEATURE_ROUTES.some(item=>item.id===feature.id))states.set(feature.id,feature);
    for(const feature of FEATURE_ROUTES.filter(item=>item.kind==='server'))if(!states.has(feature.id))states.set(feature.id,{available:false,reason:'This deployment did not report a connection for this feature.'});
    const count=FEATURE_ROUTES.filter(item=>item.kind==='server'&&states.get(item.id)?.available===true).length;
    $('directory-status').textContent=`6 browser tools · ${count} of 9 shared capabilities available here. Checked just now; each shared action still needs its own confirmation.`;
  }catch{
    if(ticket!==requestNumber)return;
    for(const feature of FEATURE_ROUTES.filter(item=>item.kind==='server'))states.set(feature.id,{available:false,reason:'Connection could not be verified. Open the tool for its current status; your browser drafts remain available.'});
    $('directory-status').textContent='The capability service is unavailable. Browser tools are ready; shared connections have not been verified.';
  }finally{if(ticket===requestNumber){render();$('refresh-capabilities').disabled=false;}}
}

document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>{filter=button.dataset.filter;document.querySelectorAll('[data-filter]').forEach(other=>other.setAttribute('aria-pressed',String(other===button)));render();}));
$('feature-search').addEventListener('input',render);$('refresh-capabilities').addEventListener('click',checkConnections);
if(staticMode)rewriteStaticFeatureLinks(document);
render();checkConnections();
