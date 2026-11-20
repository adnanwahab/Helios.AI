import {openStore,Problem,hash} from './src/store.js';
import {timingSafeEqual} from 'node:crypto';
import {resolve} from 'node:path';
const root=import.meta.dir;
const staticFiles=new Set(['index.html','helios_ai_landing_page.html','helios_100_frontend_demo.html','helios-unified.html','health_wealth_of_nations.html','communal_science_lab_webgpu (1).html','public/goals.js','public/persistence.css','public/favicon.ico','public/favicon.svg','public/favicon-16x16.png','public/favicon-32x32.png','public/apple-touch-icon.png','public/android-chrome-192x192.png','public/android-chrome-512x512.png','public/site.webmanifest']);
const equal=(a,b)=>{if(typeof a!=='string'||typeof b!=='string')return false;const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);};
export function createApp({store,origins=[],adminToken=process.env.HELIOS_ADMIN_TOKEN,secure=process.env.NODE_ENV==='production'}={}){
 if(!store)throw Error('Store required');
 const response=(data,status=200,extra={})=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra}});
 return async function handle(request,remoteIP='local'){
  try{
   const url=new URL(request.url),path=url.pathname,method=request.method;
   if(!path.startsWith('/api/')){
    if(!['GET','HEAD'].includes(method))return response({error:'Method not allowed'},405);
    let file=path==='/'?'index.html':path==='/laws'?'helios_100_frontend_demo.html':path.slice(1);try{file=decodeURIComponent(file);}catch{return response({error:'Invalid path'},400);}
    if(!staticFiles.has(file))return response({error:'Not found'},404);const asset=Bun.file(resolve(root,file));if(!await asset.exists())return response({error:'Not found'},404);
    return new Response(method==='HEAD'?null:asset,{headers:{'Content-Type':asset.type,'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin'}});
   }
   const cookie=request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith('helios_session='))?.slice(15);
   if(method==='GET'&&path==='/api/health')return response({status:'ok',storage:'sqlite',runtime:'bun',runtimeVersion:Bun.version,schemaVersion:1,seedCount:100,proposalCount:store.catalog().goals.length,catalogHash:store.catalogHash});
   if(method==='GET'&&path==='/api/session'){if(!store.authenticate(cookie))store.limit('session-issue:'+hash(remoteIP),120,3600000);const session=store.session(cookie);return response({csrfToken:session.csrf,expiresAt:new Date(session.expires).toISOString(),identity:'Pseudonymous browser session; not verified civic identity'},200,session.raw?{'Set-Cookie':`helios_session=${session.raw}; HttpOnly; SameSite=Lax; Path=/api; Max-Age=7776000${secure?'; Secure':''}`}:{ });}
   if(method==='GET'&&['/api/catalog','/api/laws'].includes(path))return response(store.catalog());
   const match=path.match(/^\/api\/laws\/([A-Z0-9-]+)(?:\/(amendments)(?:\/([A-Z0-9a-f-]+)\/(accept))?)?$/i);
   if(method==='GET'&&match&&!match[2])return response(store.detail(match[1]));
   if(method!=='POST')return response({error:'Not found'},404);
   if(![url.origin,...origins].includes(request.headers.get('origin')))throw new Problem(403,'A same-origin request is required.');
   if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))throw new Problem(415,'Use application/json.');
   const session=store.authenticate(cookie);if(!session||!equal(request.headers.get('x-csrf-token'),session.csrf))throw new Problem(403,'Reload the page to establish a valid session.');
   store.limit('session:'+session.id,20,60000);store.limit('ip:'+hash(remoteIP),120,3600000);
   if(Number(request.headers.get('content-length')||0)>32768)throw new Problem(413,'Submission is too large.');
   const reader=request.body?.getReader();let size=0,chunks=[];if(reader)while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>32768){await reader.cancel();throw new Problem(413,'Submission is too large.');}chunks.push(value);}
   let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new Problem(400,'Invalid JSON.');}
   if(path==='/api/laws'||(match?.[2]&&!match[3])){const key=request.headers.get('idempotency-key');if(!key||! /^[a-zA-Z0-9-]{16,80}$/.test(key))throw new Problem(400,'A unique Idempotency-Key is required.');return response(store.idempotent(session.id,key,hash(path+JSON.stringify(body)),()=>path==='/api/laws'?store.create(body,session.id):store.amend(match[1],body,session.id)),201);}
   if(match?.[4]){if(!adminToken)throw new Problem(503,'Maintainer review is not configured. Amendments remain proposed.');if(!equal(request.headers.get('authorization'),'Bearer '+adminToken))throw new Problem(403,'Maintainer authorization is required to accept an amendment.');return response(store.accept(match[1],match[3]));}
   return response({error:'Not found'},404);
  }catch(error){if(error instanceof Problem)return response({error:error.message},error.status);console.error('Request failed:',error?.name||'Error');return response({error:'The request could not be completed.'},500);}
 };
}
if(import.meta.main){
 const store=openStore(process.env.DATABASE_PATH||'.data/helios.sqlite');const origins=(process.env.PUBLIC_ORIGINS||'').split(',').filter(Boolean);const handler=createApp({store,origins});
 const server=Bun.serve({hostname:process.env.HOST||'0.0.0.0',port:Number(process.env.PORT||3000),maxRequestBodySize:32768,fetch:(request,server)=>handler(request,server.requestIP(request)?.address||'unknown')});
 console.log(`Helios.AI listening on http://${server.hostname}:${server.port}`);
 const stop=()=>{server.stop(true);store.close();process.exit(0);};process.on('SIGTERM',stop);process.on('SIGINT',stop);
}
