// Run only from a trusted maintainer shell (SUPABASE_DB_URL must be set):
//   node scripts/accept-amendment.js HGA-002 AMD-<uuid>
import {createDatabase} from '../src/db.js';
import {openStore} from '../src/store.js';

const [lawId, amendmentId] = process.argv.slice(2);
if (!lawId || !amendmentId) throw Error('Usage: node scripts/accept-amendment.js HGA-002 AMD-<uuid>');
const db = createDatabase();
try {
  const store = await openStore(db);
  const result = await store.accept(lawId, amendmentId);
  console.log(JSON.stringify({lawId: result.law.id, version: result.law.version, versionId: result.law.versionId, status: 'editorial_revision_accepted_not_law'}, null, 2));
} finally {
  await db.close();
}
