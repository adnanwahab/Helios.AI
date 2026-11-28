// Public capability discovery contains no credentials, account data, or counts
// that could be mistaken for real participation. A configured service is not
// evidence that a worker is running or that an external provider is healthy.
import {FEATURE_ROUTES} from '../public/feature-routes.js';
const browserFeatures = FEATURE_ROUTES.filter(feature => feature.kind === 'browser').map(feature => feature.id);
const routes = Object.fromEntries(FEATURE_ROUTES.map(feature => [feature.id, feature.route]));

export function featureStatus({health = {}, mode = 'direct', writable, github = {}, drafting = {}, email = {}, research = {}} = {}) {
  const storage = health.storage || 'unconfigured';
  const runtime = health.runtime || 'unknown';
  const canWrite = writable ?? (storage === 'supabase-postgres' || (storage === 'pglite' && runtime === 'node-server'));
  const local = canWrite && storage === 'pglite';
  const reason = canWrite
    ? local ? 'Saves to this development server’s local database.' : 'Saves to the connected shared database.'
    : mode === 'practice' ? 'This preview has no isolated writable database. Local practice remains available.' : 'A writable database connection is required.';
  const features = browserFeatures.map(id => ({
    id, route: routes[id], available: true, state: 'browser',
    reason: id === 'journal' ? 'Private entries stay in this browser. No journal upload endpoint.'
      : id === 'simulations' ? 'Synthetic scenarios run on your device; they are separate from real votes.'
      : id === 'law-catalog' ? 'The original editorial catalog is bundled with the site.'
      : 'Runs in your browser. No shared database is required.',
  }));
  const add = (id, available, detail, state) => features.push({id, route: routes[id], available: Boolean(available), state: state || (available ? local ? 'local' : 'ready' : 'setup'), reason: detail});
  add('votes', canWrite, reason + ' Advisory positions are tied to a specific law revision.');
  add('proposals', canWrite, reason + ' Proposed changes require human review.');
  add('account', canWrite, canWrite ? reason + ' Sign in to an existing account to save preferences across devices.' : reason);
  add('pull-requests', canWrite && github.enabled, github.reason || (github.enabled ? 'Creates a draft proposal PR after sign-in, review, and explicit public consent.' : 'Automatic PR creation needs a server credential and explicit enablement.'));
  add('drafting', canWrite && drafting.enabled, drafting.reason || (drafting.enabled ? 'The configured model receives only the draft you explicitly submit.' : 'AI drafting needs a server API key and explicit enablement. Local templates remain available.'));
  add('email', canWrite && email.deliveryEnabled, email.reason || (email.deliveryEnabled ? 'Opt in to one follow-up email; every delivered email includes an unsubscribe link.' : 'Email delivery is not configured. No delivery date is confirmed.'));
  const researchWritable = research.writable ?? canWrite;
  const workerConfigured = research.workerConfigured === true;
  const active = Number.isSafeInteger(research.activeWorkerLeases) && research.activeWorkerLeases > 0;
  add('agents', researchWritable && workerConfigured,
    !researchWritable ? 'Shared research requires a writable database.'
      : !workerConfigured ? 'Research plans can be saved, but a separately configured worker is required to execute them.'
      : active ? 'The queue has active worker leases. Generated results still require human review.'
      : 'Worker authentication is configured; no active worker lease has been observed.',
    active && researchWritable && workerConfigured ? 'running' : researchWritable && workerConfigured ? 'configured' : 'setup');
  add('research', researchWritable, researchWritable ? 'Create a shared room, save its brief, and review recorded task results.' : 'Shared rooms require a writable database. Browser drafts and export remain available.');
  add('keyframes', researchWritable, researchWritable ? 'Shared frames retain revision history and reject conflicting edits.' : 'Shared keyframes require a writable database. Browser drafts and export remain available.');
  return {mode, storage, runtime, features};
}
