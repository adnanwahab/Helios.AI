import {test,expect} from 'bun:test';
import {deploymentMode,capability,workspacePath} from '../src/workspace-persistence.js';
const prod={deploy:{context:'production'}},preview={deploy:{context:'deploy-preview'}};
const host='deploy-preview-64--heliosailol.netlify.app';
const main='postgresql://postgres.aaaaaaaaaaaaaaaaaaaa:one@pooler.supabase.com:6543/postgres';
const other='postgresql://postgres.bbbbbbbbbbbbbbbbbbbb:two@pooler.supabase.com:6543/postgres';
test('preview writes require distinct explicit credentials and trusted deploy context',()=>{
 expect(deploymentMode(prod,'helioshtml.com',{})).toBe('production');
 expect(deploymentMode(preview,host,{SUPABASE_DB_URL:main})).toBe('practice');
 expect(deploymentMode(preview,host,{HELIOS_PREVIEW_DB_URL:other})).toBe('practice');
 expect(deploymentMode(preview,host,{SUPABASE_DB_URL:main,HELIOS_PREVIEW_DB_URL:main,HELIOS_PREVIEW_WRITES:'1'})).toBe('practice');
 expect(deploymentMode(preview,host,{SUPABASE_DB_URL:main,HELIOS_PREVIEW_DB_URL:other,HELIOS_PREVIEW_WRITES:'1'})).toBe('preview-test');
 expect(deploymentMode({},host,{HELIOS_PREVIEW_DB_URL:other,HELIOS_PREVIEW_WRITES:'1'})).toBe('practice');
 expect(workspacePath('/api/constitution/moderate')).toBe(false);
 expect(workspacePath('/api/law-board/HGA-012/vote')).toBe(true);
 expect(capability({storage:'pglite',runtime:'fly-machine'}).writable).toBe(false);
 expect(capability({storage:'pglite',runtime:'node-server'}).writable).toBe(true);
});
