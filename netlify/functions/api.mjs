import {getRuntime} from '../../src/runtime.js';
import {clientIP} from '../../src/email.js';
import {configuredDatabase,forwardCivic} from '../../src/fly-civic-gateway.js';
import {hasResearchDatabase,serveResearch} from '../../src/research-preview.js';
import {AccountError,createAccountService} from '../../src/account.js';

const account = createAccountService();
const accountHeaders = {'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};

export const config = {path: ['/api/*', '/email/unsubscribe', '/proxy/ycr', '/proxy/ycr/*']};

export default async (request, context) => {
  const path = new URL(request.url).pathname;
  const accountPath = path.match(/^\/api\/(?:(research)\/)?account\/(config|me)$/);
  // Authentication and durable storage are separate capabilities. Let users
  // inspect/sign into their account even when this preview has no account-aware
  // database, but never claim the legacy Fly gateway can save account votes.
  if (accountPath && !configuredDatabase() && !(accountPath[1] && hasResearchDatabase())) {
    if (request.method !== 'GET') return Response.json({error:'Use GET'}, {status:405,headers:{...accountHeaders,Allow:'GET'}});
    const capability = {storage:'unconfigured',runtime:'netlify-functions',scope:accountPath[1] ? 'research' : 'civic',votes:false,research:false};
    try {
      const data = accountPath[2] === 'config' ? account.config(capability) : account.me(await account.identify(request), capability);
      return Response.json(data, {headers:accountHeaders});
    } catch (error) {
      return Response.json({error:error instanceof AccountError ? error.message : 'Account verification is temporarily unavailable.'}, {status:error instanceof AccountError ? error.status : 503,headers:accountHeaders});
    }
  }
  if (new URL(request.url).pathname.startsWith('/api/research/') && hasResearchDatabase()) {
    try { return await serveResearch(request, clientIP(request, context.ip || 'unknown')); }
    catch (error) {
      console.error('Research database unavailable:', error?.name || 'Error');
      return Response.json({error:'Shared research is temporarily unavailable. Your draft has not been saved.',code:'RESEARCH_UNAVAILABLE'}, {status:503,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
    }
  }
  if (!configuredDatabase()) return forwardCivic(request,context);
  try {
    const {app} = await getRuntime();
    return await app(request, clientIP(request, context.ip || 'unknown'));
  } catch (error) {
    // Never silently switch databases when a configured database fails.
    console.error('Configured database unavailable:',error?.name||'Error');
    return Response.json({error:'The configured backend is temporarily unavailable.',code:'BACKEND_UNAVAILABLE'},{status:503,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  }
};
