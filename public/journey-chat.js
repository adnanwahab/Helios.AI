// Shared discussion reuses the existing moderated constitution comment API.
// The story transcript, constitution editor and local scenario stay on-device.
const $=id=>document.getElementById(id);
const isStatic=document.body.dataset.static==='true';
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n};
let mode='practice',connected=false,busy=false,refreshing=false,csrf=null,lastWrite=null,ticket=0;
const setStatus=text=>$('room-status').textContent=text;
function show(next){
 mode=next;$('practice-chat').setAttribute('aria-pressed',String(next==='practice'));$('shared-chat').setAttribute('aria-pressed',String(next==='shared'));$('npc-chat').hidden=next!=='practice';$('live-chat').hidden=next!=='shared';
 if(next==='shared'&&connected)refresh()
}
async function request(path,opts={}){
 const r=await fetch(path,{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(12000),...opts}),data=await r.json().catch(()=>null);
 if(!r.ok||!data)throw Error(data?.error||'HTTP '+r.status);return data
}
function controls(){
 $('room-send').disabled=!connected||busy||!$('room-consent').checked||!$('room-message').value.trim();
 $('room-connect').disabled=busy||isStatic;$('room-refresh').disabled=busy||refreshing;
 $('room-topic').disabled=busy;
}
async function refresh(){
 if(!connected||refreshing)return;refreshing=true;const n=++ticket,id=$('room-topic').value;controls();
 try{
  const result=await request('/api/constitution');if(n!==ticket||id!==$('room-topic').value)return;
  const row=result.clauses?.find(x=>x.id===id);if(!row)throw Error('Discussion thread unavailable');
  $('room-clause').textContent=row.text;
  const log=$('room-messages');log.replaceChildren();
  const messages=row.comments||[];
  if(!messages.length)log.append(el('p','No visible messages yet. Start the discussion with a reviewed public comment.','hint'));
  for(const comment of [...messages].reverse()){const pending=comment.status==='pending',msg=el('div',undefined,'message'+(pending?' pending':''));msg.append(el('b',pending?'YOUR MESSAGE · PENDING REVIEW':'APPROVED PUBLIC COMMENT'),el('p',comment.text));log.append(msg)}
  setStatus('Connected · '+(row.live?.commentCount??0)+' approved comments. Showing up to 8 recent messages, including your pending comments.');
 }catch(e){setStatus('Discussion unavailable: '+e.message+' · your draft is preserved.')}
 finally{refreshing=false;controls();if(id!==$('room-topic').value&&connected)refresh()}
}
$('practice-chat').addEventListener('click',()=>show('practice'));$('shared-chat').addEventListener('click',()=>show('shared'));
$('room-connect').addEventListener('click',async()=>{
 if(isStatic||busy||connected)return;busy=true;controls();setStatus('Connecting…');
 try{const session=await request('/api/session');if(!session.csrfToken)throw Error('Session unavailable');const board=await request('/api/constitution');if(!Array.isArray(board.clauses))throw Error('Shared board unavailable');csrf=session.csrfToken;connected=true;$('room-connect').hidden=true;$('room-refresh').hidden=false;await refresh()}
 catch(e){setStatus('Connection unavailable: '+e.message+' · use story characters to continue locally.')}
 finally{busy=false;controls()}
});
$('room-refresh').addEventListener('click',refresh);
$('room-topic').addEventListener('change',()=>{$('room-consent').checked=false;$('room-clause').textContent='';$('room-messages').replaceChildren();if(connected)refresh();controls()});
$('room-message').addEventListener('input',()=>{$('room-consent').checked=false;controls()});$('room-consent').addEventListener('change',controls);
$('room-form').addEventListener('submit',async e=>{
 e.preventDefault();if(!connected||busy||!$('room-consent').checked)return;
 const text=$('room-message').value.trim();if(!text)return;
 const body=JSON.stringify({clauseId:$('room-topic').value,text,consent:true});
 if(lastWrite?.body!==body)lastWrite={body,key:crypto.randomUUID()};
 busy=true;controls();setStatus('Submitting for review…');
 try{const session=await request('/api/session');csrf=session.csrfToken;await request('/api/constitution/comment',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf,'Idempotency-Key':lastWrite.key},body});lastWrite=null;$('room-message').value='';$('room-consent').checked=false;await refresh();setStatus('Message submitted for public moderation. Other visitors cannot see it until approved.')}
 catch(e){setStatus('Submission not confirmed: '+e.message+' · retry unchanged to reuse the request key.')}
 finally{busy=false;controls()}
});
setInterval(()=>{if(connected&&mode==='shared'&&!document.hidden&&['chat','grid'].includes(document.body.dataset.stage)&&!busy)refresh()},15000);
if(isStatic){$('room-connect').hidden=true;setStatus('Static preview: shared discussion is disabled. Story characters remain available.')}
controls();
