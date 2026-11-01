import {spawnSync} from 'node:child_process';
if(process.env.CI!=='true'||process.platform!=='linux')throw new Error('Run the Magpet pilot checks only in the disposable Linux CI stack.');
const status=spawnSync('npx',['supabase','status','-o','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
if(status.status!==0)throw new Error('The disposable Supabase stack must be running.');
const local=JSON.parse(status.stdout);
if(local.API_URL!=='http://127.0.0.1:55321'||!local.ANON_KEY)throw new Error('Only the configured loopback API and public test key are accepted.');
// Reuse the same loopback app build produced by the preceding integration step.
// No administrative API key or hosted project is passed to the app/browser.
const env={...process.env,NEXT_PUBLIC_SUPABASE_URL:local.API_URL,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:local.ANON_KEY,AGRISTORE_LOCAL_INTEGRATION:'1',AGRISTORE_MAGPET_PILOT:'1'};
const result=spawnSync('npx',['playwright','test','--config=playwright.magpet.config.ts'],{env,stdio:'inherit'});
process.exitCode=result.status??1;
