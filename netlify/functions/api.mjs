import {getRuntime,createRuntime} from '../../src/runtime.js';
import {clientIP} from '../../src/email.js';
import {configuredDatabase,forwardCivic} from '../../src/fly-civic-gateway.js';
import {hasResearchDatabase,serveResearch} from '../../src/research-preview.js';
import {AccountError,createAccountService} from '../../src/account.js';
import {deploymentMode,workspacePath,capability} from '../../src/workspace-persistence.js';

const account = createAccountService();
const accountHeaders = {'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};

export const config = {path: ['/api/*', '/email/unsubscribe', '/proxy/ycr', '/proxy/ycr/*']};

// Workspace preview data is independent of production civic and research preview
// data. Never inherit production integration secrets.
let previewRuntime;
function getPreviewRuntime(env=process.env){
 const isolated={SUPABASE_DB_URL:env.HELIOS_PREVIEW_DB_URL,NETLIFY:'true',...(env.HELIOS_PREVIEW_CA_CERT?{SUPABASE_CA_CERT:env.HELIOS_PREVIEW_CA_CERT}:{})};
 previewRuntime??=createRuntime({env:isolated,adminToken:null}).catch(error=>{previewRuntime=undefined;throw error});
 return previewRuntime;
}
const reply=(data,status=200)=>Response.json(data,{status,headers:accountHeaders});
async function unavailableStatus(request,context,forward,reason){
 let upstream=null;
 try{const result=await forward(new Request(new URL('/api/health',request.url)),context);if(result.ok)upstream=await result.json()}catch{}
 return reply({storage:upstream?.storage||'unverified',runtime:upstream?.runtime||'netlify-functions',mode:'practice',writable:false,reason});
}

// Dependencies can be isolated in tests without a real database or network.
export function createApiHandler({loadRuntime=getRuntime,hasDatabase=configuredDatabase,forward=forwardCivic,log=console.error,loadPreviewRuntime=getPreviewRuntime,env=process.env}={}) {
  return async (request, context={}) => {
    try {
      // Preview code must not mutate or read the production contribution inbox.
      // Production may use the existing configured database or the allowlisted Fly gateway.
      const url=new URL(request.url),path=url.pathname,method=request.method;
      const kind=context?.deploy?.context||env.CONTEXT;
      const deployContext={...context,deploy:{...context?.deploy,context:kind}};
      const mode=deploymentMode(deployContext,url.hostname,env);
      const previewHost=/^(?:deploy-preview-\d+|[a-f0-9]{24}|main)--heliosailol\.netlify\.app$/.test(url.hostname);
      const nonProduction=mode!=='production'&&(Boolean(kind)||previewHost);
      const statusPath=path==='/api/workspace-status'&&method==='GET';
      if((path==='/api/contributions'||path.startsWith('/api/contributions/'))&&kind!=='production')return Response.json({error:'The contribution inbox is available on the deployed production app, not this preview. Use the GitHub option.',code:'PREVIEW_INBOX_DISABLED'},{status:403,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
      const databaseConfigured=hasDatabase();
      const accountPath=path.match(/^\/api\/(?:(research)\/)?account\/(config|me)$/);
      // Authentication and durable storage are separate capabilities. The
      // legacy Fly gateway cannot save account votes or research ownership.
      if(accountPath&&(!databaseConfigured||nonProduction)&&!(accountPath[1]&&hasResearchDatabase())){
        if(request.method!=='GET')return Response.json({error:'Use GET'},{status:405,headers:{...accountHeaders,Allow:'GET'}});
        const capability={storage:'unconfigured',runtime:'netlify-functions',scope:accountPath[1]?'research':'civic',votes:false,research:false};
        try{
          const data=accountPath[2]==='config'?account.config(capability):account.me(await account.identify(request),capability);
          return Response.json(data,{headers:accountHeaders});
        }catch(error){
          return Response.json({error:error instanceof AccountError?error.message:'Account verification is temporarily unavailable.'},{status:error instanceof AccountError?error.status:503,headers:accountHeaders});
        }
      }
      if(path.startsWith('/api/research/')&&hasResearchDatabase()){
        try{return await serveResearch(request,clientIP(request,context?.ip||'unknown'));}
        catch{
          log('Isolated research backend unavailable.');
          return Response.json({error:'Shared research is temporarily unavailable. Your draft has not been saved.',code:'RESEARCH_UNAVAILABLE'},{status:503,headers:accountHeaders});
        }
      }
      // Independently provisioned research routes above retain their own runtime.
      // Civic previews must not silently use the production database.
      if(nonProduction){
        if(mode==='preview-test'&&workspacePath(path)){
          const {app,db}=await loadPreviewRuntime(env);
          if(statusPath)return reply(capability({storage:db.kind,runtime:'netlify-functions'},mode));
          return await app(request,clientIP(request,context?.ip||'unknown'));
        }
        if(statusPath)return await unavailableStatus(request,context,forward,'Preview writes require an explicitly enabled isolated test database.');
        if(method!=='GET'&&method!=='HEAD'||path==='/api/session')return reply({error:'Preview database writes are disabled.'},503);
        if(path==='/api/health'&&method==='GET')return await forward(request,context);
        if(databaseConfigured||mode==='preview-test')return reply({error:'Production database credentials are not used on this preview.'},503);
        return await forward(request,context);
      }
      if(statusPath){
        if(mode!=='production'||!databaseConfigured)return await unavailableStatus(request,context,forward,'Configure SUPABASE_DB_URL for the production deployment to enable persistent law-board writes.');
        const {db}=await loadRuntime();
        return reply(capability({storage:db.kind,runtime:'netlify-functions'},mode));
      }
      if (!databaseConfigured) return await forward(request,context);
      const {app} = await loadRuntime();
      return await app(request, clientIP(request, context?.ip || 'unknown'));
    } catch {
      // Await both paths inside this boundary. Never expose initialization errors,
      // connection strings or stack traces, or fail over a configured database.
      log('Helios backend unavailable.');
      return Response.json({error:'The configured backend is temporarily unavailable.',code:'BACKEND_UNAVAILABLE'},{status:503,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
    }
  };
}

export default createApiHandler();
