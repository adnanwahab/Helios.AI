// Compatibility for older bookmarks. All drafting now passes through the same
// database-backed session, CSRF, quota, consent, and preview-isolation checks.
import {createApiHandler} from './api.mjs';
export {draftInput as validateRequest, draftResult as sanitizeResult} from '../../src/drafting.js';

export function createHandler({handleApi = createApiHandler()} = {}) {
  return async (request, context = {}) => {
    if (!['GET', 'POST'].includes(request.method)) return Response.json({error: 'Use GET or POST'}, {status: 405, headers: {'Cache-Control': 'no-store', Allow: 'GET, POST'}});
    const url = new URL(request.url);
    url.pathname = request.method === 'GET' ? '/api/drafting/config' : '/api/drafting/revise';
    url.search = '';
    const init = {method: request.method, headers: request.headers, signal: request.signal};
    if (request.method === 'POST') {init.body = request.body; init.duplex = 'half';}
    return handleApi(new Request(url, init), context);
  };
}

export default createHandler();
