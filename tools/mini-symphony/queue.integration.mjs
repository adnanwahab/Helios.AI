// Requires a disposable local PostgreSQL database; never use production.
// SYMPHONY_LOCAL_TEST=1 SYMPHONY_DATABASE_URL=postgresql://...@localhost/mini_symphony_test bun tools/mini-symphony/queue.integration.mjs
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {poolFromEnv,enqueue,claim,heartbeat,finish,status} from './queue.mjs';
const url=new URL(process.env.SYMPHONY_DATABASE_URL||'postgresql://invalid/invalid');
assert(process.env.SYMPHONY_LOCAL_TEST==='1'&&['localhost','127.0.0.1'].includes(url.hostname)&&url.pathname==='/mini_symphony_test','Refusing non-disposable DB');
const pool=poolFromEnv();
let created=false;
try{
 const existing=(await pool.query("select to_regnamespace('mini_symphony') as schema")).rows[0].schema;
 assert.equal(existing,null,'Test database must not already have a Symphony schema');
 await pool.query(await readFile(new URL('./schema.sql',import.meta.url),'utf8'));created=true;
 await pool.query('update mini_symphony.settings set max_agents=1');
 assert.equal(await enqueue(pool,'job-a','First mission'),true);
 assert.equal(await enqueue(pool,'job-a','Duplicate'),false);
 assert.equal(await enqueue(pool,'job-b','Second mission'),true);
 const claims=(await Promise.all([claim(pool,'a'),claim(pool,'b'),claim(pool,'c')])).filter(Boolean);
 assert.equal(claims.length,1);
 const a=claims[0];assert.equal(a.id,'job-a');
 assert.equal(await heartbeat(pool,{...a,lease_token:'00000000-0000-0000-0000-000000000000'}),false);
 assert.equal(await heartbeat(pool,a),true);
 assert.equal(await finish(pool,a,'needs_review',{brief:'fixture'}),true);
 assert.equal(await finish(pool,a,'needs_review',{brief:'stale'}),false);
 const b=await claim(pool,'b',1);assert.equal(b.id,'job-b');
 await pool.query("update mini_symphony.jobs set lease_until=now()-interval '1 second' where id=$1",[b.id]);
 assert.equal(await claim(pool,'c'),null);
 assert.equal(await heartbeat(pool,b),false);
 const rows=await status(pool),expired=rows.find(x=>x.id==='job-b');
 assert.equal(expired.state,'needs_review');assert.equal(expired.result.reason,'lease_expired');
 assert.equal(rows.find(x=>x.id==='job-a').result.brief,'fixture');
 console.log('PASS: exclusive claims, one-worker capacity, idempotency, stale fencing, review and expiry');
}finally{if(created)await pool.query('drop schema mini_symphony cascade');await pool.end();}
