import {Database} from 'bun:sqlite';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import catalog from '../data/catalog.json';
export const hash=value=>createHash('sha256').update(value).digest('hex');
export class Problem extends Error {constructor(status,message){super(message);this.status=status;}}
const fail=(status,message)=>{throw new Problem(status,message);};
const fields={title:160,sharedGoal:4000,illustrativeLocalOption:6000,risksAndSafeguards:4000};
export function proposalContent(input,base={}){
 if(!input||Array.isArray(input)||typeof input!=='object')fail(400,'A proposal object is required.');
 const allowed=new Set([...Object.keys(fields),'suggestedMeasures','category']);
 if(Object.keys(input).some(k=>!allowed.has(k)))fail(400,'Unknown proposal field. Source identities and status cannot be edited.');
 const result={...base};
 for(const [field,max]of Object.entries(fields)){const value=input[field];if(typeof value!=='string'||!value.trim()||value.trim().length>max)fail(400,`${field} is required (maximum ${max} characters).`);result[field]=value.trim();}
 if(!catalog.categories.includes(input.category))fail(400,'Choose an existing category.');result.category=input.category;
 if(!Array.isArray(input.suggestedMeasures)||input.suggestedMeasures.length<1||input.suggestedMeasures.length>8||input.suggestedMeasures.some(x=>typeof x!=='string'||!x.trim()||x.length>240))fail(400,'Provide 1–8 measures, each at most 240 characters.');
 result.suggestedMeasures=input.suggestedMeasures.map(x=>x.trim());return result;
}
export function openStore(path='.data/helios.sqlite'){
 if(path!==':memory:')mkdirSync(dirname(path),{recursive:true});
 const db=new Database(path,{create:true});db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;');
 db.exec(`CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,csrf TEXT NOT NULL,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS laws(id TEXT PRIMARY KEY,current_version TEXT NOT NULL,author TEXT,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS versions(id TEXT PRIMARY KEY,law_id TEXT NOT NULL REFERENCES laws(id),number INTEGER NOT NULL,content TEXT NOT NULL,created_at TEXT NOT NULL,amendment_id TEXT,UNIQUE(law_id,number));
 CREATE TABLE IF NOT EXISTS amendments(id TEXT PRIMARY KEY,law_id TEXT NOT NULL REFERENCES laws(id),base_version TEXT NOT NULL REFERENCES versions(id),proposed TEXT NOT NULL,reason TEXT NOT NULL,author TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'proposed',created_at TEXT NOT NULL,accepted_version TEXT REFERENCES versions(id));
 CREATE INDEX IF NOT EXISTS amendment_law ON amendments(law_id,created_at);
 CREATE TABLE IF NOT EXISTS receipts(actor TEXT NOT NULL,key TEXT NOT NULL,request_hash TEXT NOT NULL,response TEXT NOT NULL,PRIMARY KEY(actor,key));
 CREATE TABLE IF NOT EXISTS limits(key TEXT PRIMARY KEY,count INTEGER NOT NULL,reset_at INTEGER NOT NULL);`);
 const seedHash=hash(JSON.stringify(catalog)),prior=db.query('SELECT value FROM metadata WHERE key=?').get('catalog_hash');
 if(prior&&prior.value!==seedHash){db.close();fail(500,'Catalog seed changed. A reviewed migration is required; stored records were not overwritten.');}
 if(!prior)db.transaction(()=>{
  for(const item of catalog.goals){const version=crypto.randomUUID(),now=new Date().toISOString();db.query('INSERT INTO laws VALUES(?,?,NULL,?)').run(item.id,version,now);db.query('INSERT INTO versions VALUES(?,?,?,?,?,NULL)').run(version,item.id,1,JSON.stringify(item),now);}
  db.query('INSERT INTO metadata VALUES(?,?)').run('catalog_hash',seedHash);
  db.query('INSERT INTO metadata VALUES(?,?)').run('schema_version','1');
 }).immediate();
 const current=id=>db.query('SELECT l.*,v.content,v.number FROM laws l JOIN versions v ON v.id=l.current_version WHERE l.id=?').get(id);
 const publicLaw=row=>({...JSON.parse(row.content),id:row.id,version:row.number,versionId:row.current_version,createdAt:row.created_at});
 function detail(id){const row=current(id);if(!row)fail(404,'Proposal not found.');return {law:publicLaw(row),versions:db.query('SELECT * FROM versions WHERE law_id=? ORDER BY number').all(id).map(v=>({id:v.id,number:v.number,content:JSON.parse(v.content),createdAt:v.created_at,amendmentId:v.amendment_id})),amendments:db.query('SELECT * FROM amendments WHERE law_id=? ORDER BY created_at,id').all(id).map(a=>({id:a.id,baseVersionId:a.base_version,proposed:JSON.parse(a.proposed),reason:a.reason,status:a.status,createdAt:a.created_at,acceptedVersionId:a.accepted_version}))};}
 return {db,catalogHash:seedHash,
  idempotent(actor,key,requestHash,write){return db.transaction(()=>{const prior=db.query('SELECT * FROM receipts WHERE actor=? AND key=?').get(actor,key);if(prior){if(prior.request_hash!==requestHash)fail(409,'This submission key was already used for different content. Reopen the editor for a new submission.');return JSON.parse(prior.response);}const result=write();db.query('INSERT INTO receipts VALUES(?,?,?,?)').run(actor,key,requestHash,JSON.stringify(result));return result;}).immediate();},
  catalog(){return {...catalog,goals:db.query('SELECT l.*,v.content,v.number FROM laws l JOIN versions v ON v.id=l.current_version ORDER BY l.id').all().map(publicLaw)};},detail,
  session(raw){const id=raw?hash(raw):'',row=db.query('SELECT * FROM sessions WHERE id=? AND expires>?').get(id,Date.now());if(row)return {...row,raw:null};const token=randomBytes(32).toString('hex'),csrf=randomBytes(32).toString('hex'),expires=Date.now()+90*86400000;db.query('INSERT INTO sessions VALUES(?,?,?)').run(hash(token),csrf,expires);return {id:hash(token),csrf,expires,raw:token};},
  authenticate(raw){return raw?db.query('SELECT * FROM sessions WHERE id=? AND expires>?').get(hash(raw),Date.now()):null;},
  limit(key,max,windowMs){const now=Date.now();db.transaction(()=>{const row=db.query('SELECT * FROM limits WHERE key=?').get(key);if(row&&row.reset_at>now){if(row.count>=max)fail(429,'Too many submissions. Please try again later.');db.query('UPDATE limits SET count=count+1 WHERE key=?').run(key);}else db.query('INSERT OR REPLACE INTO limits VALUES(?,1,?)').run(key,now+windowMs);db.query('DELETE FROM limits WHERE reset_at<?').run(now-86400000);}).immediate();},
  create(input,author){const content=proposalContent(input,{legalStatus:'editorial_draft_not_law',reviewStatus:'unreviewed',publicVoteStatus:'not_open',sourceRepository:'adnanwahab/Helios.AI',collectionId:catalog.metadata.collectionId,costEstimate:null,impactEvidence:'not_evaluated',consensusSupport:null});const id='HGP-'+crypto.randomUUID(),version=crypto.randomUUID(),now=new Date().toISOString();content.id=id;db.transaction(()=>{db.query('INSERT INTO laws VALUES(?,?,?,?)').run(id,version,author,now);db.query('INSERT INTO versions VALUES(?,?,?,?,?,NULL)').run(version,id,1,JSON.stringify(content),now);}).immediate();return detail(id);},
  amend(id,input,author){if(!input||Object.keys(input).some(k=>!['baseVersionId','reason','proposal'].includes(k)))fail(400,'Invalid amendment fields.');const row=current(id);if(!row)fail(404,'Proposal not found.');if(input.baseVersionId!==row.current_version)fail(409,'This proposal changed. Reload and review the current version before proposing an amendment.');if(typeof input.reason!=='string'||!input.reason.trim()||input.reason.length>3000)fail(400,'Explain the amendment (maximum 3000 characters).');const proposed=proposalContent(input.proposal,JSON.parse(row.content)),aid='AMD-'+crypto.randomUUID();db.query('INSERT INTO amendments(id,law_id,base_version,proposed,reason,author,created_at) VALUES(?,?,?,?,?,?,?)').run(aid,id,row.current_version,JSON.stringify(proposed),input.reason.trim(),author,new Date().toISOString());return detail(id);},
  accept(id,aid){db.transaction(()=>{const a=db.query('SELECT * FROM amendments WHERE id=? AND law_id=?').get(aid,id);if(!a)fail(404,'Amendment not found.');if(a.status==='accepted')return;const row=current(id);if(a.base_version!==row.current_version)fail(409,'Amendment targets an older version; a new amendment is required.');const version=crypto.randomUUID(),now=new Date().toISOString();db.query('INSERT INTO versions VALUES(?,?,?,?,?,?)').run(version,id,row.number+1,a.proposed,now,aid);db.query('UPDATE laws SET current_version=? WHERE id=? AND current_version=?').run(version,id,a.base_version);db.query("UPDATE amendments SET status='accepted',accepted_version=? WHERE id=?").run(version,aid);}).immediate();return detail(id);},
  close(){db.close();}
 };
}
