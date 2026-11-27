import pg from 'pg';
import { randomUUID } from 'node:crypto';

export function poolFromEnv() {
  const value=process.env.SYMPHONY_DATABASE_URL;
  if(!value) throw Error('SYMPHONY_DATABASE_URL required; no citizen database fallback');
  const url=new URL(value);
  if(!['postgres:','postgresql:'].includes(url.protocol)) throw Error('Expected Postgres URL');
  const local=process.env.SYMPHONY_LOCAL_TEST==='1' && ['localhost','127.0.0.1'].includes(url.hostname);
  for(const key of ['sslmode','sslcert','sslkey','sslrootcert'])url.searchParams.delete(key);
  return new pg.Pool({connectionString:url.toString(),max:6,connectionTimeoutMillis:5000,
    statement_timeout:10000,ssl:local?false:{rejectUnauthorized:true,
    ...(process.env.SYMPHONY_DB_CA?{ca:process.env.SYMPHONY_DB_CA}:{})}});
}
export async function enqueue(pool,id,prompt){
  return (await pool.query('insert into mini_symphony.jobs(id,prompt) values($1,$2) on conflict do nothing returning id',[id,prompt])).rowCount===1;
}
export async function claim(pool,worker,ttl=90){
  if(!worker||!Number.isInteger(ttl)||ttl<1||ttl>300)throw Error('Invalid lease');
  const c=await pool.connect();
  try{
    await c.query('begin');
    const limit=(await c.query('select max_agents from mini_symphony.settings where singleton for update')).rows[0]?.max_agents;
    if(!limit)throw Error('Missing queue settings');
    // Expired agents may still be alive. Quarantine; do not automatically retry.
    await c.query("update mini_symphony.jobs set state='needs_review',result=jsonb_build_object('reason','lease_expired','worker',worker_id),worker_id=null,lease_token=null,lease_until=null,updated_at=now() where state='running' and lease_until<=now()");
    const count=Number((await c.query("select count(*) from mini_symphony.jobs where state='running'")).rows[0].count);
    let job=null;
    if(count<limit){
      const r=await c.query("with next as (select id from mini_symphony.jobs where state='queued' order by created_at,id for update skip locked limit 1) update mini_symphony.jobs j set state='running',attempt=attempt+1,worker_id=$1,lease_token=$2,lease_until=now()+$3*interval '1 second',updated_at=now() from next where j.id=next.id returning j.*",[worker,randomUUID(),ttl]);
      job=r.rows[0]??null;
    }
    await c.query('commit');return job;
  }catch(e){await c.query('rollback').catch(()=>{});throw e;}finally{c.release();}
}
export async function heartbeat(pool,job,ttl=90){
  if(!Number.isInteger(ttl)||ttl<1||ttl>300)throw Error('Invalid lease');
  return (await pool.query("update mini_symphony.jobs set lease_until=now()+$3*interval '1 second',updated_at=now() where id=$1 and lease_token=$2 and state='running' and lease_until>now()",[job.id,job.lease_token,ttl])).rowCount===1;
}
export async function finish(pool,job,state,result){
  if(!['needs_review','draft_created','failed'].includes(state))throw Error('Invalid state');
  return (await pool.query("update mini_symphony.jobs set state=$3,result=$4::jsonb,worker_id=null,lease_token=null,lease_until=null,updated_at=now() where id=$1 and lease_token=$2 and state='running' and lease_until>now()",[job.id,job.lease_token,state,JSON.stringify(result)])).rowCount===1;
}
export async function status(pool){
  return (await pool.query('select id,state,attempt,worker_id,lease_until,updated_at,result from mini_symphony.jobs order by created_at desc limit 100')).rows;
}
