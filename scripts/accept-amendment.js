// Run only from a trusted maintainer shell (for example Fly SSH).
import {openStore} from '../src/store.js';
const [lawId,amendmentId]=process.argv.slice(2);
if(!lawId||!amendmentId)throw Error('Usage: bun scripts/accept-amendment.js HGA-002 AMD-<uuid>');
const store=openStore(process.env.DATABASE_PATH||'.data/helios.sqlite');
try{const result=store.accept(lawId,amendmentId);console.log(JSON.stringify({lawId:result.law.id,version:result.law.version,versionId:result.law.versionId,status:'editorial_revision_accepted_not_law'},null,2));}finally{store.close();}
