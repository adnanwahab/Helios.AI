const $=id=>document.getElementById(id);
const modal=$('pr-compose'),form=$('pr-compose-form'),review=$('pr-review'),status=$('pr-status'),receipt=$('pr-receipt'),consent=$('pr-consent');
const github='https://github.com/adnanwahab/HeliosHTML';
const isStatic=document.querySelector('meta[name="helios-mode"]')?.content==='static';
const isPreview=document.querySelector('meta[name="helios-contribution-mode"]')?.content==='preview'||/^deploy-preview-\d+--heliosailol\.netlify\.app$/i.test(location.hostname);
const inboxUnavailable=isStatic||isPreview;
const inboxNotice=isPreview?'This is a deployment preview. The private Helios inbox is intentionally unavailable here. You can review your message and create a real proposal pull request on GitHub.':'The private inbox is unavailable on this static site. You can continue on GitHub instead.';
function configureDestination(){
 const select=$('pr-destination'),team=select.querySelector('option[value="team"]');
 if(inboxUnavailable){
  select.value='github';team.disabled=true;team.textContent=isPreview?'Helios inbox (production only)':'Helios inbox (unavailable on static site)';
  $('pr-inbox-notice').textContent=inboxNotice;$('pr-inbox-notice').hidden=false;
  $('pr-refresh').hidden=true;
  $('pr-history-status').textContent='Private inbox progress is not available here. Use the GitHub pull requests link to follow published proposals.';
 }
}
const states={queued:'Awaiting triage',researching:'Researching',implementing:'Implementing',review:'PR ready for review',closed:'Closed by maintainer'};
let draft=null,busy=false,historyRequest=0;
const say=(message,error=false)=>{status.textContent=message;status.classList.toggle('error',error)};
const publicFile=()=>JSON.stringify({id:draft.id,kind:draft.kind,title:draft.title,message:draft.message},null,2)+'\n';
const teamBody=()=>({kind:draft.kind,title:draft.title,message:draft.message,consent:true});
const isPublic=()=>$('pr-destination').value==='github';
async function request(path,options={}){
 const res=await fetch(path,{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000),...options});
 const data=await res.json().catch(()=>null);
 if(!res.ok||!data)throw Error(data?.error||'The server did not confirm the request.');
 return data;
}
function sync(){
 const ok=!!draft&&consent.checked&&!busy&&receipt.hidden;
 const pub=isPublic(),a=$('pr-github');
 $('pr-send').hidden=pub;$('pr-send').disabled=!ok||inboxUnavailable;
 $('pr-copy').hidden=!pub;$('pr-copy').disabled=!ok;
 a.hidden=!pub;a.setAttribute('aria-disabled',String(!ok||!pub));a.tabIndex=ok&&pub?0:-1;
 if(ok&&pub)a.href=github+'/new/main/data/contributions?filename='+encodeURIComponent(draft.id+'.json');else a.removeAttribute('href');
 $('pr-edit').disabled=busy;consent.disabled=busy;$('pr-destination').disabled=busy;
}
function destination(){
 if(inboxUnavailable)$('pr-destination').value='github';
 const pub=isPublic();consent.checked=false;
 $('pr-path').hidden=!pub;
 if(!draft)return;
 $('pr-path').textContent='data/contributions/'+draft.id+'.json';
 $('pr-payload').value=pub?publicFile():JSON.stringify(teamBody(),null,2);
 $('pr-destination-note').textContent=pub?'GitHub is public. Copy this file, open GitHub’s editor, sign in and commit to a branch or fork, then open a PR. GitHub handles review and merging.':'This sends your message to the Helios team’s private inbox for triage. An agent may work on it only after review; this does not automatically create a PR.';
 $('pr-consent-text').textContent=pub?'I approve publishing this exact proposal to public GitHub.':'I approve saving this exact message for Helios maintainers and their reviewed research workflow. I have removed private information and secrets.';
 say('');
 sync();
}
async function refresh(){
 const ticket=++historyRequest,root=$('pr-history'),info=$('pr-history-status');
 if(inboxUnavailable){root.replaceChildren();info.textContent='Private inbox progress is not available here. Use the GitHub pull requests link to follow published proposals.';return}
 info.textContent='Checking saved contributions…';
 try{
  const data=await request('/api/contributions');
  if(ticket!==historyRequest)return;
  if(!Array.isArray(data.contributions))throw Error('Unexpected inbox response.');
  root.replaceChildren();
  for(const item of data.contributions){
   if(!item||typeof item.title!=='string'||!Object.hasOwn(states,item.status))continue;
   const card=document.createElement('article'),title=document.createElement('strong'),line=document.createElement('p');
   title.textContent=item.title;line.textContent=states[item.status];card.append(title,line);
   if(Number.isSafeInteger(item.prNumber)&&item.prNumber>0){const link=document.createElement('a');link.href=github+'/pull/'+item.prNumber;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Review PR #'+item.prNumber+' ↗';card.append(link)}
   root.append(card);
  }
  info.textContent=root.childElementCount?'Showing recent contributions from this browser session.':'No saved messages in this browser session.';
 }catch(e){if(ticket===historyRequest)info.textContent='Inbox status unavailable: '+e.message+' GitHub remains available.'}
}
function open(){if(!modal.open)modal.showModal();if($('pr-tracking').open)refresh()}
function reset(){form.reset();review.hidden=true;form.hidden=false;receipt.hidden=true;draft=null;consent.checked=false;$('pr-destination').value=inboxUnavailable?'github':'team';$('pr-payload').value='';$('pr-count').textContent='0 / 4,000 · Your draft stays here until you choose to submit.';say('');sync();$('pr-title').focus()}
$('pr-compose-open').addEventListener('click',open);
$('pr-compose-close').addEventListener('click',()=>{if(!busy)modal.close()});
modal.addEventListener('cancel',e=>{if(busy)e.preventDefault()});
modal.addEventListener('close',()=>{$('pr-compose-open').focus()});
$('pr-message').addEventListener('input',()=>{$('pr-count').textContent=$('pr-message').value.length.toLocaleString()+' / 4,000 · Your draft stays here until you choose to submit.'});
form.addEventListener('submit',e=>{
 e.preventDefault();const title=$('pr-title').value.trim(),message=$('pr-message').value.trim(),kind=$('pr-kind').value;
 if(!title||!message){say('Enter a title and message.',true);return}
 if(!draft||draft.title!==title||draft.message!==message||draft.kind!==kind)draft={id:crypto.randomUUID(),kind,title,message};
 form.hidden=true;review.hidden=false;destination();$('pr-review-heading').focus();
});
$('pr-destination').addEventListener('change',destination);
$('pr-edit').addEventListener('click',()=>{review.hidden=true;form.hidden=false;consent.checked=false;say('');sync();$('pr-title').focus()});
consent.addEventListener('change',sync);
$('pr-copy').addEventListener('click',async()=>{
 if(!consent.checked||!draft||!isPublic())return;
 try{await navigator.clipboard.writeText(publicFile());say('Copied. Continue on GitHub, paste the file, then open your pull request.')}
 catch{$('pr-payload').focus();$('pr-payload').select();say('Copy the selected file manually, then continue on GitHub.')}
});
$('pr-github').addEventListener('click',e=>{if(!consent.checked||busy||!draft||!isPublic())e.preventDefault();else say('GitHub editor opened. Your pull request has not been created yet.')});
$('pr-send').addEventListener('click',async()=>{
 if(!draft||!consent.checked||isPublic()||busy||inboxUnavailable)return;
 busy=true;sync();say('Sending to Helios for review…');
 try{
  const session=await request('/api/session');
  if(typeof session.csrfToken!=='string')throw Error('Could not establish a browser session.');
  const data=await request('/api/contributions',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':session.csrfToken,'Idempotency-Key':draft.id},body:JSON.stringify(teamBody())});
  if(typeof data.id!=='string'||!/^[a-f0-9-]{36}$/.test(data.id)||data.status!=='queued')throw Error('No confirmed inbox receipt.');
  $('pr-result').textContent='Contribution '+data.id+' · Awaiting triage';receipt.hidden=false;review.hidden=true;say('');$('pr-tracking').open=true;refresh();$('pr-new').focus();
 }catch(e){say('Not confirmed: '+e.message+' Retry the unchanged message to reuse its request ID, or choose the GitHub option.',true)}
 finally{busy=false;sync()}
});
$('pr-new').addEventListener('click',reset);
$('pr-refresh').addEventListener('click',refresh);
$('pr-tracking').addEventListener('toggle',()=>{if($('pr-tracking').open)refresh()});
configureDestination();
sync();
if(new URLSearchParams(location.search).get('compose')==='pr')open();
