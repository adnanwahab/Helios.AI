// Reads one blog: finds its feed the first time, then reads the feed with
// conditional requests (ETag / Last-Modified) so unchanged feeds cost little.
import {BlogError, createGuardedFetch} from './fetch.js';
import {discoverFeeds, guessFeeds, parseFeed} from './feed.js';

const MAX_GUESSES = 4;

export function createBlogReader({get = createGuardedFetch()} = {}) {
  const validators = result => ({etag: result.etag || null, lastModified: result.lastModified || null});

  async function discover(pageUrl, deadline) {
    const page = await get(pageUrl, {deadline});
    const direct = parseFeed(page.body, page.url);
    if (direct) return {feed: direct, feedUrl: page.url, ...validators(page)};
    const advertised = discoverFeeds(page.body, page.url);
    const candidates = [...advertised, ...guessFeeds(page.url).slice(0, advertised.length ? 0 : MAX_GUESSES)];
    for (const candidate of candidates) {
      try {
        const result = await get(candidate, {deadline});
        const feed = parseFeed(result.body, result.url);
        if (feed) return {feed, feedUrl: result.url, ...validators(result)};
      } catch (error) {
        if (error.code === 'TIMEOUT') throw error;
      }
    }
    throw new BlogError('Helios could not find an RSS or Atom feed on that page. Paste the feed address instead.', 'NO_FEED');
  }

  // blog: {inputUrl, feedUrl, etag, lastModified}. Returns
  // {notModified: true} or {feed, feedUrl, etag, lastModified}.
  return async function read(blog, {deadline = Date.now() + 8000} = {}) {
    if (blog.feedUrl) {
      const result = await get(blog.feedUrl, {etag: blog.etag, lastModified: blog.lastModified, deadline});
      if (result.status === 304) return {notModified: true, feedUrl: blog.feedUrl, etag: blog.etag, lastModified: blog.lastModified};
      const feed = parseFeed(result.body, result.url);
      if (feed) return {feed, feedUrl: result.url, ...validators(result)};
      // The feed moved or broke. Look for it again from the blog's own page.
    }
    return discover(blog.inputUrl, deadline);
  };
}
