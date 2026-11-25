import {getRuntime} from '../../src/runtime.js';
import {clientIP} from '../../src/email.js';
import {configuredDatabase,forwardCivic} from '../../src/fly-civic-gateway.js';
import {hasResearchDatabase,serveResearch} from '../../src/research-preview.js';

export const config = {path: ['/api/*', '/email/unsubscribe', '/proxy/ycr', '/proxy/ycr/*']};

export default async (request, context) => {
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
