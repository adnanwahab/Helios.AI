import {test, expect} from 'bun:test';
import {createApiHandler} from '../netlify/functions/api.mjs';
import {configuredDatabase, forwardCivic} from '../src/fly-civic-gateway.js';

const health = () => new Request('https://fork.example/api/health');
const unavailable = {error:'The configured backend is temporarily unavailable.',code:'BACKEND_UNAVAILABLE'};

test('missing database configuration fails closed on an untrusted deployment without initialization or network',async()=>{
  let initialized=0, fetched=0;
  const handle=createApiHandler({
    hasDatabase:()=>configuredDatabase({}),
    loadRuntime:async()=>{initialized++;throw Error('must not initialize')},
    forward:(request,context)=>forwardCivic(request,context,{fetchImpl:async()=>{fetched++;throw Error('must not fetch')}}),
  });
  const response=await handle(health());
  expect(response.status).toBe(503);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect((await response.json()).code).toBe('SHARED_BACKEND_UNAVAILABLE');
  expect(initialized).toBe(0);
  expect(fetched).toBe(0);
});

test('initialization errors return sanitized 503 JSON, log no error details, and never switch databases',async()=>{
  for(const detail of [
    'SUPABASE_DB_URL is not set. Paste the connection string.',
    'Connection failed: postgres://private-user:private-password@private-host/database',
  ]) {
    const logs=[];
    let forwarded=0;
    const error=Object.assign(new Error(detail),{name:'private-user@private-host'});
    const handle=createApiHandler({
      hasDatabase:()=>true,
      loadRuntime:async()=>{throw error},
      forward:async()=>{forwarded++;return Response.json({status:'ok'})},
      log:(...args)=>logs.push(args),
    });
    const response=await handle(health());
    expect(response.status).toBe(503);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await response.json()).toEqual(unavailable);
    expect(logs).toEqual([['Helios backend unavailable.']]);
    expect(forwarded).toBe(0);
  }
});

test('gateway rejections are awaited inside the sanitized error boundary',async()=>{
  const handle=createApiHandler({
    hasDatabase:()=>false,
    forward:async()=>{throw Error('request stream failed: private payload')},
    log:()=>{},
  });
  const response=await handle(health());
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual(unavailable);
});

test('preview inbox denial happens before either backend is accessed',async()=>{
  let accesses=0;
  const unexpected=()=>{accesses++;throw Error('must not access backend')};
  const handle=createApiHandler({hasDatabase:unexpected,loadRuntime:unexpected,forward:unexpected});
  for(const path of ['/api/contributions','/api/contributions/example']) {
    const response=await handle(new Request('https://fork.example'+path),{deploy:{context:'deploy-preview'}});
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe('PREVIEW_INBOX_DISABLED');
  }
  expect(accesses).toBe(0);
});

test('a later request can recover after failed initialization and absent context is supported',async()=>{
  let attempts=0,forwarded=0;
  const handle=createApiHandler({
    hasDatabase:()=>true,
    loadRuntime:async()=>{
      if(++attempts===1)throw Error('initialization unavailable');
      return {app:async(request,ip)=>Response.json({status:'ok',path:new URL(request.url).pathname,ip})};
    },
    forward:()=>{forwarded++;throw Error('must not fail over')},
    log:()=>{},
  });
  expect((await handle(health())).status).toBe(503);
  const response=await handle(health());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({status:'ok',path:'/api/health',ip:'unknown'});
  expect(attempts).toBe(2);
  expect(forwarded).toBe(0);
});
