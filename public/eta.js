// Estimated date of arrival (ETA) for each shared goal.
//
// "Arrival" means a goal has finished human review (reviewer assigned, legal,
// evidence and cost review, approval for a public vote) and a one-week public
// advisory vote has closed. It is a planning estimate from each goal's own status
// fields and the assumptions in MODEL. It never reads or writes votes, notes,
// versions or amendments, and it is not a schedule, a commitment, a prediction of
// enactment, or official status. Deterministic for a given `asOf` date.
//
// Same model as Civic Synthesis (src/shared/bill-eta.ts), so HGA-n and its source
// HFL-n get the same date while both are unreviewed.
//
// Classic script (no build step): exposes globalThis.HeliosETA for public/goals.js
// and for `bun test`.
(function (root) {
  'use strict';
  const DAY = 86400000;
  const STAGE_KEYS = ['assignment', 'review', 'publication', 'ballot'];
  const MODEL = Object.freeze({
    id: 'helios-arrival-estimate/v1',
    // Days between successive review starts within one category: two a week, one a week, one a fortnight.
    cadenceDays: Object.freeze({earliest: 3.5, expected: 7, latest: 14}),
    stages: Object.freeze([
      {key: 'assignment', label: 'Reviewer assigned', days: {earliest: 3, expected: 7, latest: 14}},
      {key: 'review', label: 'Legal, evidence and cost review (in parallel)', days: {earliest: 14, expected: 21, latest: 42}},
      {key: 'publication', label: 'Approved for a public advisory vote', days: {earliest: 3, expected: 7, latest: 14}},
      {key: 'ballot', label: 'One-week advisory vote closes', days: {earliest: 7, expected: 7, latest: 7}},
    ].map(stage => Object.freeze(stage))),
  });
  const NOTE = 'Planning estimate for finishing human review and a one-week public advisory vote at the assumed pace. '
    + 'Not a schedule, a commitment, a prediction of enactment, or official status.';

  const isoDay = ms => new Date(ms).toISOString().slice(0, 10);
  const utcDay = date => Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());

  // Monday on or after `asOf` (UTC): the next weekly review cycle.
  function cycleStart(asOf) {
    const day = utcDay(asOf);
    return day + ((8 - new Date(day).getUTCDay()) % 7) * DAY;
  }

  // Stages still outstanding, from the goal's status fields. Unknown values fail closed.
  function remainingStages(goal) {
    const vote = goal && goal.publicVoteStatus, review = goal && goal.reviewStatus;
    if (vote === 'closed') return [];
    if (vote === 'open') return ['ballot'];
    if (review === 'approved' || review === 'reviewed') return ['publication', 'ballot'];
    return STAGE_KEYS.slice();
  }

  // Editorial goals (HGA-) queue first in ID order, then community proposals by creation time.
  function queueOrder(a, b) {
    const ea = /^HGA-/.test(a.id), eb = /^HGA-/.test(b.id);
    if (ea !== eb) return ea ? -1 : 1;
    const ka = ea ? a.id : String(a.createdAt || '') + a.id, kb = eb ? b.id : String(b.createdAt || '') + b.id;
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  }

  // Estimates for every goal, keyed by ID. Each week reviewers start the next goal
  // in every category; goals already past review do not queue.
  function estimateAll(goals, options) {
    const asOf = (options && options.asOf) || new Date(), model = (options && options.model) || MODEL;
    const start = cycleStart(asOf);
    const left = new Map(goals.map(goal => [goal.id, remainingStages(goal)]));
    const queued = goal => { const stages = left.get(goal.id); return stages.includes('assignment') || stages.includes('review'); };
    const queues = new Map();
    for (const goal of goals.slice().sort(queueOrder)) {
      if (!queued(goal)) continue;
      const queue = queues.get(goal.category) || [];
      queue.push(goal.id);
      queues.set(goal.category, queue);
    }
    const estimates = new Map();
    for (const goal of goals) {
      const stages = left.get(goal.id), queue = queues.get(goal.category) || [];
      const base = {goalId: goal.id, model: model.id, asOf: isoDay(utcDay(asOf)), cycleStart: isoDay(start), category: goal.category};
      if (!stages.length) {
        estimates.set(goal.id, Object.assign(base, {status: 'arrived', queuePosition: null, queueSize: queue.length, startsOn: null, stages: model.stages.map(s => ({key: s.key, label: s.label, done: true, expected: null})), earliest: null, expected: null, latest: null}));
        continue;
      }
      const position = queued(goal) ? queue.indexOf(goal.id) : null;
      const run = scenario => {
        const begin = start + Math.ceil((position || 0) * model.cadenceDays[scenario]) * DAY;
        let t = begin;
        const ends = model.stages.map(stage => stages.includes(stage.key) ? (t += stage.days[scenario] * DAY) : null);
        return {begin, end: t, ends};
      };
      const earliest = run('earliest'), expected = run('expected'), latest = run('latest');
      estimates.set(goal.id, Object.assign(base, {
        status: 'estimated', queuePosition: position, queueSize: queue.length, startsOn: isoDay(expected.begin),
        stages: model.stages.map((stage, i) => ({key: stage.key, label: stage.label, done: !stages.includes(stage.key), expected: expected.ends[i] == null ? null : isoDay(expected.ends[i])})),
        earliest: isoDay(earliest.end), expected: isoDay(expected.end), latest: isoDay(latest.end),
      }));
    }
    return estimates;
  }

  // First and last expected arrival across a set of estimates (ignores arrived goals).
  function span(estimates) {
    let first = null, last = null;
    for (const estimate of estimates) {
      if (!estimate.expected) continue;
      if (!first || estimate.expected < first) first = estimate.expected;
      if (!last || estimate.expected > last) last = estimate.expected;
    }
    return {first, last};
  }

  const dateFormat = new Intl.DateTimeFormat('en-US', {timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric'});
  // "2027-01-04" -> "Jan 4, 2027" (UTC, locale-stable).
  const format = isoDate => dateFormat.format(new Date(isoDate + 'T00:00:00Z'));
  const ordinal = n => { const tens = n % 100, ones = n % 10; return n + (tens >= 11 && tens <= 13 ? 'th' : ones === 1 ? 'st' : ones === 2 ? 'nd' : ones === 3 ? 'rd' : 'th'); };

  root.HeliosETA = Object.freeze({MODEL, NOTE, cycleStart, remainingStages, estimateAll, span, format, ordinal});
})(typeof window !== 'undefined' ? window : globalThis);
