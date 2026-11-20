import {getRuntime} from '../../src/runtime.js';
import {clientIP} from '../../src/email.js';

// Paths routed here by Netlify; everything else is static and served by the CDN.
export const config = {path: ['/api/*', '/email/unsubscribe', '/proxy/ycr', '/proxy/ycr/*']};

export default async (request, context) => {
  const {app} = await getRuntime();
  return app(request, clientIP(request, context.ip || 'unknown'));
};
