import {draftInput} from './drafting.js';
import {githubProposalInput, ProposalIntegrationError} from './github-proposals.js';

export function createFeatureApi({store, health, github, drafting, Problem, response, hash}) {
  const writable = () => health.storage === 'supabase-postgres' || (health.storage === 'pglite' && health.runtime === 'node-server');
  const unavailable = () => { throw new Problem(503, 'This feature requires the configured shared database.'); };
  const accountRequired = identity => { if (!identity.signedIn || !identity.actorId) throw new Problem(401, 'Log in to save account settings or publish a proposal pull request.'); };
  const config = service => {
    const settings = service.config();
    return writable() ? settings : {...settings, enabled: false, reason: 'This feature requires the configured shared database.'};
  };
  const paths = new Set(['/api/account/preferences', '/api/github/pull-requests', '/api/drafting/revise']);
  return {
    githubConfig: () => config(github),
    draftingConfig: () => config(drafting),
    publicRead(request, path) {
      const service = path === '/api/github/config' ? github : path === '/api/drafting/config' ? drafting : null;
      if (!service) return null;
      return request.method === 'GET' ? response(config(service)) : response({error: 'Use GET'}, 405, {Allow: 'GET'});
    },
    async read(request, path, identity) {
      if (!paths.has(path)) return null;
      if (!['GET', 'POST'].includes(request.method)) return response({error: 'Method not allowed'}, 405);
      if (path !== '/api/account/preferences') {
        return request.method === 'POST' ? null : response({error: 'Use POST'}, 405, {Allow: 'POST'});
      }
      accountRequired(identity);
      if (!writable()) unavailable();
      return request.method === 'GET' ? response(await store.preferences.read(identity.actorId)) : null;
    },
    async write(path, body, session, identity, key, requestHash, remoteIP) {
      if (!paths.has(path)) return null;
      if (!writable()) unavailable();
      if (!key || !/^[a-zA-Z0-9-]{16,80}$/.test(key)) throw new Problem(400, 'A unique Idempotency-Key is required.');
      if (path === '/api/account/preferences') {
        accountRequired(identity);
        return response(await store.idempotent(session.id, key, requestHash, q => store.preferences.writeIn(q, body, identity.actorId)), 200);
      }
      if (path === '/api/github/pull-requests') {
        accountRequired(identity);
        if (!github.enabled) throw new Problem(503, github.config().reason);
        let input;
        try { input = githubProposalInput(body); }
        catch (error) { throw new Problem(400, error.message); }
        const prior = await store.receipt(session.id, key, requestHash);
        if (prior) return response(prior, 201);
        // Durable per-account and overall quotas bound use of the maintainer's
        // repository token even when a user creates fresh browser sessions.
        await store.limit('github-account:' + identity.actorId, 3, 3600000);
        await store.limit('github-ip:' + hash(remoteIP), 10, 3600000);
        await store.limit('github-global', 30, 3600000);
        try {
          return response(await store.idempotent(session.id, key, requestHash, () => github.create(input, identity.actorId, key)), 201);
        } catch (error) {
          if (error instanceof Problem) throw error;
          if (error instanceof ProposalIntegrationError) throw new Problem(error.status, error.message);
          throw new Problem(502, 'GitHub did not confirm the pull request. Retry the unchanged proposal with the same request ID.');
        }
      }
      if (!drafting.enabled) throw new Problem(503, drafting.config().reason);
      let input;
      try { input = draftInput(body); }
      catch (error) { throw new Problem(400, error.message); }
      const prior = await store.receipt(session.id, key, requestHash);
      if (prior) return response(prior);
      await store.limit('drafting-session:' + session.id, 6, 3600000);
      await store.limit('drafting-ip:' + hash(remoteIP), 20, 3600000);
      await store.limit('drafting-global', 120, 3600000);
      try {
        return response(await store.idempotent(session.id, key, requestHash, () => drafting.revise(input)));
      } catch (error) {
        if (error instanceof Problem) throw error;
        throw new Problem(502, 'The AI provider did not return a complete draft. Your original text is unchanged.');
      }
    },
  };
}
