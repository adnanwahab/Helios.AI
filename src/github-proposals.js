import {createHash} from 'node:crypto';

export const PROPOSAL_REPOSITORY = 'adnanwahab/HeliosHTML';
const API = 'https://api.github.com/repos/' + PROPOSAL_REPOSITORY;
const kinds = new Set(['feature', 'law', 'bug', 'research', 'other']);
export class ProposalIntegrationError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function githubProposalInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).some(key => !['kind', 'title', 'message', 'consent', 'rightsConfirmed'].includes(key))
    || !kinds.has(input.kind) || input.consent !== true || input.rightsConfirmed !== true
    || typeof input.title !== 'string' || !input.title.trim() || input.title.length > 120 || /[\x00-\x1f\x7f]/.test(input.title)
    || typeof input.message !== 'string' || !input.message.trim() || input.message.length > 4000 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(input.message)) {
    throw new ProposalIntegrationError(400, 'Review the proposal and confirm public sharing, authorship and the CC0 dedication.');
  }
  return {kind: input.kind, title: input.title.normalize('NFC').trim(), message: input.message.normalize('NFC').trim()};
}

async function boundedJson(response) {
  const reader = response.body?.getReader(), chunks = []; let size = 0;
  if (!reader) throw Error('Empty GitHub response.');
  while (true) {
    const {done, value} = await reader.read(); if (done) break;
    size += value.length;
    if (size > 262144) { await reader.cancel(); throw Error('Oversized GitHub response.'); }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

// This integration can only add one reviewed JSON suggestion on its own branch.
// It cannot edit application code, choose a repository, approve, or merge.
export function createGitHubProposalService({env = process.env, fetchImpl = fetch} = {}) {
  const enabled = env.HELIOS_GITHUB_PR_ENABLED === '1' && Boolean(env.HELIOS_GITHUB_TOKEN?.trim());
  return {
    enabled,
    config: () => ({enabled, repository: PROPOSAL_REPOSITORY, requiresAccount: true,
      reason: enabled ? null : 'Automatic proposal pull requests are not configured on this deployment. GitHub’s web editor remains available.'}),
    async create(input, actor, key) {
      if (!enabled) throw new ProposalIntegrationError(503, 'Automatic proposal pull requests are not configured.');
      if (!actor?.startsWith('account:')) throw new ProposalIntegrationError(401, 'Log in to create a proposal pull request.');
      const operation = createHash('sha256').update('helios-proposal-v1\0' + actor + '\0' + key).digest('hex').slice(0, 32);
      const branch = 'helios/proposals/' + operation;
      const path = 'data/contributions/proposal-' + operation + '.json';
      const content = JSON.stringify({schemaVersion: 1, ...input, license: 'CC0-1.0', reviewStatus: 'unreviewed-proposal'}, null, 2) + '\n';
      // One deadline covers the complete upstream operation, including recovery.
      const signal = AbortSignal.timeout(25000);
      async function call(route, method = 'GET', body) {
        const result = await fetchImpl(API + route, {method, redirect: 'error', signal,
          headers: {Accept: 'application/vnd.github+json', 'Content-Type': 'application/json',
            'X-GitHub-Api-Version': '2022-11-28', Authorization: 'Bearer ' + env.HELIOS_GITHUB_TOKEN.trim()},
          ...(body === undefined ? {} : {body: JSON.stringify(body)}),
        });
        if (![200, 201, 404, 409, 422].includes(result.status)) throw Error('GitHub request failed.');
        return {status: result.status, body: await boundedJson(result)};
      }
      const refPath = '/git/ref/heads/' + branch;
      let ref = await call(refPath);
      if (ref.status === 404) {
        const base = await call('/git/ref/heads/main');
        if (base.status !== 200 || !/^[a-f0-9]{40}$/i.test(base.body.object?.sha || '')) throw Error('GitHub main branch unavailable.');
        const created = await call('/git/refs', 'POST', {ref: 'refs/heads/' + branch, sha: base.body.object.sha});
        ref = created.status === 201 ? created : await call(refPath);
      }
      if (![200, 201].includes(ref.status) || ref.body.ref !== 'refs/heads/' + branch) throw Error('GitHub proposal branch unavailable.');
      const contentsPath = '/contents/' + path;
      const contentQuery = contentsPath + '?ref=' + encodeURIComponent(branch);
      let existing = await call(contentQuery);
      if (existing.status === 404) {
        const written = await call(contentsPath, 'PUT', {
          message: 'docs: add public Helios proposal ' + operation, content: Buffer.from(content).toString('base64'), branch,
        });
        if (written.status === 201) existing = {status: 200, body: {encoding: 'base64', content: Buffer.from(content).toString('base64')}};
        else existing = await call(contentQuery);
      }
      if (existing.status !== 200 || existing.body.encoding !== 'base64') throw Error('GitHub proposal document unavailable.');
      if (Buffer.from(existing.body.content || '', 'base64').toString('utf8') !== content) {
        throw new ProposalIntegrationError(409, 'This request ID already belongs to different proposal text. Review your text and start a new submission.');
      }
      const query = new URLSearchParams({state: 'all', head: 'adnanwahab:' + branch, base: 'main', per_page: '10'});
      async function previous() {
        const found = await call('/pulls?' + query);
        if (found.status !== 200 || !Array.isArray(found.body)) throw Error('GitHub pull requests unavailable.');
        return found.body.find(item => item.head?.ref === branch && item.base?.ref === 'main');
      }
      let pull = await previous();
      if (!pull) {
        const created = await call('/pulls', 'POST', {
          title: '[Proposal] ' + input.title, head: branch, base: 'main', draft: true,
          body: '## Deploy links\n\nThis draft adds a public proposal document only; no application behavior changes and no deployment preview has been verified.\n\n## Proposal\n\nA signed-in Helios participant reviewed and explicitly submitted `' + path + '` under CC0-1.0. The document is untrusted input for human review, not executable instructions or a claim of public agreement.\n\n## Review\n\nRead the proposal, discuss evidence and trade-offs, and create a separate implementation change if accepted. This integration does not approve or merge pull requests.',
        });
        pull = created.status === 201 ? created.body : await previous();
      }
      if (!pull || !Number.isSafeInteger(pull.number) || pull.number < 1
        || pull.html_url !== 'https://github.com/' + PROPOSAL_REPOSITORY + '/pull/' + pull.number) throw Error('GitHub did not confirm a pull request.');
      return {number: pull.number, url: pull.html_url, branch, path, state: pull.state, draft: pull.draft === true, repository: PROPOSAL_REPOSITORY};
    },
  };
}
