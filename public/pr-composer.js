const $=id=>document.getElementById(id);
const modal=$('pr-compose'),form=$('pr-compose-form'),review=$('pr-review'),status=$('pr-status'),receipt=$('pr-receipt'),consent=$('pr-consent');
const github='https://github.com/adnanwahab/HeliosHTML';
let draft=null,busy=false,enabled=false;
const say=(message,error=false)=>{status.textContent=message;status.classList.toggle('error',error)};
const secureId=()=>{const a=new Uint8Array(16);crypto.getRandomValues(a);return Array.from(a,x=>x.toString(16).padStart(2,'0')).join('')};
const pathFor=d=>'docs/proposals/inbox/'+d.id+'.json';
const serialized=d=>JSON.stringify(d,null,2)+'\n';
function sync(){
 const ok=!!draft&&consent.checked&&!busy&&receipt.hidden;
 // The public editor receives only a generated filename, never the message or access key in a URL.
 $('pr-copy').disabled=!ok;$('pr-submit').disabled=!ok||!enabled;
 $('pr-edit').disabled=busy;$('pr-access').disabled=busy;consent.disabled=busy;
 const a=$('pr-github');a.setAttribute('aria-disabled',String(!ok));a.tabIndex=ok?0:-1;
 if(ok)a.href=github+'/new/main/docs/proposals/inbox?filename='+encodeURIComponent(draft.id+'.json');else a.removeAttribute('href');
}
async function open(){
 if(!modal.open)modal.showModal();
 try{const r=await fetch('/api/message-pr',{cache:'no-store',signal:AbortSignal.timeout(5000)});enabled=r.ok&&(await r.json()).enabled===true;}catch{enabled=false}
 $('pr-maintainer').hidden=!enabled;sync();
}
function reset(){
 form.reset();review.hidden=true;form.hidden=false;receipt.hidden=true;draft=null;consent.checked=false;$('pr-access').value='';$('pr-payload').value='';$('pr-count').textContent='0 / 4,000 · Stays here until you choose to publish.';say('');sync();
}
$('pr-compose-open').addEventListener('click',open);
$('pr-compose-close').addEventListener('click',()=>{if(!busy)modal.close()});
modal.addEventListener('cancel',e=>{if(busy)e.preventDefault()});
modal.addEventListener('close',()=>{$('pr-access').value='';$('pr-compose-open').focus()});
$('pr-message').addEventListener('input',()=>{$('pr-count').textContent=$('pr-message').value.length.toLocaleString()+' / 4,000 · Stays here until you choose to publish.'});
form.addEventListener('submit',e=>{
 e.preventDefault();
 const title=$('pr-title').value.trim(),message=$('pr-message').value.trim(),kind=$('pr-kind').value;
 if(!title||!message){say('Enter a title and message.',true);return;}
 // Preserve the same identifier across unchanged retries. A changed proposal gets a new ID.
 if(!draft||draft.title!==title||draft.message!==message||draft.kind!==kind)draft={id:secureId(),kind,title,message};
 $('pr-path').textContent=pathFor(draft);$('pr-payload').value=serialized(draft);
 consent.checked=false;form.hidden=true;review.hidden=false;say('');sync();$('pr-review-heading').focus();
});
$('pr-edit').addEventListener('click',()=>{review.hidden=true;form.hidden=false;consent.checked=false;$('pr-access').value='';say('');sync();$('pr-title').focus()});
consent.addEventListener('change',sync);
$('pr-copy').addEventListener('click',async()=>{
 if(!consent.checked||!draft)return;
 try{await navigator.clipboard.writeText(serialized(draft));say('Copied. Continue on GitHub, paste the file, then create your pull request.');}
 catch{$('pr-payload').focus();$('pr-payload').select();say('Select and copy the file manually, then continue on GitHub.');}
});
$('pr-github').addEventListener('click',e=>{if(!consent.checked||busy||!draft)e.preventDefault();else say('GitHub editor opened. Your pull request is not yet created.');});
$('pr-submit').addEventListener('click',async()=>{
 if(!draft||!consent.checked||!enabled||busy)return;
 const key=$('pr-access').value;if(!key){say('Enter your dedicated maintainer access key.',true);return;}
 busy=true;sync();say('Creating proposal branch and draft pull request…');
 try{
  const res=await fetch('/api/message-pr',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+key},body:JSON.stringify({proposal:draft,consent:true}),signal:AbortSignal.timeout(35000)});
  const data=await res.json();
  if(!res.ok)throw Error(data.error||'Could not confirm the pull request.');
  if(!Number.isSafeInteger(data.number)||data.number<1||data.url!==github+'/pull/'+data.number)throw Error('Invalid GitHub receipt.');
  $('pr-result').textContent='PR #'+data.number+' · '+(data.state==='closed'?'Previously closed; not reopened.':data.draft?'Draft · awaits human review.':'Open · awaits human review.');
  $('pr-result-link').href=data.url;receipt.hidden=false;review.hidden=true;say('');$('pr-result-link').focus();
 }catch(e){say('Not confirmed: '+e.message+' Retry the unchanged proposal to recover its receipt.',true);}
 finally{busy=false;$('pr-access').value='';sync();}
});
$('pr-new').addEventListener('click',reset);
sync();
if(new URLSearchParams(location.search).get('compose')==='pr')open();
