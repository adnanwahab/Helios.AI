// Run from a maintainer workstation; never paste credentials into a browser.
import {createContentModerator} from '../src/content-moderation.js';
import {randomUUID} from 'node:crypto';
import {parseArgs} from 'node:util';
const {values:args}=parseArgs({options:{exact:{type:'string'},kind:{type:'string',default:'clause'},apply:{type:'boolean',default:false}},strict:true});
const exact=args.exact?.normalize('NFC').trim();
const token=process.env.HELIOS_ADMIN_TOKEN;
if(!exact||!token||!process.env.OPENAI_API_KEY||!['clause','comment'].includes(args.kind))throw Error('Set HELIOS_ADMIN_TOKEN and OPENAI_API_KEY; pass --exact "your own previously submitted text" [--kind clause|comment] [--apply].');
const origin=new URL(process.env.HELIOS_URL||'https://helios-ai-laws.fly.dev');
if(origin.protocol!=='https:'||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash)throw Error('HELIOS_URL must be an HTTPS origin.');
const api=async(path,options={})=>{
 const res=await fetch(new URL(path,origin),{...options,redirect:'error',signal:AbortSignal.timeout(15000)});
 if(!res.ok)throw Error('Helios request failed: HTTP '+res.status);
 return res;
};
const auth={authorization:'Bearer '+token};
const queue=await (await api('/api/constitution/moderation',{headers:auth})).json();
const candidates=queue[args.kind==='clause'?'clauses':'comments'].filter(row=>row.text===exact);
if(candidates.length!==1)throw Error('Expected exactly one matching pending record in the current queue; nothing was changed.');
const row=candidates[0];
// Only this maintainer-selected, explicitly identified public text goes to OpenAI.
const moderator=createContentModerator({env:{...process.env,HELIOS_AUTO_MODERATION:'1'}});
const verdict=await moderator.classify(row.text);
console.log(JSON.stringify({kind:args.kind,id:row.id,decision:verdict.decision,reason:verdict.reason,model:verdict.model||null,mode:args.apply?'apply':'dry-run'}));
if(verdict.decision!=='approve'){console.log('Left pending for human review.');process.exitCode=2;}
else if(!args.apply){console.log('Dry run only; rerun with --apply to publish this exact record.');}
else{
 const session=await api('/api/session'),cookie=session.headers.get('set-cookie')?.split(';')[0],{csrfToken}=await session.json();
 if(!cookie||!csrfToken)throw Error('Could not establish a maintainer session.');
 const result=await (await api('/api/constitution/moderate',{method:'POST',headers:{...auth,cookie,origin:origin.origin,'content-type':'application/json','x-csrf-token':csrfToken,'idempotency-key':randomUUID()},body:JSON.stringify({kind:args.kind,id:row.id,decision:'approved'})})).json();
 console.log(JSON.stringify({id:result.id,status:result.status}));
}
