import {test,expect} from 'bun:test';
import {localRevision,quickCompare,rankDiagnostics} from '../public/consensus-world-workshop-logic.js';
import {validateRequest,sanitizeResult,createHandler} from '../netlify/functions/consensus-revise.mjs';
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
 const handler=createHandler({env:{OPENAI_API_KEY:'fake'}});
 expect((await (await handler(new Request('https://test.local/'))).json()).enabled).toBe(false);
 expect(()=>validateRequest({consent:false})).toThrow();
 expect(()=>sanitizeResult({revision:'x',changes:[{objection:'x'}]})).toThrow();
});
test('AI endpoint uses structured output without storing input and validates result',async()=>{
 const handler=createHandler({env:{CONSENSUS_AI_ENABLED:'1',OPENAI_API_KEY:'fake'},fetchImpl:async(url,options)=>{
  const body=JSON.parse(options.body);expect(body.store).toBe(false);expect(body.text.format.strict).toBe(true);
  return Response.json({output:[{content:[{type:'output_text',text:JSON.stringify({revision:'Revised bill',changes:[{objection:'Cost',compromise:'Capped spending'}]})}]}]});
 }});
 const body={consent:true,bill:'Draft',modes:['cost'],prompt:'',diagnostics:[]};
 const req=()=>new Request('https://test.local/',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const res=await handler(req(),{ip:'test'});expect(res.status).toBe(200);expect((await res.json()).revision).toBe('Revised bill');
 await handler(req(),{ip:'test'});await handler(req(),{ip:'test'});expect((await handler(req(),{ip:'test'})).status).toBe(429);
});
