import {FEATURE_ROUTES,rewriteStaticFeatureLinks} from './feature-routes.js';

const $=id=>document.getElementById(id);
const paths={'/journal':'journal','/account':'account','/draft':'drafting','/pull-requests':'pull-requests','/notifications':'email'};
const path=location.pathname.replace(/\/$/,'')||'/';
const selected=paths[path]||(path.endsWith('/public/feature-workspace.html')?new URLSearchParams(location.search).get('feature'):null);
const feature=FEATURE_ROUTES.find(item=>item.id===selected&&['journal','account','drafting','pull-requests','email'].includes(item.id));
const staticMode=document.querySelector('meta[name="helios-mode"]')?.content==='static';
const text=(tag,value,cls)=>{const node=document.createElement(tag);node.textContent=value;if(cls)node.className=cls;return node;};
const say=(id,message,state='')=>{const node=$(id);node.textContent=message;node.dataset.state=state;};
const pendingWrites=new Map();

const details={
  journal:{title:'A place for your thoughts.',eyebrow:'HELIOS / PRIVATE JOURNAL',aside:'Only on this device.',body:'Saving here writes to your browser’s local storage. This page does not call an API or connect to an account.',detail:'Browser storage is not encrypted. Anyone using this browser profile can open these entries. Export a copy before clearing browser data.'},
  account:{title:'Make yourself at home.',eyebrow:'HELIOS / YOUR ACCOUNT',aside:'Your settings, together.',body:'Preferences belong to your verified signed-in account. A successful save records a revision so another device cannot silently overwrite it.',detail:'Signing in does not upload your journal or claim earlier guest votes. A display name is not a verified civic identity.'},
  drafting:{title:'Good ideas welcome questions.',eyebrow:'HELIOS / DRAFTING STUDIO',aside:'A suggestion, for you.',body:'The provider receives the draft, question, and perspectives you approve. The server saves the generated result as a retry receipt; its provider key stays private.',detail:'Generated wording can be wrong. Review its claims and trade-offs. A saved retry receipt does not publish or adopt a proposal.'},
  'pull-requests':{title:'Make the next thing better.',eyebrow:'HELIOS / PUBLIC CONTRIBUTION',aside:'Review. Then publish.',body:'You see the exact title and message before a server creates a proposal file and pull request in the HeliosHTML repository.',detail:'The pull request is public. It needs human review, and this feature never merges it. A failed or uncertain request is not reported as published.'},
  email:{title:'An idea worth coming back to.',eyebrow:'HELIOS / EMAIL FOLLOW-UP',aside:'One email, by choice.',body:'The backend stores your opt-in and schedules one follow-up. Delivery also needs a configured email provider and running worker.',detail:'Every email includes an unsubscribe link. The journal and your account password are never part of an email subscription.'},
};

function download(filename,value,type='application/json'){
  const url=URL.createObjectURL(new Blob([typeof value==='string'?value:JSON.stringify(value,null,2)+'\n'],{type}));
  const link=document.createElement('a');link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function readJSON(url,options={}){
  if(staticMode&&url.startsWith('/api/'))throw Error('Shared services are unavailable on this static preview.');
  const response=await fetch(url,{credentials:'same-origin',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(30000),...options});
  const value=await response.json().catch(()=>null);
  if(!response.ok||!value){const error=Error(typeof value?.error==='string'?value.error:`The server did not confirm this request (HTTP ${response.status}).`);error.status=response.status;throw error;}
  return value;
}
async function authHeaders(){
  const before=window.HeliosAccount?.getState();
  if(!before?.authenticated)throw Error('Sign in to a verified account before continuing.');
  const headers=await window.HeliosAccount.fetchHeaders('preferences');
  if(!headers?.['X-Helios-Access-Token'])throw Error('Account saving is not available on this deployment. Your draft has not been sent.');
  if(window.HeliosAccount.getState().user?.id!==before.user?.id)throw Error('Your account changed. Review the action again.');
  return {headers,userId:before.user.id};
}
async function request(path,{body,account=false}={}){
  const proof=account?await authHeaders():{headers:{},userId:null};
  const headers={Accept:'application/json',...proof.headers};
  const options={headers};
  if(body!==undefined){
    const session=await readJSON('/api/session',{headers});
    if(typeof session.csrfToken!=='string')throw Error('The server could not establish a session.');
    if(proof.userId&&window.HeliosAccount.getState().user?.id!==proof.userId)throw Error('Your account changed. Review the action again.');
    const signature=JSON.stringify({actor:proof.userId,body}),prior=pendingWrites.get(path);
    const key=prior?.signature===signature?prior.key:crypto.randomUUID();pendingWrites.set(path,{signature,key});
    options.method='POST';options.body=JSON.stringify(body);Object.assign(headers,{'Content-Type':'application/json','X-CSRF-Token':session.csrfToken,'Idempotency-Key':key});
  }
  const result=await readJSON(path,options);
  if(proof.userId&&window.HeliosAccount.getState().user?.id!==proof.userId)throw Error('Your account changed while the request was finishing. Load the saved record before trying again.');
  // Keep the receipt key even after a successful HTTP response. The caller may
  // still reject a malformed receipt, and retrying must not publish twice.
  return result;
}
async function catalog(){
  const data=await readJSON(new URL('./law-catalog.json',import.meta.url).href);
  if(!Array.isArray(data.goals))throw Error('The public proposal catalog is unavailable.');
  return data.goals.filter(law=>/^HGA-(?:00[1-9]|0[1-9]\d|100)$/.test(law.id)&&typeof law.title==='string');
}
function accountModule(){
  if(staticMode)return Promise.resolve();
  if(!document.querySelector('[data-account-styles]')){const link=document.createElement('link');link.rel='stylesheet';link.href='/public/account.css';link.dataset.accountStyles='true';document.head.append(link);}
  return import('/public/account.js');
}

function setupJournal(){
  const key='helios-private-journal-v1';
  let entries=[],activeId=null,baseline=null,dirty=false,storageBroken=false;
  const current=()=>({title:$('journal-title').value.trim(),body:$('journal-body').value});
  function renderList(){
    $('journal-entry-count').textContent=`${entries.length} ${entries.length===1?'entry':'entries'}`;
    const root=$('journal-entries');root.replaceChildren();
    if(!entries.length){root.append(text('p','Your first saved thought will appear here.','journal-empty'));return;}
    for(const entry of [...entries].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))){
      const button=document.createElement('button');button.type='button';button.className='journal-entry';button.setAttribute('aria-pressed',String(entry.id===activeId));
      button.append(text('strong',entry.title||'Untitled thought'),text('small',new Date(entry.updatedAt).toLocaleString()));
      button.addEventListener('click',()=>{if(dirty&&!confirm('Leave the unsaved changes to this entry?'))return;activeId=entry.id;$('journal-title').value=entry.title;$('journal-body').value=entry.body;dirty=false;update();renderList();say('journal-status','Loaded from this browser. Nothing was sent.');});root.append(button);
    }
  }
  function update(){
    $('journal-count').textContent=`${$('journal-body').value.length.toLocaleString()} / 10,000`;
    $('journal-edit-state').textContent=dirty?'Unsaved changes':activeId?'Saved on this device':'Not saved yet';
    $('journal-delete').hidden=!activeId;
  }
  function persist(next){
    if(storageBroken)throw Error('Browser storage could not be read safely. Export your draft before repairing or clearing this browser’s journal data.');
    if(localStorage.getItem(key)!==baseline)throw Error('Another tab changed this journal. Export your draft, then reload before saving to avoid overwriting it.');
    const raw=JSON.stringify({version:1,entries:next});localStorage.setItem(key,raw);baseline=raw;entries=next;
  }
  try{
    baseline=localStorage.getItem(key);
    if(baseline){const saved=JSON.parse(baseline);if(saved.version!==1||!Array.isArray(saved.entries)||saved.entries.length>200||saved.entries.some(entry=>!entry||typeof entry.id!=='string'||typeof entry.title!=='string'||typeof entry.body!=='string'||typeof entry.updatedAt!=='string'||Number.isNaN(Date.parse(entry.updatedAt))))throw Error('Invalid journal');entries=saved.entries;}
  }catch{storageBroken=true;say('journal-status','Your browser journal could not be loaded. You can write and export a draft; existing storage will not be overwritten.','error');}
  for(const id of ['journal-title','journal-body'])$(id).addEventListener('input',()=>{dirty=true;update();});
  $('journal-form').addEventListener('submit',event=>{event.preventDefault();try{
    const value=current();if(!value.body.trim())throw Error('Write a thought before saving.');
    if(!activeId&&entries.length>=200)throw Error('This journal holds 200 entries. Export a copy and delete an old entry before adding another.');
    const now=new Date().toISOString(),old=entries.find(entry=>entry.id===activeId),id=activeId||crypto.randomUUID();
    persist([...entries.filter(entry=>entry.id!==id),{id,...value,createdAt:old?.createdAt||now,updatedAt:now}]);
    activeId=id;dirty=false;renderList();update();say('journal-status','Saved on this device. Nothing was sent to a server.','success');
  }catch(error){say('journal-status',error.message||'The browser could not save this entry. Export a copy before leaving.','error');}});
  $('journal-new').addEventListener('click',()=>{if(dirty&&!confirm('Start a new entry without saving these changes?'))return;activeId=null;$('journal-title').value='';$('journal-body').value='';dirty=false;renderList();update();say('journal-status','A fresh page. Save when you’re ready.');$('journal-title').focus();});
  $('journal-delete').addEventListener('click',()=>{if(!activeId||!confirm('Delete this saved entry from this browser? This cannot be undone.'))return;try{persist(entries.filter(entry=>entry.id!==activeId));activeId=null;$('journal-title').value='';$('journal-body').value='';dirty=false;renderList();update();say('journal-status','Entry deleted from this browser.','success');}catch(error){say('journal-status',error.message,'error');}});
  $('journal-export').addEventListener('click',()=>{download('helios-private-journal-'+new Date().toISOString().slice(0,10)+'.json',{version:1,exportedAt:new Date().toISOString(),entries,...(dirty?{unsavedDraft:current()}: {})});say('journal-status',dirty?'Downloaded saved entries and your current unsaved draft. Nothing was uploaded.':'Downloaded your saved entries. Keep this private file somewhere you trust.','success');});
  window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
  renderList();update();
}

async function setupAccount(){
  let record=null,loadedFor=null,favorites=[],laws=[],busy=false,dirty=false,loadTicket=0;
  const user=()=>window.HeliosAccount?.getState();
  function favoritesUI(){
    const root=$('favorite-laws');root.replaceChildren();
    if(!favorites.length){root.append(text('span','No favorites yet.','field-help'));return;}
    for(const id of favorites){const tag=document.createElement('span');tag.className='favorite-tag';tag.append(text('span',laws.find(law=>law.id===id)?.title||id));const remove=text('button','×');remove.type='button';remove.setAttribute('aria-label','Remove favorite '+id);remove.addEventListener('click',()=>{favorites=favorites.filter(value=>value!==id);dirty=true;favoritesUI();});tag.append(remove);root.append(tag);}
  }
  function appearance(preferences){
    const light=preferences.theme==='light'||preferences.theme==='system'&&matchMedia('(prefers-color-scheme: light)').matches;
    document.documentElement.dataset.theme=light?'light':'dark';document.documentElement.dataset.reducedMotion=String(preferences.reducedMotion);
  }
  function apply(value){
    if(!value?.preferences||!Number.isSafeInteger(value.revision)||!Array.isArray(value.preferences.favoriteLawIds))throw Error('The server returned unexpected preferences.');
    record=value;favorites=[...value.preferences.favoriteLawIds];$('preference-name').value=value.preferences.displayName||'';$('preference-theme').value=value.preferences.theme||'system';$('preference-motion').checked=value.preferences.reducedMotion===true;dirty=false;favoritesUI();appearance(value.preferences);
  }
  async function load(manual=false){
    const identity=user();if(!identity?.authenticated)return;
    if(manual&&dirty&&!confirm('Replace your unsaved preferences with the latest saved version?'))return;
    const ticket=++loadTicket;busy=true;sync();say('preferences-status','Loading preferences for your signed-in account…');
    try{const data=await request('/api/account/preferences',{account:true});if(ticket!==loadTicket||identity.user.id!==user()?.user?.id)return;apply(data);loadedFor=identity.user.id;say('preferences-status',data.updatedAt?'Loaded your saved preferences.':'No preferences saved yet. Choose your settings and save when ready.','success');}
    catch(error){if(ticket===loadTicket)say('preferences-status',error.message,'error');}
    finally{if(ticket===loadTicket){busy=false;sync();}}
  }
  function sync(){
    const state=user(),signed=state?.authenticated===true;
    $('account-identity').textContent=signed?'Signed in as '+(state.user.email||'your Helios account'):'Keep your choices with you.';
    $('account-state').textContent=signed?'Preferences are separate from your private journal and earlier guest activity.':state?.status==='verifying'?'Verifying your account…':'Sign in to save preferences across devices. Exploring Helios is always available as a guest.';
    $('preferences-fields').disabled=busy||!signed||loadedFor!==state?.user?.id||!record;
    $('preferences-reload').disabled=busy||!signed;
  }
  window.addEventListener('helios:auth-changed',()=>{
    const state=user();
    if(state?.status==='verifying'){sync();return;}
    if(!state?.authenticated){++loadTicket;busy=false;record=null;loadedFor=null;favorites=[];dirty=false;$('preferences-form').reset();favoritesUI();say('preferences-status','Sign in, then load your saved preferences before editing.');sync();return;}
    if(loadedFor&&loadedFor!==state.user.id){record=null;loadedFor=null;favorites=[];dirty=false;$('preferences-form').reset();favoritesUI();}
    sync();if(loadedFor!==state.user.id)load();
  });
  $('preferences-reload').addEventListener('click',()=>load(true));
  $('favorite-add').addEventListener('click',()=>{const id=$('favorite-law').value;if(!id||favorites.includes(id))return;if(favorites.length>=20){say('preferences-status','Choose up to 20 favorite proposals. Remove one to add another.','error');return;}favorites.push(id);dirty=true;favoritesUI();});
  $('preferences-fields').addEventListener('input',()=>{dirty=true;});
  $('preferences-form').addEventListener('submit',async event=>{
    event.preventDefault();if(busy||!record||loadedFor!==user()?.user?.id)return;
    busy=true;sync();say('preferences-status','Saving preferences…');
    try{const value=await request('/api/account/preferences',{account:true,body:{expectedRevision:record.revision,preferences:{displayName:$('preference-name').value.trim(),theme:$('preference-theme').value,reducedMotion:$('preference-motion').checked,favoriteLawIds:favorites}}});apply(value);say('preferences-status','Preferences saved to your account. Revision '+value.revision+'.','success');}
    catch(error){say('preferences-status',error.message+(error.status===409?' Your edits are still here; use “Load saved preferences” when ready.':' Your changes have not been confirmed.'),'error');}
    finally{busy=false;sync();}
  });
  if(staticMode){$('account-open').disabled=true;say('preferences-status','Account connections are disabled on this static preview.','error');return;}
  const result=await Promise.allSettled([accountModule(),catalog()]);
  if(result[1].status==='fulfilled'){laws=result[1].value;$('favorite-law').replaceChildren(text('option','Choose a proposal'));$('favorite-law').firstChild.value='';for(const law of laws){const option=text('option',law.id+' · '+law.title);option.value=law.id;$('favorite-law').append(option);}favoritesUI();}
  else{$('favorite-law').replaceChildren(text('option','Public catalog unavailable'));$('favorite-add').disabled=true;}
  if(result[0].status==='rejected')say('preferences-status','The sign-in interface could not load. Refresh before trying again.','error');
  sync();if(user()?.authenticated&&!record)load();
}

async function setupDrafting(){
  let enabled=false,busy=false,laws=[],lastResult=null;
  const sync=()=>{for(const control of $('draft-form').querySelectorAll('input,textarea,select,button'))control.disabled=busy;$('draft-submit').disabled=!enabled||busy||!$('draft-consent').checked;};
  $('draft-form').addEventListener('input',event=>{if(event.target.id!=='draft-consent')$('draft-consent').checked=false;sync();});
  $('draft-load-law').addEventListener('click',()=>{
    const law=laws.find(item=>item.id===$('draft-law').value);if(!law)return;
    if($('draft-bill').value.trim()&&!confirm('Replace the current draft with this public proposal?'))return;
    $('draft-bill').value=[law.title,'','Goal: '+(law.sharedGoal||''),'','Implementation: '+(law.illustrativeLocalOption||''),'','Safeguards: '+(law.risksAndSafeguards||''),'','Measures: '+(law.suggestedMeasures||[]).join('; ')].join('\n');$('draft-consent').checked=false;sync();say('draft-status','Loaded the original public proposal. Review it before sending.');
  });
  $('draft-form').addEventListener('submit',async event=>{
    event.preventDefault();if(!enabled||busy||!$('draft-consent').checked)return;
    const body={bill:$('draft-bill').value.trim(),prompt:$('draft-prompt').value.trim(),modes:[...document.querySelectorAll('input[name="draft-mode"]:checked')].map(input=>input.value),diagnostics:[],consent:true};
    if(!body.bill||(!body.prompt&&!body.modes.length)){say('draft-status','Add a draft and select a perspective or write a question.','error');return;}
    busy=true;sync();say('draft-status','Requesting a suggested revision. This can take a moment…');
    try{
      const data=await request('/api/drafting/revise',{body});
      if(typeof data.revision!=='string'||!Array.isArray(data.changes))throw Error('The provider response did not contain a reviewable draft.');
      lastResult=data;$('draft-result').value=data.revision;$('draft-result-source').textContent=`Generated by ${data.model||'the configured model'}. Human review required.`;
      const root=$('draft-changes');root.replaceChildren();for(const change of data.changes){const card=document.createElement('article');card.className='change-card';card.append(text('h4',change.objection),text('p',change.compromise));root.append(card);}
      $('draft-result-panel').hidden=false;say('draft-status','Suggested revision received. Nothing has been published.','success');
    }catch(error){say('draft-status',error.message+' Your original draft is still here.','error');}
    finally{busy=false;sync();}
  });
  $('draft-copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('draft-result').value);say('draft-status','Revision copied. Nothing has been published.','success');}catch{$('draft-result').focus();$('draft-result').select();say('draft-status','Copy the selected revision manually.');}});
  $('draft-export').addEventListener('click',()=>{if(lastResult)download('helios-revision-draft.txt',lastResult.revision+'\n\nAI-generated draft. Human review required.\n','text/plain');});
  const results=await Promise.allSettled([readJSON('/api/drafting/config'),catalog()]);
  if(results[0].status==='fulfilled'){const config=results[0].value;enabled=config.enabled===true;$('draft-capability').textContent=enabled?'AI available':'Setup needed';$('draft-availability').textContent=enabled?'AI drafting is configured. Nothing is sent until you review the text and consent.':config.reason||'AI drafting is not configured on this deployment. You can prepare your draft here.';}
  else{$('draft-capability').textContent='Not connected';$('draft-availability').textContent=staticMode?'AI connections are disabled on this static preview.':'The AI service could not be verified. Your text remains on this page.';}
  if(results[1].status==='fulfilled'){laws=results[1].value;for(const law of laws){const option=text('option',law.id+' · '+law.title);option.value=law.id;$('draft-law').append(option);}}
  sync();
}

async function setupPullRequests(){
  let enabled=false,busy=false,reviewed=null;
  function sync(){
    const signed=window.HeliosAccount?.getState().authenticated===true;
    $('proposal-create').disabled=!enabled||!signed||busy||!reviewed||!$('proposal-public-consent').checked||!$('proposal-rights').checked;
    $('proposal-edit').disabled=busy;$('proposal-public-consent').disabled=busy;$('proposal-rights').disabled=busy;
  }
  $('proposal-message').addEventListener('input',()=>{$('proposal-count').textContent=$('proposal-message').value.length.toLocaleString()+' / 4,000';});
  $('proposal-pr-form').addEventListener('submit',event=>{
    event.preventDefault();reviewed={kind:$('proposal-kind').value,title:$('proposal-title').value.trim(),message:$('proposal-message').value.trim()};
    if(!reviewed.title||!reviewed.message)return;
    $('proposal-review-kind').textContent=reviewed.kind;$('proposal-review-title').textContent=reviewed.title;$('proposal-review-message').textContent=reviewed.message;
    $('proposal-public-consent').checked=false;$('proposal-rights').checked=false;$('proposal-pr-form').hidden=true;$('proposal-review').hidden=false;
    say('proposal-status','Review the exact public proposal. '+(window.HeliosAccount?.getState().authenticated?'':'Sign in before publishing.'));sync();
  });
  $('proposal-edit').addEventListener('click',()=>{if(busy)return;reviewed=null;$('proposal-review').hidden=true;$('proposal-pr-form').hidden=false;say('proposal-status','Your proposal is still a draft.');$('proposal-title').focus();});
  for(const id of ['proposal-public-consent','proposal-rights'])$(id).addEventListener('change',sync);
  window.addEventListener('helios:auth-changed',()=>{if(!window.HeliosAccount?.getState().authenticated){$('proposal-public-consent').checked=false;$('proposal-rights').checked=false;}sync();});
  $('proposal-create').addEventListener('click',async()=>{
    if($('proposal-create').disabled)return;
    busy=true;sync();say('proposal-status','Creating the reviewed public proposal on GitHub…');
    try{
      const data=await request('/api/github/pull-requests',{account:true,body:{...reviewed,consent:true,rightsConfirmed:true}});
      const expected='https://github.com/adnanwahab/HeliosHTML/pull/'+data.number;
      if(!Number.isSafeInteger(data.number)||data.number<1||data.url!==expected)throw Error('GitHub did not return a confirmed pull request link.');
      $('proposal-review').hidden=true;$('proposal-receipt').hidden=false;$('proposal-receipt-title').textContent=(data.draft?'Draft pull request #':'Pull request #')+data.number;
      $('proposal-receipt-detail').textContent='Your proposal is public and ready for human review. No changes were merged.';$('proposal-receipt-link').href=data.url;
      say('proposal-status','GitHub confirmed the pull request.','success');
    }catch(error){say('proposal-status','Publication not confirmed: '+error.message+' Retry the unchanged proposal to reuse its request ID.','error');}
    finally{busy=false;sync();}
  });
  $('proposal-new').addEventListener('click',()=>{if(busy)return;reviewed=null;pendingWrites.delete('/api/github/pull-requests');$('proposal-pr-form').reset();$('proposal-pr-form').hidden=false;$('proposal-review').hidden=true;$('proposal-receipt').hidden=true;$('proposal-count').textContent='0 / 4,000';$('proposal-public-consent').checked=false;$('proposal-rights').checked=false;say('proposal-status','Review comes before publication.');$('proposal-title').focus();sync();});
  const results=await Promise.allSettled([accountModule(),readJSON('/api/github/config')]);
  if(results[1].status==='fulfilled'){const config=results[1].value;enabled=config.enabled===true;$('pr-availability').textContent=enabled?'Automatic PR creation is configured. A verified account and your explicit publication approval are required.':config.reason||'Automatic PR creation is not configured. You can prepare a proposal or continue with GitHub’s own editor.';}
  else $('pr-availability').textContent=staticMode?'Automatic PR creation is disabled on this static preview. You can still prepare a proposal.':'The GitHub connection could not be verified. You can still prepare a proposal or use the existing contribution composer.';
  if(staticMode)$('pr-account-open').disabled=true;
  sync();
}

async function setupEmail(){
  let subscriptions=false,delivery=false,busy=false;
  const sync=()=>{$('notification-submit').disabled=!subscriptions||busy||!$('notification-consent').checked;};
  $('notification-consent').addEventListener('change',sync);
  $('notification-email').addEventListener('input',()=>{$('notification-consent').checked=false;sync();});
  $('notification-form').addEventListener('submit',async event=>{
    event.preventDefault();if($('notification-submit').disabled)return;busy=true;sync();say('notification-status','Saving your opt-in…');
    try{
      const data=await readJSON('/api/email/subscribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:$('notification-email').value.trim(),company:$('notification-company').value,source:'feature-notifications',consent:true})});
      if(data.ok!==true)throw Error('The server did not confirm your subscription.');
      const configured=data.deliveryEnabled===true||(data.deliveryEnabled===undefined&&delivery);
      say('notification-status',data.message||(configured?'Your opt-in was saved. Email delivery will be handled by the configured email service.':'Your opt-in was saved, but email delivery is not configured yet.'),'success');
      $('notification-consent').checked=false;
    }catch(error){say('notification-status','Subscription not confirmed: '+error.message,'error');}
    finally{busy=false;sync();}
  });
  try{
    const config=await readJSON('/api/email/config');subscriptions=config.subscriptionsEnabled===true;delivery=config.deliveryEnabled===true;
    $('email-availability').textContent=delivery?`Email delivery is configured. One follow-up is scheduled about ${Number.isFinite(config.delayHours)?config.delayHours:72} hours after signup.`:config.reason||(subscriptions?'Subscriptions can be saved, but email delivery is not configured yet.':'Subscriptions are unavailable on this deployment.');
  }catch{$('email-availability').textContent=staticMode?'Email subscriptions are disabled on this static preview.':'The subscription service could not be verified. No address has been saved.';}
  sync();
}

async function start(){
  if(staticMode)rewriteStaticFeatureLinks(document);
  if(!feature){$('workspace-not-found').hidden=false;return;}
  const detail=details[feature.id];document.title=feature.title+' · Helios';
  $('workspace-title').textContent=detail.title;$('workspace-description').textContent=feature.description;$('workspace-eyebrow').textContent=detail.eyebrow;$('workspace-route').textContent=feature.route;$('workspace-storage').textContent=feature.storage;
  $('aside-title').textContent=detail.aside;$('aside-body').textContent=detail.body;$('aside-detail').textContent=detail.detail;
  document.querySelector(`[data-workspace="${feature.id}"]`).hidden=false;document.querySelector(`[data-workspace-nav="${feature.id}"]`).setAttribute('aria-current','page');
  // The private journal takes this branch before any capability, account, or API
  // code runs. Importing the route manifest above only fetches a static module.
  if(feature.id==='journal'){setupJournal();return;}
  if(feature.id==='account')await setupAccount();
  if(feature.id==='drafting')await setupDrafting();
  if(feature.id==='pull-requests')await setupPullRequests();
  if(feature.id==='email')await setupEmail();
}
start().catch(()=>{const status={account:'preferences-status',drafting:'draft-status','pull-requests':'proposal-status',email:'notification-status',journal:'journal-status'}[feature?.id];if(status)say(status,'This workspace could not finish loading. Your action has not been confirmed; refresh before trying again.','error');});
