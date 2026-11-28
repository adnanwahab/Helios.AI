import {test,expect} from 'bun:test';
import {createApiHandler} from '../netlify/functions/api.mjs';
import {featureStatus} from '../src/feature-status.js';

const prod={deploy:{context:'production'}},preview={deploy:{context:'deploy-preview'}};
const main='postgresql://postgres.aaaaaaaaaaaaaaaaaaaa:one@pooler.supabase.com:6543/postgres';
const isolated='postgresql://postgres.bbbbbbbbbbbbbbbbbbbb:two@pooler.supabase.com:6543/postgres';
const request=(path='/api/features',{preview=false,method='GET',headers}={})=>new Request('https://'+(preview?'deploy-preview-200--heliosailol.netlify.app':'helioshtml.com')+path,{method,headers});
const feature=(data,id)=>data.features.find(item=>item.id===id);
const healthy=()=>featureStatus({health:{storage:'supabase-postgres',runtime:'netlify-functions'},writable:true,
  github:{enabled:true},drafting:{enabled:true},email:{deliveryEnabled:true},research:{workerConfigured:true,activeWorkerLeases:5}});
const noCalls=()=>{throw Error('Unexpected backend access');};

test('unconfigured previews discover browser tools without initializing production or integrations',async()=>{
  const handle=createApiHandler({env:{SUPABASE_DB_URL:main},loadRuntime:noCalls,loadPreviewRuntime:noCalls,forward:noCalls,hasResearch:()=>false});
  const response=await handle(request('/api/features',{preview:true,headers:{'x-helios-access-token':'stale'}}),preview);
  expect(response.status).toBe(200);
  const result=await response.json();
  expect(result.mode).toBe('practice');expect(result.features.filter(item=>item.available)).toHaveLength(6);
  for(const path of ['/api/github/config','/api/drafting/config','/api/email/config']){
    const config=await handle(request(path,{preview:true}),preview);
    expect(config.status).toBe(200);
    expect((await config.json()).enabled).toBe(false);
  }
});

test('isolated civic preview discovery matches its route restrictions and enables account preferences only there',async()=>{
  const paths=[];
  const handle=createApiHandler({env:{SUPABASE_DB_URL:main,HELIOS_PREVIEW_DB_URL:isolated,HELIOS_PREVIEW_WRITES:'1'},
    loadRuntime:noCalls,forward:noCalls,hasResearch:()=>false,loadPreviewRuntime:async()=>({db:{kind:'supabase-postgres'},app:async req=>{
      const path=new URL(req.url).pathname;paths.push(path);
      if(path==='/api/features')return Response.json(healthy());
      if(path==='/api/account/config')return Response.json({available:true,accountPersistence:{preferences:true}});
      return Response.json({path});
    }})});
  const result=await (await handle(request('/api/features',{preview:true}),preview)).json();
  expect(result.mode).toBe('preview-test');
  expect(feature(result,'votes').available).toBe(true);expect(feature(result,'account').available).toBe(true);
  expect(feature(result,'proposals')).toMatchObject({available:false,state:'partial'});
  for(const id of ['research','keyframes','agents','pull-requests','drafting','email'])expect(feature(result,id).available).toBe(false);
  const account=await handle(request('/api/account/config',{preview:true}),preview);
  expect((await account.json()).accountPersistence.preferences).toBe(true);
  const email=await handle(request('/api/email/config',{preview:true}),preview);
  expect(await email.json()).toMatchObject({subscriptionsEnabled:false,deliveryEnabled:false});
  expect(paths).not.toContain('/api/email/config');
  expect((await handle(request('/api/account/preferences',{preview:true,method:'POST'}),preview)).status).toBe(200);
  expect((await handle(request('/api/laws',{preview:true,method:'POST'}),preview)).status).toBe(503);
  expect((await handle(request('/api/email/subscribe',{preview:true,method:'POST'}),preview)).status).toBe(503);
});

test('production discovery uses the selected research database rather than civic worker leases',async()=>{
  let calls=0;
  const env={SUPABASE_DB_URL:main,HELIOS_RESEARCH_DB_URL:isolated};
  const handle=createApiHandler({env,loadRuntime:async()=>({app:async()=>Response.json(healthy())}),
    researchHandler:async(req,_ip,actualEnv)=>{
      calls++;expect(new URL(req.url).pathname).toBe('/api/research/status');expect(actualEnv).toBe(env);
      expect(req.headers.get('cookie')).toBeNull();expect(req.headers.get('x-helios-access-token')).toBeNull();
      return Response.json({available:true,writable:true,workerConfigured:false,activeWorkerLeases:0});
    }});
  const result=await (await handle(request('/api/features',{headers:{cookie:'private','x-helios-access-token':'private'}}),prod)).json();
  expect(calls).toBe(1);expect(feature(result,'votes').available).toBe(true);
  expect(feature(result,'research').available).toBe(true);expect(feature(result,'keyframes').available).toBe(true);
  expect(feature(result,'agents').available).toBe(false);
});

test('selected research failure disables only research capabilities and never falls back to civic state',async()=>{
  let calls=0;
  const handle=createApiHandler({env:{SUPABASE_DB_URL:main,HELIOS_RESEARCH_DB_URL:isolated},loadRuntime:async()=>({app:async()=>Response.json(healthy())}),
    researchHandler:async()=>{calls++;throw Error('private research connection string');},forward:noCalls,log:()=>{}});
  const result=await (await handle(request(),prod)).json();
  expect(calls).toBe(1);expect(feature(result,'votes').available).toBe(true);
  for(const id of ['research','keyframes','agents'])expect(feature(result,id).available).toBe(false);
  expect(JSON.stringify(result)).not.toContain('private research connection string');
});

test('civic initialization failure leaves a separately healthy research backend discoverable',async()=>{
  let calls=0;
  const handle=createApiHandler({env:{SUPABASE_DB_URL:main,HELIOS_RESEARCH_DB_URL:isolated},loadRuntime:async()=>{throw Error('private civic connection string');},
    researchHandler:async()=>{calls++;return Response.json({available:true,writable:true,workerConfigured:true,activeWorkerLeases:2});},forward:noCalls,log:()=>{}});
  const result=await (await handle(request(),prod)).json();
  expect(calls).toBe(1);expect(result.storage).toBe('unavailable');expect(feature(result,'account').available).toBe(false);
  expect(feature(result,'research').available).toBe(true);expect(feature(result,'agents')).toMatchObject({available:true,state:'running'});
  expect(JSON.stringify(result)).not.toContain('private civic connection string');
});

test('isolated research preview discovery remains independent of production civic credentials',async()=>{
  let calls=0;
  const handle=createApiHandler({env:{SUPABASE_DB_URL:main,HELIOS_RESEARCH_DB_URL:isolated},loadRuntime:noCalls,loadPreviewRuntime:noCalls,
    researchHandler:async()=>{calls++;return Response.json({available:true,writable:true,workerConfigured:true,activeWorkerLeases:0});}});
  const result=await (await handle(request('/api/features',{preview:true}),preview)).json();
  expect(calls).toBe(1);expect(feature(result,'votes').available).toBe(false);
  expect(feature(result,'research').available).toBe(true);expect(feature(result,'agents')).toMatchObject({available:true,state:'configured'});
});
