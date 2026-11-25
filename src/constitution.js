import {createHash,randomUUID} from 'node:crypto';
import {normalizeClause, sampleBoard, syntheticRows} from '../public/constitution-model.js';

export const CONSTITUTION_SCHEMA=[
 'CREATE TABLE IF NOT EXISTS constitution_clauses(id TEXT PRIMARY KEY, text TEXT NOT NULL, author TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN (\'pending\',\'approved\',\'rejected\')), created_at TEXT NOT NULL)',
 'CREATE TABLE IF NOT EXISTS constitution_contributions(clause_id TEXT NOT NULL, actor TEXT NOT NULL, PRIMARY KEY(clause_id,actor))',
 'CREATE TABLE IF NOT EXISTS constitution_votes(clause_id TEXT NOT NULL, actor TEXT NOT NULL, position TEXT NOT NULL CHECK(position IN (\'support\',\'oppose\',\'unsure\')), PRIMARY KEY(clause_id,actor))',
 'CREATE TABLE IF NOT EXISTS constitution_comments(id TEXT PRIMARY KEY, clause_id TEXT NOT NULL, author TEXT NOT NULL, text TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN (\'pending\',\'approved\',\'rejected\')), created_at TEXT NOT NULL)',
 'CREATE INDEX IF NOT EXISTS constitution_comment_lookup ON constitution_comments(clause_id,status,created_at)',
 'CREATE TABLE IF NOT EXISTS constitution_auto_moderation(kind TEXT NOT NULL, record_id TEXT NOT NULL, decision TEXT NOT NULL, reason TEXT NOT NULL, model TEXT, request_id TEXT, created_at TEXT NOT NULL, PRIMARY KEY(kind,record_id))'
];
const byId=new Map(syntheticRows.map(r=>[r.id,r]));
const byText=new Map(syntheticRows.map(r=>[normalizeClause(r.text),r]));
const asNumber=n=>Number(n||0);
const blank=()=>({support:0,oppose:0,unsure:0,contributors:0,commentCount:0});
export function constitutionStore(db,Problem){
 const fail=(s,m)=>{throw new Problem(s,m)};
 const validateText=(x,max)=>{if(typeof x!=='string'||!x.trim()||x.length>max||/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(x))fail(400,'Provide plain text, at most '+max+' characters.');return x.normalize('NFC').trim()};
 const shape=(input,keys)=>{if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!keys.includes(k)))fail(400,'Invalid constitution request fields.')};
 async function visible(q,id){
   if(typeof id!=='string'||! /^(S-\d{3}|C-[a-f0-9]{64})$/.test(id))fail(404,'Clause not found.');
   if(byId.has(id))return true;
   if(!(await q.query("SELECT id FROM constitution_clauses WHERE id=$1 AND status='approved'",[id])).rows[0])fail(404,'Clause not found.');
   return true;
 }
 async function board(actor=null,focus=null){
   const result=sampleBoard();
   const [clauses,votes,contributions,commentCounts,comments,ownVotes,pending]=await Promise.all([
     db.query("SELECT id,text,status FROM constitution_clauses WHERE status='approved' ORDER BY CASE WHEN id=$1 THEN 0 ELSE 1 END,created_at,id LIMIT 200",[focus||'']),
     db.query('SELECT clause_id,position,COUNT(*) AS n FROM constitution_votes GROUP BY clause_id,position'),
     db.query('SELECT clause_id,COUNT(*) AS n FROM constitution_contributions GROUP BY clause_id'),
     db.query("SELECT clause_id,COUNT(*) AS n FROM constitution_comments WHERE status='approved' GROUP BY clause_id"),
     db.query("SELECT id,clause_id,text,status,created_at FROM (SELECT id,clause_id,text,status,created_at,ROW_NUMBER() OVER(PARTITION BY clause_id ORDER BY created_at DESC,id) AS rn FROM constitution_comments WHERE status='approved' OR (author=$1 AND status='pending')) c WHERE rn<=8 ORDER BY created_at DESC,id",[actor||'']),
     db.query('SELECT clause_id,position FROM constitution_votes WHERE actor=$1',[actor||'']),
     db.query("SELECT c.id,c.text,c.status FROM constitution_clauses c JOIN constitution_contributions k ON k.clause_id=c.id WHERE k.actor=$1 AND c.status='pending' ORDER BY c.created_at DESC LIMIT 30",[actor||''])
   ]);
   for(const row of clauses.rows)result.clauses.push({id:row.id,topic:'Community contribution',text:row.text,source:'community',status:row.status,synthetic:{mentions:0,support:0,oppose:0,unsure:0},live:blank(),myVote:null,comments:[]});
   const map=new Map(result.clauses.map(c=>[c.id,c]));
   for(const row of votes.rows)if(map.has(row.clause_id))map.get(row.clause_id).live[row.position]=asNumber(row.n);
   for(const row of contributions.rows)if(map.has(row.clause_id))map.get(row.clause_id).live.contributors=asNumber(row.n);
   for(const row of commentCounts.rows)if(map.has(row.clause_id))map.get(row.clause_id).live.commentCount=asNumber(row.n);
   for(const row of comments.rows)if(map.has(row.clause_id))map.get(row.clause_id).comments.push({id:row.id,text:row.text,status:row.status,createdAt:row.created_at});
   for(const row of ownVotes.rows)if(map.has(row.clause_id))map.get(row.clause_id).myVote=row.position;
   result.pending=pending.rows;return result;
 }
 async function vote(q,input,actor){
   shape(input,['clauseId','position']);await visible(q,input.clauseId);
   if(!['support','oppose','unsure',null].includes(input.position))fail(400,'Choose support, oppose, unsure, or clear.');
   if(input.position===null)await q.query('DELETE FROM constitution_votes WHERE clause_id=$1 AND actor=$2',[input.clauseId,actor]);
   else await q.query('INSERT INTO constitution_votes(clause_id,actor,position) VALUES($1,$2,$3) ON CONFLICT(clause_id,actor) DO UPDATE SET position=EXCLUDED.position',[input.clauseId,actor,input.position]);
   return {clauseId:input.clauseId,position:input.position};
 }
 async function contribute(q,input,actor){
   shape(input,['text','consent','autoModerationConsent']);if(input.consent!==true)fail(400,'Explicit public contribution consent required.');
   const text=validateText(input.text,280),key=normalizeClause(text),seed=byText.get(key);
   const id=seed?.id||'C-'+createHash('sha256').update(key).digest('hex');
   let status='approved', deduplicated=!!seed;
   if(!seed){
     const inserted=await q.query("INSERT INTO constitution_clauses(id,text,author,status,created_at) VALUES($1,$2,$3,'pending',$4) ON CONFLICT(id) DO NOTHING RETURNING id",[id,text,actor,new Date().toISOString()]);
     deduplicated=inserted.rows.length===0;
     status=(await q.query('SELECT status FROM constitution_clauses WHERE id=$1',[id])).rows[0].status;
     if(status==='rejected')fail(409,'This clause was not approved for publication.');
   }
   await q.query('INSERT INTO constitution_contributions(clause_id,actor) VALUES($1,$2) ON CONFLICT DO NOTHING',[id,actor]);
   return {clauseId:id,status,deduplicated};
 }
 async function comment(q,input,actor){
   shape(input,['clauseId','text','consent','autoModerationConsent']);if(input.consent!==true)fail(400,'Explicit public comment consent required.');await visible(q,input.clauseId);
   const text=validateText(input.text,500),id=randomUUID();
   await q.query("INSERT INTO constitution_comments(id,clause_id,author,text,status,created_at) VALUES($1,$2,$3,$4,'pending',$5)",[id,input.clauseId,actor,text,new Date().toISOString()]);
   return {id,clauseId:input.clauseId,status:'pending'};
 }
 async function moderationQueue(){
   const [c,m]=await Promise.all([db.query("SELECT id,text,created_at FROM constitution_clauses WHERE status='pending' ORDER BY created_at,id LIMIT 100"),db.query("SELECT id,clause_id,text,created_at FROM constitution_comments WHERE status='pending' ORDER BY created_at,id LIMIT 100")]);
   return {clauses:c.rows,comments:m.rows};
 }
 async function moderate(q,input){
   shape(input,['kind','id','decision']);
   if(!['clause','comment'].includes(input.kind)||!['approved','rejected'].includes(input.decision)||typeof input.id!=='string'||input.id.length>80)fail(400,'Invalid moderation decision.');
   const table=input.kind==='clause'?'constitution_clauses':'constitution_comments';
   const row=(await q.query("UPDATE "+table+" SET status=$1 WHERE id=$2 AND status='pending' RETURNING id,status",[input.decision,input.id])).rows[0];
   if(!row)fail(404,'Pending record not found.');return row;
 }
 // Re-read stored text before screening. Never send journals or session identifiers.
 async function autoModerate(kind,id,text,classify){
   const table=kind==='clause'?'constitution_clauses':kind==='comment'?'constitution_comments':null;
   if(!table)return {status:'pending'};
   const row=(await db.query('SELECT text,status FROM '+table+' WHERE id=$1',[id])).rows[0];
   if(!row||row.status!=='pending'||row.text!==text)return {status:row?.status||'pending'};
   const prior=(await db.query('SELECT reason FROM constitution_auto_moderation WHERE kind=$1 AND record_id=$2',[kind,id])).rows[0];
   if(prior)return {status:'pending',reason:prior.reason};
   const verdict=await classify(row.text);
   return db.transaction(async q=>{
     // Manual decisions always win; store a bounded audit record without the text.
     const current=(await q.query('SELECT text,status FROM '+table+' WHERE id=$1 FOR UPDATE',[id])).rows[0];
     if(!current||current.status!=='pending'||current.text!==text)return {status:current?.status||'pending'};
     const attempt=(await q.query('INSERT INTO constitution_auto_moderation(kind,record_id,decision,reason,model,request_id,created_at) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(kind,record_id) DO NOTHING RETURNING record_id',[kind,id,verdict.decision,verdict.reason,verdict.model||null,verdict.requestId||null,new Date().toISOString()])).rows[0];
     if(!attempt||verdict.decision!=='approve')return {status:'pending',reason:verdict.reason};
     await q.query("UPDATE "+table+" SET status='approved' WHERE id=$1 AND status='pending'",[id]);
     return {status:'approved',reason:'unflagged'};
   });
 }
 return {board,vote,contribute,comment,moderationQueue,moderate,autoModerate};
}
