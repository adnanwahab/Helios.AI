// One-time copy of the SQLite database (the Fly volume's helios.sqlite) into an EMPTY
// Supabase database. Rows keep their IDs and timestamps, so amendment base versions and
// signup tokens stay valid. Run with Bun (it reads SQLite with bun:sqlite):
//
//   bun scripts/migrate-sqlite.js /path/to/helios.sqlite
//
// Needs SUPABASE_DB_URL (or DATABASE_URL). Refuses to run if the target already has data.
// Copy the source file off the Fly volume first, and keep it until the migration is verified.
import {Database} from 'bun:sqlite';
import {createDatabase} from '../src/db.js';
import {SCHEMA} from '../src/store.js';

// Parents before children, so foreign keys hold inside the single transaction.
export const TABLES = ['metadata', 'sessions', 'laws', 'versions', 'amendments', 'receipts', 'limits', 'email_subscribers', 'email_inbound'];

export async function migrate({sqlitePath, db}) {
  const source = new Database(sqlitePath, {readonly: true});
  try {
    const data = {};
    for (const table of TABLES) {
      const exists = source.query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
      data[table] = exists ? source.query(`SELECT * FROM ${table}`).all() : [];
    }
    return await db.transaction(async tx => {
      for (const sql of SCHEMA) await tx.query(sql);
      const existing = (await tx.query('SELECT COUNT(*) AS n FROM metadata')).rows[0].n;
      if (Number(existing) > 0) throw new Error('The target database already has Helios data. Migrate into an empty database.');
      const counts = {};
      for (const table of TABLES) {
        counts[table] = data[table].length;
        for (const row of data[table]) {
          const columns = Object.keys(row);
          const placeholders = columns.map((_, i) => '$' + (i + 1)).join(',');
          await tx.query(`INSERT INTO ${table}(${columns.join(',')}) VALUES(${placeholders})`, columns.map(c => row[c]));
        }
      }
      for (const table of TABLES) {
        const copied = Number((await tx.query(`SELECT COUNT(*) AS n FROM ${table}`)).rows[0].n);
        if (copied !== counts[table]) throw new Error(`Row count mismatch in ${table}: copied ${copied} of ${counts[table]}.`);
      }
      return counts;
    });
  } finally {
    source.close();
  }
}

if (import.meta.main) {
  const sqlitePath = process.argv[2];
  if (!sqlitePath) throw Error('Usage: bun scripts/migrate-sqlite.js /path/to/helios.sqlite');
  const db = createDatabase();
  try {
    const counts = await migrate({sqlitePath, db});
    console.log('Migrated rows:', JSON.stringify(counts, null, 2));
  } finally {
    await db.close();
  }
}
