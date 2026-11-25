// Deployment context is supplied by Netlify, not by the browser.
export function deploymentMode(context, hostname, env=process.env){
 const kind=context?.deploy?.context;
 if(kind==='production'&&['helioshtml.com','www.helioshtml.com','heliosailol.netlify.app'].includes(hostname))return 'production';
 function target(value){try{const u=new URL(value);const ref=decodeURIComponent(u.username).match(/\.([a-z0-9]{20})$/)?.[1]||u.hostname.match(/^db\.([a-z0-9]{20})\.supabase\.co$/)?.[1];return ref?'supabase:'+ref:u.hostname+':'+u.pathname}catch{return null}}
 const preview=target(env.HELIOS_PREVIEW_DB_URL),production=target(env.SUPABASE_DB_URL||env.DATABASE_URL);
 return kind==='deploy-preview'&&env.HELIOS_PREVIEW_WRITES==='1'&&preview&&preview!==production?'preview-test':'practice';
}
export const workspacePath=path=>['/api/workspace-status','/api/health','/api/session','/api/law-board','/api/constitution'].includes(path)||/^\/api\/law-board\/HGA-\d{3}(?:\/(?:vote|update))?$/.test(path)||/^\/api\/constitution\/(?:vote|comment|contribute)$/.test(path);
export function capability(health,mode='direct'){
 const writable=health.storage==='supabase-postgres'&&['production','preview-test','direct'].includes(mode)||health.storage==='pglite'&&health.runtime==='node-server'&&mode==='direct';
 return {storage:health.storage,runtime:health.runtime,mode,writable,reason:writable?'Database-backed advisory writes are available.':'This backend does not have a writable law board.'};
}
