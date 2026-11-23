// In-process Postgres (PGlite) with the same adapter shape as src/db.js.
// Used by the tests and by scripts/dev-server.js when no Supabase URL is set.
import {PGlite} from '@electric-sql/pglite';
import {mkdir} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';

// Fly mounts durable storage at /data. Keep the local development default elsewhere.
export function pgliteDataDir(env = process.env) {
  const configured = env.HELIOS_PGLITE_DIR;
  if (env.FLY_APP_NAME && (!configured || configured === '.data/pglite')) return '/data/pglite';
  return configured || '.data/pglite';
}

export async function createPGliteDatabase(dataDir) {
  // PGlite creates its own directory, but not missing parent directories.
  if (dataDir && !/^[a-z]+:\/\//i.test(dataDir)) {
    await mkdir(dirname(resolve(dataDir)), {recursive: true});
  }
  const pg = new PGlite(dataDir, {parsers: {20: Number}});
  await pg.waitReady;
  const normalize = result => ({rows: result.rows, rowCount: result.affectedRows ?? result.rows.length});
  return {
    async query(text, params = []) {
      return normalize(await pg.query(text, params));
    },
    async transaction(fn) {
      return pg.transaction(tx => fn({query: async (text, params = []) => normalize(await tx.query(text, params))}));
    },
    close: () => pg.close(),
  };
}
