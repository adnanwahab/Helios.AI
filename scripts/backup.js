import {Database} from 'bun:sqlite';
import {existsSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
export function backup(source,output){
 if(!existsSync(source))throw Error('Source database does not exist.');
 const destination=resolve(output);if(existsSync(destination))throw Error('Backup destination already exists; refusing to overwrite it.');mkdirSync(dirname(destination),{recursive:true});
 const db=new Database(source);try{db.exec('PRAGMA busy_timeout=10000');db.query('VACUUM INTO ?').run(destination);}finally{db.close();}
 const check=new Database(destination,{readonly:true});try{if(check.query('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('Backup integrity check failed.');}finally{check.close();}return destination;
}
if(import.meta.main){const output=process.argv[2];if(!output)throw Error('Usage: bun scripts/backup.js /path/to/new-backup.sqlite');console.log('Verified backup:',backup(process.env.DATABASE_PATH||'.data/helios.sqlite',output));}
