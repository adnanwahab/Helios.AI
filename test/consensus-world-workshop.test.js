import {test,expect} from 'bun:test';
import {localRevision,quickCompare,rankDiagnostics} from '../public/consensus-world-workshop-logic.js';
import {validateRequest,sanitizeResult,createHandler} from '../netlify/functions/consensus-revise.mjs';
import {createDraftingService} from '../src/drafting.js';
const seed=20261125,prior=[0,1,1,0,0,0,0,1],next=[1,1,1,0,1,1,0,1];
test('matched workshop preview reconciles transitions and unchanged assumptions',()=>{
 const q=quickCompare(prior,next,seed,0);
 expect(q.count).toBe(10000);expect(q.bins.slice(0,3).reduce((a,b)=>a+b,0)).toBe(q.count);
 expect(q.after-q.before).toBe(q.toYes-q.away);
 const same=quickCompare(prior,prior,seed,0);expect(same.toYes).toBe(0);expect(same.away).toBe(0);
});
test('local backyard revision retains source and includes concrete compromises',()=>{
 const bill='Allow affordable backyard homes. Participation is voluntary. Launch a pilot program with independent evaluation.';
 const q=quickCompare(prior,prior,seed,0);
 const r=localRevision({bill,modes:['objections'],diagnostics:rankDiagnostics(q.bins)});
 expect(r.revision.startsWith(bill)).toBe(true);
 expect(r.revision).toContain('one additional home per eligible property');
 expect(r.revision).toContain('drainage and infrastructure capacity checks');
 expect(r.revision).toContain('lower-income homeowners');
 expect(r.changes.length).toBeGreaterThanOrEqual(7);
});
test('AI endpoint refuses without explicit consent, and is disabled by default',async()=>{
 const service=createDraftingService({env:{OPENAI_API_KEY:'fake'}});
 expect(service.config().enabled).toBe(false);
 expect(()=>validateRequest({consent:false})).toThrow();
 expect(()=>sanitizeResult({revision:'x',changes:[{objection:'x'}]})).toThrow();
});
test('AI drafting requires an explicit model before advertising readiness or calling the provider',async()=>{
 let calls=0;
 const service=createDraftingService({env:{CONSENSUS_AI_ENABLED:'1',OPENAI_API_KEY:'fake',OPENAI_MODEL:'   '},fetchImpl:async()=>{calls++;throw Error('Must not contact provider.');}});
 expect(service.config()).toMatchObject({enabled:false,model:null});
 expect(service.config().reason).toContain('explicitly configured model');
 await expect(service.revise({bill:'Draft'})).rejects.toThrow('not configured');
 expect(calls).toBe(0);
});
test('AI endpoint uses structured output without storing input and validates result',async()=>{
 const service=createDraftingService({env:{CONSENSUS_AI_ENABLED:'1',OPENAI_API_KEY:'fake',OPENAI_MODEL:'fixture-model'},fetchImpl:async(url,options)=>{
  const body=JSON.parse(options.body);expect(body.model).toBe('fixture-model');expect(body.store).toBe(false);expect(body.text.format.strict).toBe(true);
  return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({revision:'Revised bill',changes:[{objection:'Cost',compromise:'Capped spending'}]})}]}]});
 }});
 const body={consent:true,bill:'Draft',modes:['cost'],prompt:'',diagnostics:[]};
 expect((await service.revise(validateRequest(body))).revision).toBe('Revised bill');
});
test('legacy drafting alias preserves the shared API security boundary and request body',async()=>{
 const seen=[];
 const handler=createHandler({handleApi:async(req,context)=>{
  seen.push({path:new URL(req.url).pathname,csrf:req.headers.get('x-csrf-token'),body:req.method==='POST'?await req.json():null,context});
  return Response.json({error:'Session required'},{status:403});
 }});
 const context={deploy:{context:'deploy-preview'}};
 const body={bill:'Draft',consent:true};
 expect((await handler(new Request('https://example.test/.netlify/functions/consensus-revise'),context)).status).toBe(403);
 expect((await handler(new Request('https://example.test/.netlify/functions/consensus-revise',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':'proof'},body:JSON.stringify(body)}),context)).status).toBe(403);
 expect(seen.map(x=>x.path)).toEqual(['/api/drafting/config','/api/drafting/revise']);
 expect(seen[1]).toMatchObject({csrf:'proof',body,context});
});
