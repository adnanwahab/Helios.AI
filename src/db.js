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
  const pool = new pg.Pool({connectionString: connectionString(env), max: 2, idleTimeoutMillis: 10000, connectionTimeoutMillis: 7000, ssl});
  // All Helios tables live in a private schema, not Supabase's public REST
  // schema. The explicit transaction-local search_path works with the
  // transaction pooler. Refuse silently abandoning any old public data.
  let prepared;
  function prepare(){
    prepared??=(async()=>{
      const client=await pool.connect();
      try{
        await client.query('BEGIN');
        await client.query("SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('helios-private-schema-v1'))");
        const legacy=(await client.query("SELECT to_regclass('public.laws') AS laws,to_regclass('public.versions') AS versions,to_regclass('helios_civic.laws') AS current,to_regnamespace('helios_civic') AS private_schema")).rows[0];
        if(legacy.laws&&legacy.versions&&!legacy.current)throw Error('Existing public Helios tables require an explicit reviewed migration; refusing to create a second store.');
        // A pre-provisioned runtime role owns this schema without needing database-wide CREATE privileges.
        if(!legacy.private_schema)await client.query('CREATE SCHEMA helios_civic');
        await client.query('REVOKE ALL ON SCHEMA helios_civic FROM PUBLIC');
        const roles=(await client.query("SELECT rolname FROM pg_catalog.pg_roles WHERE rolname IN ('anon','authenticated')")).rows;
        for(const {rolname} of roles)await client.query('REVOKE ALL ON SCHEMA helios_civic FROM '+(rolname==='anon'?'anon':'authenticated'));
        await client.query('COMMIT');
      }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error}
      finally{client.release()}
    })().catch(error=>{prepared=undefined;throw error});
    return prepared;
  }
  async function transaction(fn){
    await prepare();
    const client=await pool.connect();
    try{
      await client.query('BEGIN');
      await client.query('SET LOCAL search_path TO helios_civic, pg_catalog');
      const out=await fn({query:async(text,params=[])=>normalize(await client.query(text,params))});
      await client.query('COMMIT');
      return out;
    }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error}
    finally{client.release()}
  }
  return {kind:'supabase-postgres',query:(text,params=[])=>transaction(q=>q.query(text,params)),transaction,close:()=>pool.end()};
}
