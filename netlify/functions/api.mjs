import {getRuntime,createRuntime} from '../../src/runtime.js';
import {clientIP} from '../../src/email.js';
import {configuredDatabase,forwardCivic} from '../../src/fly-civic-gateway.js';
import {hasResearchDatabase,serveResearch} from '../../src/research-preview.js';
import {AccountError,createAccountService} from '../../src/account.js';
import {deploymentMode,workspacePath,capability} from '../../src/workspace-persistence.js';
import {featureStatus} from '../../src/feature-status.js';

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
const featureConfigPaths=new Set(['/api/github/config','/api/drafting/config','/api/email/config']);
const previewFeaturePath=path=>['/api/features','/api/account/preferences','/api/account/config','/api/account/me'].includes(path)||featureConfigPaths.has(path);
const disconnectedConfig=(path,mode)=>({
 enabled:false,available:false,storage:'unconfigured',
 reason:mode==='practice'?'This deployment has no isolated writable database. Connected actions are unavailable.':'A writable database connection is required for this integration.',
 ...(path==='/api/email/config'?{deliveryEnabled:false,subscriptionsEnabled:false,delayHours:72}:{}),
});
async function unavailableStatus(request,context,forward,reason){
 let upstream=null;
 try{const result=await forward(new Request(new URL('/api/health',request.url)),context);if(result.ok)upstream=await result.json()}catch{}
 return reply({storage:upstream?.storage||'unverified',runtime:upstream?.runtime||'netlify-functions',mode:'practice',writable:false,reason});
}

// Dependencies can be isolated in tests without a real database or network.
export function createApiHandler({loadRuntime=getRuntime,hasDatabase=configuredDatabase,forward=forwardCivic,log=console.error,loadPreviewRuntime=getPreviewRuntime,hasResearch=hasResearchDatabase,researchHandler=serveResearch,env=process.env}={}) {
  // Discovery follows the same routing decisions as actual writes. A research
  // database is a separate authority: its failure never falls back to civic data.
  async function discover(request,context,{mode,nonProduction,databaseConfigured,researchConfigured}){
    const ip=clientIP(request,context?.ip||'unknown');
    let data=featureStatus({health:{storage:'unconfigured',runtime:'netlify-functions'},mode,writable:false});
    if(mode==='preview-test'||databaseConfigured&&!nonProduction){
      try{
        const {app}=mode==='preview-test'?await loadPreviewRuntime(env):await loadRuntime();
        const result=await app(request,ip),body=await result.json();
        if(!result.ok||!Array.isArray(body.features))throw Error('Invalid capability response');
        data={...body,mode};
      }catch{
        log('Helios capability discovery unavailable.');
        data=featureStatus({health:{storage:'unavailable',runtime:'netlify-functions'},mode,writable:false});
      }
    }
    let researchOverride;
    if(researchConfigured){
      let research={writable:false,workerConfigured:false,activeWorkerLeases:0};
      try{
        // A fresh, public status request never inherits browser credentials.
        const result=await researchHandler(new Request(new URL('/api/research/status',request.url)),ip,env);
        const status=await result.json();
        if(result.ok&&status.available===true&&typeof status.writable==='boolean')research={
          writable:status.writable,workerConfigured:status.workerConfigured===true,
          activeWorkerLeases:status.activeWorkerLeases,
        };
      }catch{log('Isolated research capability discovery unavailable.');}
      researchOverride=featureStatus({health:{storage:'supabase-postgres',runtime:'netlify-functions'},mode,writable:false,research}).features;
    }else if(nonProduction){
      // The isolated civic preview only admits workspacePath/previewFeaturePath.
      // Its database does not make the separate research routes writable.
      researchOverride=featureStatus({mode,writable:false,research:{writable:false}}).features;
    }
    const researchIds=new Set(['research','keyframes','agents']);
    const overrides=new Map((researchOverride||[]).filter(item=>researchIds.has(item.id)).map(item=>[item.id,item]));
    if(mode==='preview-test'){
      const proposals=data.features.find(item=>item.id==='proposals');
      if(proposals?.available)overrides.set('proposals',{
        ...proposals,available:false,state:'partial',
        reason:'Updates to existing law-board records are supported here. Creating new laws and using the general amendments API are disabled on this preview.',
      });
      for(const id of ['pull-requests','drafting','email']){
        const feature=data.features.find(item=>item.id===id);
        if(feature)overrides.set(id,{...feature,available:false,state:'setup',reason:'External publishing, AI requests and email delivery are disabled on this isolated preview.'});
      }
    }
    return reply({...data,mode,features:data.features.map(item=>overrides.get(item.id)||item)});
  }
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
      const databaseConfigured=hasDatabase(env);
      const researchConfigured=hasResearch(env);
      // Capability discovery is public and never initializes a production
      // database or integration from an untrusted preview deployment.
      if(path==='/api/features')return method==='GET'?await discover(request,context,{mode,nonProduction,databaseConfigured,researchConfigured}):reply({error:'Use GET'},405);
      if(path==='/api/email/config'&&mode==='preview-test')return method==='GET'
        ?reply({...disconnectedConfig(path,mode),reason:'Email subscriptions and delivery are disabled on this isolated preview.'})
        :reply({error:'Use GET'},405);
      if(featureConfigPaths.has(path)&&(!databaseConfigured||nonProduction)&&mode!=='preview-test'){
        if(method!=='GET')return reply({error:'Use GET'},405);
        return reply(disconnectedConfig(path,mode));
      }
      const accountPath=path.match(/^\/api\/(?:(research)\/)?account\/(config|me)$/);
      // Authentication and durable storage are separate capabilities. The
      // legacy Fly gateway cannot save account votes or research ownership.
      if(accountPath&&(mode!=='preview-test'||accountPath[1])&&(!databaseConfigured||nonProduction)&&!(accountPath[1]&&researchConfigured)){
        if(request.method!=='GET')return Response.json({error:'Use GET'},{status:405,headers:{...accountHeaders,Allow:'GET'}});
        const capability={storage:'unconfigured',runtime:'netlify-functions',scope:accountPath[1]?'research':'civic',votes:false,research:false};
        try{
          const data=accountPath[2]==='config'?account.config(capability):account.me(await account.identify(request),capability);
          return Response.json(data,{headers:accountHeaders});
        }catch(error){
          return Response.json({error:error instanceof AccountError?error.message:'Account verification is temporarily unavailable.'},{status:error instanceof AccountError?error.status:503,headers:accountHeaders});
        }
      }
      if(path.startsWith('/api/research/')&&researchConfigured){
        try{return await researchHandler(request,clientIP(request,context?.ip||'unknown'),env);}
        catch{
          log('Isolated research backend unavailable.');
          return Response.json({error:'Shared research is temporarily unavailable. Your draft has not been saved.',code:'RESEARCH_UNAVAILABLE'},{status:503,headers:accountHeaders});
        }
      }
      // Independently provisioned research routes above retain their own runtime.
      // Civic previews must not silently use the production database.
      if(nonProduction){
        if(mode==='preview-test'&&(workspacePath(path)||previewFeaturePath(path))){
          const {app,db}=await loadPreviewRuntime(env);
          if(statusPath)return reply(capability({storage:db.kind,runtime:'netlify-functions'},mode));
          const result=await app(request,clientIP(request,context?.ip||'unknown'));
          return result;
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
      if(new URL(request.url).pathname==='/api/features'&&request.method==='GET')return reply(featureStatus({health:{storage:'unavailable',runtime:'netlify-functions'},mode:'unavailable',writable:false}));
      return Response.json({error:'The configured backend is temporarily unavailable.',code:'BACKEND_UNAVAILABLE'},{status:503,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
    }
  };
}

export default createApiHandler();
