import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {defineConfig} from '@playwright/test';
const port=Number(process.env.HELIOS_TEST_PORT||3101),baseURL=`http://127.0.0.1:${port}`;
export default defineConfig({testDir:'./test/browser',testMatch:'**/*.e2e.js',workers:1,timeout:30000,outputDir:process.env.HELIOS_ARTIFACTS||join(tmpdir(),'helios-browser'),use:{baseURL,browserName:'chromium',channel:process.env.CI?undefined:'chrome',trace:'retain-on-failure'},webServer:{command:'node scripts/build-netlify.mjs && node scripts/dev-server.js',url:baseURL+'/api/health',env:{PORT:String(port),HOST:'127.0.0.1',SUPABASE_DB_URL:'',DATABASE_URL:'',OPENAI_API_KEY:'',HELIOS_GITHUB_TOKEN:'',RESEND_API_KEY:'',HELIOS_RESEARCH_WORKER_TOKEN:'',HELIOS_PGLITE_DIR:join(tmpdir(),`helios-browser-${process.pid}-${Date.now()}`)},reuseExistingServer:false}});
