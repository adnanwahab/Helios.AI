import {createHash} from 'node:crypto';
import {SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, ACCOUNT_CONFIG} from '../public/account-config.js';

// The issuer is part of the actor namespace and cannot be chosen by a request.
const TRUSTED_PROJECT = 'https://ssopopwnuqygetznsmtg.supabase.co';
const USER_ENDPOINT = TRUSTED_PROJECT + '/auth/v1/user';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class AccountError extends Error {
  constructor(status, message) { super(message); this.name = 'AccountError'; this.status = status; }
}
const unavailable = () => new AccountError(503, 'Account verification is temporarily unavailable. Your account changes were not saved.');
const invalid = () => new AccountError(401, 'Your login expired or could not be verified. Log in again, or explicitly continue as a guest.');

// This service needs only public Auth configuration. It can report real login
// independently of whether a deployment has an account-capable data backend.
export function createAccountService({fetchImpl = fetch} = {}) {
  function config({storage = 'unavailable', runtime = 'unknown', scope = 'civic', votes = false, research = false} = {}) {
    return {
      available: true, provider: 'supabase', loginOptional: true,
      projectUrl: TRUSTED_PROJECT,
      emailSignInEnabled: ACCOUNT_CONFIG.emailSignInEnabled === true,
      passwordSignInEnabled: ACCOUNT_CONFIG.passwordSignInEnabled === true,
      accountPersistence: {votes: Boolean(votes), research: Boolean(research)},
      storage, runtime, scope, guestActivitySeparate: true,
    };
  }
  async function identify(request) {
    if (!request.headers.has('x-helios-access-token')) return {signedIn: false, actorId: null, account: null};
    const token = request.headers.get('x-helios-access-token');
    if (!token || token.length > 16384 || /\s/.test(token)) throw invalid();
    if (SUPABASE_URL !== TRUSTED_PROJECT || !SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_publishable_')) throw unavailable();
    let user;
    try {
      // Verify anew on every account request. No input cookies, maintainer
      // Authorization, worker secrets, or user-selected URLs are forwarded.
      const response = await fetchImpl(USER_ENDPOINT, {
        method: 'GET',
        headers: {apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: 'Bearer ' + token, Accept: 'application/json'},
        credentials: 'omit', redirect: 'error', cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      });
      if (response.status === 401 || response.status === 403) throw invalid();
      if (!response.ok) throw unavailable();
      const reader = response.body?.getReader(), chunks = []; let size = 0;
      if (reader) while (true) {
        const {done, value} = await reader.read(); if (done) break;
        size += value.length;
        if (size > 65536) { await reader.cancel(); throw unavailable(); }
        chunks.push(value);
      }
      user = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch (error) {
      if (error instanceof AccountError) throw error;
      throw unavailable();
    }
    if (!user || typeof user.id !== 'string' || !uuid.test(user.id)) throw unavailable();
    if (user.is_anonymous === true) throw invalid();
    const userId = user.id.toLowerCase();
    const actorId = 'account:' + createHash('sha256').update('helios-account-v1\0' + TRUSTED_PROJECT + '\0' + userId).digest('hex');
    return {signedIn: true, actorId, account: {id: userId, email: typeof user.email === 'string' ? user.email.slice(0, 320) : null}};
  }
  function me(identity, context = {}) {
    const capabilities = config(context);
    return {signedIn: identity.signedIn, account: identity.account, persistence: capabilities.accountPersistence, storage: capabilities.storage, runtime: capabilities.runtime, scope: capabilities.scope, guestActivitySeparate: true};
  }
  return {identify, config, me};
}
