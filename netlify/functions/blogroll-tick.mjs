import {getRuntime} from '../../src/runtime.js';
import {configuredDatabase} from '../../src/fly-civic-gateway.js';

// Reads the blogs that are due, every 15 minutes (UTC). A voting blog is read
// every 15 minutes while it posts and every 3 hours when quiet; a blog with
// no Helios line yet every 6 hours. One run reads up to 120 blogs.
export const config = {schedule: '*/15 * * * *'};

export default async () => {
  if (!configuredDatabase()) {
    // Without the shared database there is no blogroll to read.
    console.log('Blogroll tick skipped: Netlify database not configured.');
    return Response.json({skipped: true, reason: 'database-not-configured'});
  }
  const {store} = await getRuntime();
  // Scheduled functions stop after 30 seconds; leave room to save the last read.
  const result = await store.blogroll.poll({max: 120, budgetMs: 20000, concurrency: 8});
  console.log('Blogroll tick', JSON.stringify(result));
  return Response.json(result);
};
