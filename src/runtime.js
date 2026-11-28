import {createDatabase} from './db.js';
import {openStore} from './store.js';
import {createEmail, emailConfig} from './email.js';
import {createApp} from './app.js';
import {createNotionService, notionConfig} from './notion.js';
import {createMorphLabService} from './morphlab.js';
import {createContentModerator} from './content-moderation.js';
import {createAccountService} from './account.js';
import {createDraftingService} from './drafting.js';
import {createGitHubProposalService} from './github-proposals.js';

// Wires store, email and the request router together. Netlify functions call
// getRuntime(); tests and the local dev server pass their own database.
export async function createRuntime(options = {}) {
  const {db, env = process.env, origins, adminToken, secure, notionFetch, moderationFetch, morphlabFetch, accountFetch, draftingFetch, githubFetch, morphlab: morphlabOverride, ...emailOptions} = options;
  const database = db ?? createDatabase(env);
  const store = await openStore(database);
  // Identify the actual adapter, not an assumed production database.
  const health = {
    storage: database.kind || 'unknown',
    runtime: env.FLY_APP_NAME ? 'fly-machine' : (env.NETLIFY || env.AWS_LAMBDA_FUNCTION_NAME ? 'netlify-functions' : 'node-server'),
  };
  const originList = origins ?? (env.PUBLIC_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const email = createEmail({store, origins: originList, config: emailConfig(env), adminToken: 'adminToken' in options ? adminToken : (env.HELIOS_ADMIN_TOKEN || null), ...emailOptions});
  const notion = createNotionService({store, config: notionConfig(env), fetch: notionFetch});
  const morphlab = morphlabOverride ?? createMorphLabService({env, fetchImpl: morphlabFetch ?? fetch});
  const drafting = createDraftingService({env, fetchImpl: draftingFetch ?? fetch});
  const github = createGitHubProposalService({env, fetchImpl: githubFetch ?? fetch});
  const app = createApp({
    store,
    email,
    notion,
    morphlab,
    drafting,
    github,
    account: createAccountService({fetchImpl: accountFetch ?? fetch}),
    moderator: createContentModerator({env,fetchImpl:moderationFetch ?? fetch}),
    health,
    origins: originList,
    adminToken: 'adminToken' in options ? adminToken : (env.HELIOS_ADMIN_TOKEN || null),
    researchWorkerToken: env.HELIOS_RESEARCH_WORKER_TOKEN || null,
    secure: secure ?? env.HELIOS_INSECURE_COOKIES !== '1',
  });
  return {app, store, email, notion, drafting, github, db: database};
}

// One runtime per warm function instance. A failed start is not cached, so the next request retries it.
let pending;
export function getRuntime() {
  pending ??= createRuntime().catch(error => { pending = undefined; throw error; });
  return pending;
}
