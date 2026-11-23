// Production database: Supabase Postgres, reached with its connection string.
// Use the transaction pooler (port 6543) from serverless functions. Every
// function instance opens at most two connections.
import pg from 'pg';

// BIGINT (epoch milliseconds) comes back as a number, not a string.
pg.types.setTypeParser(20, value => Number(value));

const normalize = result => ({rows: result.rows, rowCount: result.rowCount ?? result.rows.length});

export function connectionString(env = process.env) {
  const value = (env.SUPABASE_DB_URL || env.DATABASE_URL || '').trim();
  if (!value) throw new Error('SUPABASE_DB_URL is not set. Paste the Supabase transaction-pooler connection string into the Netlify environment.');
  return value;
}

// SUPABASE_CA_CERT, when set, is the PEM root certificate from the Supabase
// dashboard. Without it, TLS uses Node's default trust store.
export function createDatabase(env = process.env) {
  const ssl = env.SUPABASE_CA_CERT ? {ca: env.SUPABASE_CA_CERT, rejectUnauthorized: true} : {rejectUnauthorized: true};
  const pool = new pg.Pool({connectionString: connectionString(env), max: 2, idleTimeoutMillis: 10000, ssl});
  return {
    kind: 'supabase-postgres',
    async query(text, params = []) {
      return normalize(await pool.query(text, params));
    },
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const out = await fn({query: async (text, params = []) => normalize(await client.query(text, params))});
        await client.query('COMMIT');
        return out;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}
