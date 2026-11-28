import {test,expect} from 'bun:test';
import {setTimeout as wait} from 'node:timers/promises';
import {client,setup} from './helpers.js';
import {workerConfig,createResearchAdapter,researchResult,createMiniSymphonyWorker} from '../src/mini-symphony-worker.js';

const workerToken = 'local-worker-token-abcdefghijklmnopqrstuvwxyz';
const providerKey = 'test-provider-key-never-log';
const roomId = 'room-11111111-1111-4111-8111-111111111111';
const env = {HELIOS_RESEARCH_API_BASE_URL:'http://localhost',HELIOS_RESEARCH_ROOM_ID:roomId,HELIOS_RESEARCH_WORKER_TOKEN:workerToken,OPENAI_API_KEY:providerKey,HELIOS_RESEARCH_MODEL:'test-research-model'};
const baseConfig = overrides => ({...workerConfig(env,{once:true}),heartbeatMs:10,pollMs:2,...overrides});
const payload = (text='A test pilot needs a measured baseline.',annotations=[]) => ({status:'completed',output:[{type:'web_search_call',status:'completed'},{type:'message',content:[{type:'output_text',text,annotations}]}]});
const read = async (rt,path) => (await rt.app(new Request('http://localhost'+path))).json();
async function mission({maxConcurrent=2,paused=false}={}) {
  const rt = await setup({env:{HELIOS_RESEARCH_WORKER_TOKEN:workerToken}}), owner=await client(rt);
  const create=await owner.post('/api/research/rooms',{title:'Worker test',brief:'Investigate a small housing pilot.',agentCount:100,maxConcurrent});
  expect(create.status).toBe(201);
  let snapshot=await create.json();
  const path='/api/research/rooms/'+snapshot.room.id;
  snapshot=await (await owner.post(path+'/plan',{revision:snapshot.room.revision})).json();
  if (!paused) snapshot=await (await owner.post(path+'/control',{revision:snapshot.room.revision,paused:false})).json();
  const fetchImpl=(url,init)=>rt.app(new Request(url,init));
  return {rt,owner,path,snapshot,fetchImpl,config:baseConfig({roomId:snapshot.room.id})};
}

test('worker configuration requires secrets and enforces origin, local demo, and lane limits',()=>{
  expect(workerConfig(env).concurrency).toBe(2);
  expect(()=>workerConfig({...env,OPENAI_API_KEY:''})).toThrow('OPENAI_API_KEY');
  expect(()=>workerConfig({...env,HELIOS_RESEARCH_MODEL:''})).toThrow('HELIOS_RESEARCH_MODEL');
  expect(()=>workerConfig({...env,HELIOS_RESEARCH_CONCURRENCY:21})).toThrow('Concurrency');
  expect(()=>workerConfig({...env,HELIOS_RESEARCH_API_BASE_URL:'http://example.com'})).toThrow('HTTPS');
  expect(()=>workerConfig({...env,HELIOS_RESEARCH_API_BASE_URL:'https://user:pass@example.com'})).toThrow('credentials');
  expect(()=>workerConfig({...env,HELIOS_RESEARCH_API_BASE_URL:'https://example.com/api'})).toThrow('path');
  expect(()=>workerConfig({...env,HELIOS_RESEARCH_API_BASE_URL:'https://example.com'},{demo:true})).toThrow('loopback');
  expect(workerConfig({...env,OPENAI_API_KEY:''},{demo:true,once:true})).toMatchObject({demo:true,concurrency:1,maxTasks:1});
});

test('real adapter invokes bounded web research and preserves provider source annotations',async()=>{
  let call;
  const adapter=createResearchAdapter(baseConfig(),{fetchImpl:async(url,init)=>{
    call={url,headers:init.headers,body:JSON.parse(init.body)};
    return Response.json(payload('Baseline data are needed.',[{type:'url_citation',url:'https://example.org/study',title:'Primary study'}]));
  }});
  const result=await adapter({task:{id:'t',slot:1,role:'evidence',prompt:'Check sources',notes:''},room:{brief:'Housing',frames:[],reviewedOutputs:[]}},new AbortController().signal);
  expect(call.url).toBe('https://api.openai.com/v1/responses');
  expect(call.headers.Authorization).toBe('Bearer '+providerKey);
  expect(call.body).toMatchObject({store:false,max_output_tokens:2500,max_tool_calls:3,tools:[{type:'web_search',search_context_size:'low'}]});
  expect(JSON.stringify(call.body)).not.toContain(workerToken);
  expect(result).toContain('human review required');
  expect(result).toContain('https://example.org/study');
  expect(result).toContain('Source links below came from the provider');
  expect(result.length).toBeLessThanOrEqual(16000);
  expect(researchResult(payload('Assumptions only'), 'test')).toContain('No search-backed citations');
  expect(()=>researchResult({status:'incomplete',output:[]},'test')).toThrow('did not finish');
  expect(()=>researchResult({status:'completed',output:[]},'test')).toThrow('No research draft');
  const unicode=researchResult(payload('未来'.repeat(15000)), 'test');
  expect(Buffer.byteLength(JSON.stringify({roomId,taskId:'task-123',leaseToken:'lease',result:unicode}))).toBeLessThan(32768);
  expect(unicode.length).toBeLessThanOrEqual(16000);
  expect(unicode).toContain('[Draft excerpt');
});

test('runner completes durable tasks, observes actual live workers, and respects the room concurrency cap',async()=>{
  const m=await mission({maxConcurrent:2});
  let active=0,peak=0,sawContext=false,sawLiveStatus=false;
  try {
    const adapter=async(claim,signal)=>{
      active++;peak=Math.max(peak,active);
      try {
        sawContext ||= claim.room.frames.length>0 && Array.isArray(claim.room.reviewedOutputs);
        const status=await read(m.rt,'/api/research/status');
        sawLiveStatus ||= status.workerConfigured && status.activeWorkerLeases>0;
        await wait(20,undefined,{signal});
        return 'TEST ONLY — source review is required.';
      } finally { active--; }
    };
    const worker=createMiniSymphonyWorker({...m.config,once:false,concurrency:20,maxTasks:5},{fetchImpl:m.fetchImpl,adapter});
    expect(await worker.run()).toMatchObject({claimed:5,completed:5,failed:0,lostLeases:0});
    expect(peak).toBeLessThanOrEqual(2);
    expect(sawContext).toBe(true);expect(sawLiveStatus).toBe(true);
    const snapshot=await read(m.rt,m.path);
    expect(snapshot.tasks.filter(t=>t.status==='needs_review')).toHaveLength(5);
    expect(snapshot.tasks.filter(t=>t.status==='approved')).toHaveLength(0);
    expect(snapshot.connectedWorkers).toBe(0);
    expect(await read(m.rt,'/api/research/status')).toMatchObject({workerConfigured:true,activeWorkerLeases:0,connectedWorkers:0});
    expect((await m.rt.db.query('SELECT COUNT(*) AS n FROM research_task_outputs')).rows[0].n).toBe(5);
  } finally { await m.rt.store.close(); }
},20000);

test('a paused room makes --once exit without a model request',async()=>{
  const m=await mission({paused:true});let calls=0;
  try {
    const worker=createMiniSymphonyWorker(m.config,{fetchImpl:m.fetchImpl,adapter:async()=>{calls++;return 'Never';}});
    expect(await worker.run()).toMatchObject({claimed:0,completed:0});expect(calls).toBe(0);
  } finally { await m.rt.store.close(); }
});

test('provider failure saves a failure receipt, pauses dispatch and cannot be approved as a result',async()=>{
  const m=await mission();const logs=[];
  try {
    const fetchImpl=(url,init)=>url.startsWith('https://api.openai.com/')?Promise.resolve(Response.json({error:'provider secret body'},{status:503})):m.fetchImpl(url,init);
    const worker=createMiniSymphonyWorker(m.config,{fetchImpl,log:event=>logs.push(event)});
    expect(await worker.run()).toMatchObject({claimed:1,failed:1,completed:0});
    const snapshot=await read(m.rt,m.path),task=snapshot.tasks.find(t=>t.status==='needs_review');
    expect(snapshot.room.paused).toBe(true);
    const detail=await read(m.rt,m.path+'/tasks/'+task.id);
    expect(detail.result).toBe('');expect(detail.notes).toContain('model provider');
    expect((await m.owner.post(m.path+'/tasks/'+task.id,{revision:task.revision,status:'approved'})).status).toBe(409);
    const attempt=(await m.rt.db.query('SELECT result FROM research_task_outputs WHERE task_id=$1',[task.id])).rows[0];
    expect(attempt.result).toContain('Worker failure (provider_unavailable)');
    expect(JSON.stringify(logs)).not.toContain(providerKey);
    expect(JSON.stringify(logs)).not.toContain(workerToken);
    expect(JSON.stringify(logs)).not.toContain('provider secret body');
  } finally { await m.rt.store.close(); }
});

test('lost heartbeat lease aborts the adapter and never publishes its stale output',async()=>{
  const m=await mission();let aborted=false,completed=0;
  try {
    const fetchImpl=async(url,init)=>{
      if (url.endsWith('/heartbeat')) return Response.json({error:'stale'},{status:409});
      if (url.endsWith('/complete')) completed++;
      return m.fetchImpl(url,init);
    };
    const adapter=async(claim,signal)=>{try{await wait(500,undefined,{signal});return 'stale output';}catch(error){aborted=signal.aborted;throw error;}};
    expect(await createMiniSymphonyWorker(m.config,{fetchImpl,adapter}).run()).toMatchObject({claimed:1,completed:0,lostLeases:1});
    expect(aborted).toBe(true);expect(completed).toBe(0);
    expect((await m.rt.db.query('SELECT COUNT(*) AS n FROM research_task_outputs')).rows[0].n).toBe(0);
  } finally { await m.rt.store.close(); }
});

test('graceful stop records interrupted work and releases its lease',async()=>{
  const m=await mission(),stop=new AbortController();
  try {
    const adapter=async(claim,signal)=>{queueMicrotask(()=>stop.abort());await wait(1000,undefined,{signal});return 'No';};
    expect(await createMiniSymphonyWorker(m.config,{fetchImpl:m.fetchImpl,adapter}).run({signal:stop.signal})).toMatchObject({claimed:1,completed:0,failed:1});
    const snapshot=await read(m.rt,m.path);
    expect(snapshot.room.paused).toBe(true);expect(snapshot.connectedWorkers).toBe(0);
    const failure=(await m.rt.db.query('SELECT result FROM research_task_outputs')).rows[0];
    expect(failure.result).toContain('(interrupted)');
  } finally { await m.rt.store.close(); }
});

test('lost completion reply preserves the committed result without a failure overwrite or paid rerun',async()=>{
  const m=await mission();let calls=0,failed=0;
  try {
    const fetchImpl=async(url,init)=>{
      if(url.endsWith('/fail'))failed++;
      const response=await m.fetchImpl(url,init);
      if(url.endsWith('/complete'))throw Error('reply lost');
      return response;
    };
    const adapter=async()=>{calls++;return 'A completed draft requiring human review.';};
    expect(await createMiniSymphonyWorker(m.config,{fetchImpl,adapter}).run()).toMatchObject({claimed:1,completed:0,unconfirmed:1});
    expect(calls).toBe(1);expect(failed).toBe(0);
    const result=(await m.rt.db.query("SELECT result FROM research_tasks WHERE status='needs_review'")).rows[0];
    expect(result.result).toBe('A completed draft requiring human review.');
  } finally { await m.rt.store.close(); }
});
