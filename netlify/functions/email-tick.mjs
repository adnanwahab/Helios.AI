import {getRuntime} from '../../src/runtime.js';

// Sends due day-3 emails. Netlify runs this on the schedule below (UTC).
// The send loop stops starting new emails after budgetMs, so a run stays inside
// the function timeout. Whatever is left is picked up by the next run.
export const config = {schedule: '@hourly'};

export default async () => {
  const {email} = await getRuntime();
  const result = await email.tick({batch: 50, budgetMs: 7000});
  console.log('Email tick', JSON.stringify(result));
};
