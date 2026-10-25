import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'tests/counts-local',outputDir:'test-results/counts-local',workers:1,fullyParallel:false,timeout:60000,expect:{timeout:10000},reporter:'list',
 use:{baseURL:'http://127.0.0.1:3217',trace:'off',screenshot:'only-on-failure'},
 webServer:{command:'node scripts/local-count-server.mjs',url:'http://127.0.0.1:3217',reuseExistingServer:false,timeout:120000,env:{AGRISTORE_LOCAL_COUNT_FIXTURE:'1'}},
});
