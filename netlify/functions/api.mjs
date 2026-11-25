import {getRuntime} from '../../src/runtime.js';
import {clientIP} from '../../src/email.js';
import {configuredDatabase,forwardCivic} from '../../src/fly-civic-gateway.js';

export const config = {path: ['/api/*', '/email/unsubscribe', '/proxy/ycr', '/proxy/ycr/*']};

// Dependencies can be isolated in tests without a real database or network.
export function createApiHandler({loadRuntime=getRuntime,hasDatabase=configuredDatabase,forward=forwardCivic,log=console.error}={}) {
  return async (request, context={}) => {
    try {
      // Preview code must not mutate or read the production contribution inbox.
      // Production may use the existing configured database or the allowlisted Fly gateway.
      const path=new URL(request.url).pathname;
      if((path==='/api/contributions'||path.startsWith('/api/contributions/'))&&(context?.deploy?.context||process.env.CONTEXT)!=='production')return Response.json({error:'The contribution inbox is available on the deployed production app, not this preview. Use the GitHub option.',code:'PREVIEW_INBOX_DISABLED'},{status:403,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
      if (!hasDatabase()) return await forward(request,context);
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
