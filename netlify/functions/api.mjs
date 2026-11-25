import {getRuntime,createRuntime} from '../../src/runtime.js';
import {clientIP} from '../../src/email.js';
import {configuredDatabase,forwardCivic} from '../../src/fly-civic-gateway.js';
import {deploymentMode,workspacePath,capability} from '../../src/workspace-persistence.js';

export const config = {path: ['/api/*', '/email/unsubscribe', '/proxy/ycr', '/proxy/ycr/*']};
const reply=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
let previewRuntime;
function getPreviewRuntime(){
 const env={SUPABASE_DB_URL:process.env.HELIOS_PREVIEW_DB_URL,NETLIFY:'true',...(process.env.HELIOS_PREVIEW_CA_CERT?{SUPABASE_CA_CERT:process.env.HELIOS_PREVIEW_CA_CERT}:{})};
 // Do not inherit production email, admin, AI or moderation credentials.
 previewRuntime??=createRuntime({env,adminToken:null}).catch(e=>{previewRuntime=undefined;throw e});
 return previewRuntime;
}
async function unavailableStatus(url,context,reason){
 let upstream=null;
 try{const res=await forwardCivic(new Request(new URL('/api/health',url)),context);if(res.ok)upstream=await res.json()}catch{}
 return reply({storage:upstream?.storage||'unverified',runtime:upstream?.runtime||'netlify-functions',mode:'practice',writable:false,reason});
}
export default async (request, context) => {
 const url=new URL(request.url),path=url.pathname,method=request.method,mode=deploymentMode(context,url.hostname);
 const status=path==='/api/workspace-status'&&method==='GET';
 try{
  if(mode==='preview-test'){
   if(!workspacePath(path))return reply({error:'Endpoint unavailable on the isolated preview database.'},503);
   const {app,db}=await getPreviewRuntime();
   if(status)return reply(capability({storage:db.kind,runtime:'netlify-functions'},mode));
   return await app(request,clientIP(request,context.ip||'unknown'));
  }
  if(mode==='practice'){
   if(status)return unavailableStatus(url,context,'Preview writes require an explicitly enabled isolated test database.');
   if(method!=='GET'&&method!=='HEAD'||path==='/api/session')return reply({error:'Preview database writes are disabled.'},503);
   if(path==='/api/health'&&method==='GET')return forwardCivic(request,context);
   if(configuredDatabase())return reply({error:'Production database credentials are not used on this preview.'},503);
   return forwardCivic(request,context);
  }
  if(!configuredDatabase()){
   if(status)return unavailableStatus(url,context,'Configure SUPABASE_DB_URL to enable persistent law-board writes.');
   return forwardCivic(request,context);
  }
  const {app,db}=await getRuntime();
  if(status)return reply(capability({storage:db.kind,runtime:'netlify-functions'},mode));
  return await app(request,clientIP(request,context.ip||'unknown'));
 }catch(error){
  console.error('Configured database unavailable:',error?.name||'Error');
  return reply({error:'The configured backend is temporarily unavailable.',code:'BACKEND_UNAVAILABLE'},503);
 }
};
