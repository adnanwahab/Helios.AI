// The existing Fly PGlite volume is authoritative when this Netlify site
// has no configured database. Never fail over a configured DB to another store.
export const FLY_ORIGIN='https://helios-ai-laws.fly.dev';
export const SITE_ID='621d28e6-72fd-452b-9f94-96cb6f33603c';
const MAX_BODY=32768;
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const json=(body,status)=>Response.json(body,{status,headers});
export function configuredDatabase(env=process.env){return Boolean((env.SUPABASE_DB_URL||env.DATABASE_URL||'').trim())}
function trustedSite(url,context){
 return context?.site?.id===SITE_ID&&url.protocol==='https:'&&(
 url.hostname==='helioshtml.com'||url.hostname==='www.helioshtml.com'||url.hostname==='heliosailol.netlify.app'||
 /^(?:main|deploy-preview-\d+|[a-f0-9]{24})--heliosailol\.netlify\.app$/.test(url.hostname));
}
const allowedRead=path=>['/api/health','/api/catalog','/api/laws','/api/session','/api/constitution'].includes(path)||/^\/api\/laws\/[A-Z0-9-]+$/i.test(path);
const allowedWrite=path=>['/api/laws','/api/constitution/vote','/api/constitution/comment','/api/constitution/contribute'].includes(path)||/^\/api\/laws\/[A-Z0-9-]+\/amendments$/i.test(path);
const unavailable=(message='The shared civic backend is temporarily unavailable.')=>json({error:message,code:'SHARED_BACKEND_UNAVAILABLE',liveUrl:FLY_ORIGIN+'/'},503);
async function boundedBody(request){
 const declared=Number(request.headers.get('content-length')||0);if(declared>MAX_BODY)return null;
 const reader=request.body?.getReader();if(!reader)return new Uint8Array();
 const chunks=[];let size=0;
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>MAX_BODY){await reader.cancel();return null}chunks.push(value)}
 const result=new Uint8Array(size);let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length}return result;
}
export async function forwardCivic(request,context,{fetchImpl=fetch}={}){
 const url=new URL(request.url),path=url.pathname,method=request.method;
 if(!trustedSite(url,context))return unavailable('Shared data is not configured for this deployment.');
 if(!(method==='GET'&&allowedRead(path)||method==='POST'&&allowedWrite(path)))return unavailable('This operation needs the configured backend. It is not forwarded to the shared civic service.');
 const out=new Headers({Accept:'application/json'});
 // Never forward maintainer authorization, arbitrary cookies, IP headers,
 // or client-selected destinations. This gateway only handles civic routes.
 const cookie=request.headers.get('cookie')?.match(/(?:^|;\s*)helios_session=([a-f0-9]{64})(?:;|$)/i)?.[1];
 if(cookie&&(method==='POST'||path==='/api/session'||path==='/api/constitution'))out.set('Cookie','helios_session='+cookie);
 let body;
 if(method==='POST'){
   if(request.headers.get('origin')!==url.origin)return json({error:'A same-origin request is required.'},403);
   if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))return json({error:'Use application/json.'},415);
   if(!cookie||!request.headers.get('x-csrf-token'))return json({error:'Establish a valid session first.'},403);
   const key=request.headers.get('idempotency-key');if(!key||!/^[a-zA-Z0-9-]{16,80}$/.test(key))return json({error:'A unique Idempotency-Key is required.'},400);
   body=await boundedBody(request);if(body===null)return json({error:'Submission is too large.'},413);
   out.set('Content-Type','application/json');out.set('Origin',FLY_ORIGIN);
   out.set('X-CSRF-Token',request.headers.get('x-csrf-token'));out.set('Idempotency-Key',key);
 }
 try{
   // No arbitrary query string is needed by the allowlisted endpoints.
   const upstream=await fetchImpl(FLY_ORIGIN+path,{method,headers:out,body,redirect:'manual',signal:AbortSignal.timeout(10000)});
   if(upstream.status===404&&path.startsWith('/api/constitution'))return unavailable('The shared constitution API is not deployed yet. Practice mode is available.');
   if(upstream.status>=500||upstream.status>=300&&upstream.status<400)return unavailable();
   if(!upstream.headers.get('content-type')?.toLowerCase().includes('application/json'))return unavailable('The shared civic backend returned an unexpected response.');
   const result=await upstream.json();
   if(path==='/api/health'&&upstream.ok){result.gateway='netlify-to-fly'}
   const responseHeaders=new Headers({...headers,'X-Helios-Backend':'fly'});
   if(path==='/api/session'&&upstream.ok){
     const raw=upstream.headers.get('set-cookie')?.match(/^helios_session=([a-f0-9]{64})(?:;|$)/i)?.[1];
     if(raw)responseHeaders.set('Set-Cookie','helios_session='+raw+'; HttpOnly; SameSite=Lax; Secure; Path=/api; Max-Age=7776000');
   }
   return Response.json(result,{status:upstream.status,headers:responseHeaders});
 }catch(error){console.error('Shared civic backend unavailable:',error?.name||'Error');return unavailable()}
}
