// Operator-only bounded research experiment. Never store the operator token or put it in a URL.
const mount=document.getElementById('research-research-panel');
if(mount){
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n};
 const section=el('section',undefined,'panel');section.style.marginTop='16px';section.id='research-pilot';
 section.append(el('p','MINI SYMPHONY / FLY.IO · OPERATOR PILOT','eyebrow'),el('h3','Run the first real research mission'),el('p','One model-assisted review of HGA-051. The worker uses the exact saved public revision, returns a draft brief for human review, and does not publish laws, verify external evidence, or launch coding agents.','hint'));
 const field=(label,id,type,placeholder)=>{const wrap=el('div',undefined,'field'),l=el('label',label),input=el('input');l.htmlFor=id;input.id=id;input.type=type;input.placeholder=placeholder||'';wrap.append(l,input);section.append(wrap);return input};
 const endpoint=field('Your verified Fly.io application origin','pilot-origin','url','https://helios-mini-symphony.fly.dev');
 const token=field('Operator token (kept in this page only)','pilot-token','password','Enter the separate operator token');
 token.autocomplete='off';token.spellcheck=false;
 section.append(el('p','Only enter an origin you own and trust. Your operator token is sent to that server over HTTPS. It is not your database password or model API key.','hint'));
 const actions=el('div',undefined,'actions'),load=el('button','Connect / refresh mission','secondary');load.type='button';actions.append(load);section.append(actions);
 const snapshot=el('pre','Connect to inspect the saved proposal revision.');snapshot.style.whiteSpace='pre-wrap';snapshot.style.overflowWrap='anywhere';section.append(snapshot);
 const questionLabel=el('label','Research question');questionLabel.htmlFor='pilot-question';
 const question=el('textarea');question.id='pilot-question';question.maxLength=1000;question.value='What are the strongest implementation objections, affected groups, missing evidence and safeguards for accessible noncommercial community spaces?';
 section.append(questionLabel,question);
 const consentLabel=el('label',undefined,'consent'),consent=el('input');consent.type='checkbox';consent.id='pilot-consent';consentLabel.append(consent,el('span','I reviewed the exact revision and question. Send only this public proposal and question to the model provider for a bounded paid research run.'));section.append(consentLabel);
 const queue=el('button','Queue pilot research mission','primary');queue.type='button';queue.disabled=true;section.append(queue);
 const status=el('p','Not connected. No mission has been submitted.','status');status.setAttribute('role','status');section.append(status);
 const result=el('pre');result.style.whiteSpace='pre-wrap';result.style.overflowWrap='anywhere';section.append(result);mount.append(section);
 let active=null,busy=false,job=null,law=null;
 function sync(){queue.disabled=busy||!active||!law||Boolean(job)||!consent.checked||question.value.trim().length<10;load.disabled=busy;}
 function reset(){active=null;job=null;law=null;consent.checked=false;snapshot.textContent='Connect to inspect the saved proposal revision.';result.textContent='';status.textContent='Connection changed; reconnect before submitting.';sync();}
 for(const input of [endpoint,token])input.addEventListener('input',reset);
 question.addEventListener('input',()=>{consent.checked=false;sync()});consent.addEventListener('change',sync);
 function config(){const u=new URL(endpoint.value.trim());if(u.protocol!=='https:'||!u.hostname.endsWith('.fly.dev')||u.username||u.password||u.port||u.pathname!=='/'||u.search||u.hash)throw Error('Enter the HTTPS origin of your own Fly.io app, with no path.');if(token.value.length<32)throw Error('Enter the operator token.');return {origin:u.origin,token:token.value}}
 async function request(c,method='GET',body){const res=await fetch(c.origin+'/pilot',{method,redirect:'error',cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(18000),headers:{authorization:'Bearer '+c.token,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});const data=await res.json().catch(()=>null);if(!res.ok||!data)throw Error(data?.error||'Pilot service unavailable (HTTP '+res.status+')');return data;}
 function render(data){job=data.job||null;law=data.proposal||job?.mission?.law||null;
 if(law?.id!=='HGA-051'||typeof law.versionId!=='string')throw Error('Server did not confirm the exact public revision.');
 snapshot.textContent=[law.id+' · revision '+law.version,law.title,law.goal,'Implementation: '+law.implementation,'Safeguards: '+law.safeguards,'Revision ID: '+law.versionId].join('\n\n');
 status.textContent=job?'Mission '+job.id+' · '+job.state+' · attempt '+job.attempt:'Connected. No pilot mission exists yet.';
 result.textContent=job?.result?.brief?job.result.brief+'\n\nModel: '+job.result.model+'\nExternal sources verified: no. Human review required.':job?.result?.reason?'Review required: '+job.result.reason:job?'Refresh to check recorded progress.':'';
 if(job?.mission?.question)question.value=job.mission.question;consent.checked=false;sync();}
 async function run(action){if(busy)return;busy=true;sync();const previous=active;try{await action()}catch(e){status.textContent=e.message+' No successful submission is assumed. Reconnect/refresh to check.';if(!previous)active=null;}finally{busy=false;sync();}}
 load.addEventListener('click',()=>run(async()=>{const c=config();active=null;law=null;job=null;consent.checked=false;result.textContent='';const d=await request(c);if(c.origin!==config().origin||c.token!==config().token)throw Error('Connection changed');render(d);active=c;}));
 queue.addEventListener('click',()=>{if(queue.disabled)return;const c=active,revision=law.versionId,text=question.value.trim();run(async()=>{if(c.origin!==config().origin||c.token!==config().token)throw Error('Reconnect first');const d=await request(c,'POST',{versionId:revision,question:text,consent:true});if(c.origin!==config().origin||c.token!==config().token)throw Error('Connection changed');render(d);active=c;});});
 sync();
}
