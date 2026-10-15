import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const base='/private/tmp/done-passkey-access-checkout';
const results=JSON.parse(fs.readFileSync('/private/tmp/done-passkey-mutation-results.json','utf8'));
for(const item of results){
 const root='/private/tmp/done-passkey-mutant-'+item.id;
 for(const name of fs.readdirSync(base).filter(x=>x.startsWith('tsconfig')&&x.endsWith('.json'))) fs.copyFileSync(path.join(base,name),path.join(root,name));
 const log='/private/tmp/done-passkey-mutant-'+item.id+'-2.log'; const fd=fs.openSync(log,'w');
 const run=spawnSync(path.join(root,'node_modules/.bin/vitest'),['run','test/passkeyResponse.test.ts','test/firstDeviceSetupAccess.test.ts'],{cwd:root,env:{...process.env,APP_BUILD_REVISION:'42ebdd12de0edcae7a5cd51bd44c3266e914bfcf-dirty',APP_BUILD_DATE:'2026-10-15'},stdio:['ignore',fd,fd]}); fs.closeSync(fd);
 item.harnessFailureLog=item.log;item.log=log;item.exitCode=run.status;
 const output=fs.readFileSync(log,'utf8'); item.testsActuallyRan=/Tests\s+\d+ failed/.test(output);
}
fs.writeFileSync('/private/tmp/done-passkey-mutation-results-2.json',JSON.stringify(results,null,2)+'\n'); console.log(results);
if(results.some(x=>x.exitCode!==1||!x.testsActuallyRan))process.exitCode=1;
