// In-process Postgres (PGlite) with the same adapter shape as src/db.js.
// Used by the tests and by scripts/dev-server.js when no Supabase URL is set.
import {PGlite} from '@electric-sql/pglite';

export async function createPGliteDatabase(dataDir) {
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
