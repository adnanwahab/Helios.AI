import {getRuntime} from '../../src/runtime.js';
import {clientIP} from '../../src/email.js';
import {configuredDatabase,forwardCivic} from '../../src/fly-civic-gateway.js';
import {hasResearchDatabase,serveResearch} from '../../src/research-preview.js';
import {AccountError,createAccountService} from '../../src/account.js';

const account = createAccountService();
const accountHeaders = {'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};

export const config = {path: ['/api/*', '/email/unsubscribe', '/proxy/ycr', '/proxy/ycr/*']};

// Dependencies can be isolated in tests without a real database or network.
export function createApiHandler({loadRuntime=getRuntime,hasDatabase=configuredDatabase,forward=forwardCivic,log=console.error}={}) {
  return async (request, context={}) => {
    try {
      // Preview code must not mutate or read the production contribution inbox.
      // Production may use the existing configured database or the allowlisted Fly gateway.
      const path=new URL(request.url).pathname;
      if((path==='/api/contributions'||path.startsWith('/api/contributions/'))&&(context?.deploy?.context||process.env.CONTEXT)!=='production')return Response.json({error:'The contribution inbox is available on the deployed production app, not this preview. Use the GitHub option.',code:'PREVIEW_INBOX_DISABLED'},{status:403,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
      const databaseConfigured=hasDatabase();
      const accountPath=path.match(/^\/api\/(?:(research)\/)?account\/(config|me)$/);
      // Authentication and durable storage are separate capabilities. The
      // legacy Fly gateway cannot save account votes or research ownership.
      if(accountPath&&!databaseConfigured&&!(accountPath[1]&&hasResearchDatabase())){
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
