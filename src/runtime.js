import {createDatabase} from './db.js';
import {openStore} from './store.js';
import {createEmail, emailConfig} from './email.js';
import {createApp} from './app.js';
import {createNotionService, notionConfig} from './notion.js';

// Wires store, email and the request router together. Netlify functions call
// getRuntime(); tests and the local dev server pass their own database.
export async function createRuntime(options = {}) {
  const {db, env = process.env, origins, adminToken, secure, notionFetch, ...emailOptions} = options;
  const database = db ?? createDatabase(env);
  const store = await openStore(database);
  const originList = origins ?? (env.PUBLIC_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const email = createEmail({store, origins: originList, config: emailConfig(env), ...emailOptions});
  const notion = createNotionService({store, config: notionConfig(env), fetch: notionFetch});
  const app = createApp({
    store,
    email,
    notion,
    origins: originList,
    adminToken: 'adminToken' in options ? adminToken : (env.HELIOS_ADMIN_TOKEN || null),
    secure: secure ?? env.HELIOS_INSECURE_COOKIES !== '1',
  });
  return {app, store, email, notion, db: database};
}

// One runtime per warm function instance. A failed start is not cached, so the next request retries it.
let pending;
export function getRuntime() {
  pending ??= createRuntime().catch(error => { pending = undefined; throw error; });
  return pending;
}
