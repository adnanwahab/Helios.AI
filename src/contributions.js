import {randomUUID} from 'node:crypto';
export const CONTRIBUTION_SCHEMA=[
 "CREATE TABLE IF NOT EXISTS contribution_inbox(id TEXT PRIMARY KEY, actor TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('feature','law','bug','research','other')), title TEXT NOT NULL, message TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('queued','researching','implementing','review','closed')), pr_number INTEGER, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
 'CREATE INDEX IF NOT EXISTS contribution_inbox_actor ON contribution_inbox(actor,created_at)',
 'CREATE INDEX IF NOT EXISTS contribution_inbox_status ON contribution_inbox(status,created_at)'
];
const kinds=new Set(['feature','law','bug','research','other']);
const transitions={queued:['researching','closed'],researching:['implementing','queued','closed'],implementing:['review','queued','closed'],review:['implementing','closed'],closed:[]};
const summary=row=>({id:row.id,kind:row.kind,title:row.title,status:row.status,prNumber:row.pr_number,createdAt:row.created_at,updatedAt:row.updated_at});
export function contributionStore(db,Problem){
 const fail=(status,message)=>{throw new Problem(status,message)};
 return {
  async createIn(q,input,actor){
   if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['kind','title','message','consent'].includes(k))||input.consent!==true||!kinds.has(input.kind)||typeof input.title!=='string'||!input.title.trim()||input.title.length>120||typeof input.message!=='string'||!input.message.trim()||input.message.length>4000)fail(400,'A valid topic, title, message and explicit consent are required.');
   const id=randomUUID(),now=new Date().toISOString();
   const row=(await q.query("INSERT INTO contribution_inbox(id,actor,kind,title,message,status,created_at,updated_at) VALUES($1,$2,$3,$4,$5,'queued',$6,$6) RETURNING *",[id,actor,input.kind,input.title.trim(),input.message.trim(),now])).rows[0];
   return summary(row);
  },
  async mine(actor){
   if(!actor)return {contributions:[]};
   const rows=(await db.query('SELECT * FROM contribution_inbox WHERE actor=$1 ORDER BY created_at DESC,id LIMIT 30',[actor])).rows;
   return {contributions:rows.map(summary)};
  },
  async inbox(){
   const rows=(await db.query("SELECT * FROM contribution_inbox WHERE status<>'closed' ORDER BY CASE WHEN status='queued' THEN 0 ELSE 1 END,created_at,id LIMIT 100")).rows;
   return {contributions:rows.map(row=>({...summary(row),message:row.message}))};
  },
  async update(id,input){
   if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['expectedStatus','status','prNumber'].includes(k))||!Object.hasOwn(transitions,input.expectedStatus)||!transitions[input.expectedStatus].includes(input.status))fail(400,'Invalid contribution status transition.');
   if(input.status==='review'&&(!Number.isSafeInteger(input.prNumber)||input.prNumber<1||input.prNumber>2147483647))fail(400,'An actual GitHub PR number is required for review.');
   if(input.status!=='review'&&input.prNumber!==undefined)fail(400,'Only review status can attach a pull request.');
   return db.transaction(async q=>{
    const current=(await q.query('SELECT * FROM contribution_inbox WHERE id=$1 FOR UPDATE',[id])).rows[0];
    if(!current)fail(404,'Contribution not found.');
    if(current.status!==input.expectedStatus)fail(409,'Contribution status changed; refresh before assigning.');
    const next=(await q.query('UPDATE contribution_inbox SET status=$2,pr_number=$3,updated_at=$4 WHERE id=$1 RETURNING *',[id,input.status,input.prNumber??current.pr_number,new Date().toISOString()])).rows[0];
    return summary(next);
   });
  }
 };
}
