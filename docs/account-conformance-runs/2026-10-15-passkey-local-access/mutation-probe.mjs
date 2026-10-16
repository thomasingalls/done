import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const base='/private/tmp/done-passkey-access-checkout';
const cases=[
 {id:'native-json',file:'src/account/passkeyResponse.ts',before:'const response = credential.response as AuthenticatorAssertionResponse;',after:'return credential.toJSON() as AuthenticationResponseJSON;\n  const response = credential.response as AuthenticatorAssertionResponse;'},
 {id:'wrong-code-label',file:'src/account/firstDeviceSetup.ts',before:"kind: continuation ? 'resume-setup' : fallback,",after:'kind: fallback,'},
 {id:'drop-handoff',file:'src/account/firstDeviceSetup.ts',before:"if (saved && !saved.connected) {\n          const transferred",after:"if (false && saved && !saved.connected) {\n          const transferred"},
];
const results=[];
for(const item of cases){
 const root='/private/tmp/done-passkey-mutant-'+item.id;
 fs.mkdirSync(root);
 for(const dir of ['src','account-protocol','account-service','wasm','vite']) fs.cpSync(path.join(base,dir),path.join(root,dir),{recursive:true});
 fs.mkdirSync(path.join(root,'test'));
 for(const file of ['setup.ts','firstDeviceSetupAccess.test.ts','passkeyResponse.test.ts']) fs.copyFileSync(path.join(base,'test',file),path.join(root,'test',file));
 for(const name of ['package.json','tsconfig.json','vite.config.ts']) fs.copyFileSync(path.join(base,name),path.join(root,name));
 fs.mkdirSync(path.join(root,'node_modules'));
 for(const entry of fs.readdirSync(path.join(base,'node_modules'))) if(!entry.startsWith('.vite')) fs.symlinkSync(path.join(base,'node_modules',entry),path.join(root,'node_modules',entry));
 const file=path.join(root,item.file), source=fs.readFileSync(file,'utf8');
 if(!source.includes(item.before)) throw Error('mutation missing '+item.id);
 const changed=source.replace(item.before,item.after); fs.writeFileSync(file,changed);
 const log='/private/tmp/done-passkey-mutant-'+item.id+'.log';
 const output=fs.openSync(log,'w');
 const run=spawnSync(path.join(root,'node_modules/.bin/vitest'),['run','test/passkeyResponse.test.ts','test/firstDeviceSetupAccess.test.ts'],{cwd:root,env:{...process.env,APP_BUILD_REVISION:'42ebdd12de0edcae7a5cd51bd44c3266e914bfcf-dirty',APP_BUILD_DATE:'2026-10-15'},stdio:['ignore',output,output]});
 fs.closeSync(output);
 results.push({id:item.id,path:item.file,before:item.before,after:item.after,mutantSha256:createHash('sha256').update(changed).digest('hex'),exitCode:run.status,log});
}
fs.writeFileSync('/private/tmp/done-passkey-mutation-results.json',JSON.stringify(results,null,2)+'\n');
console.log(results.map(({id,exitCode,log})=>({id,exitCode,log})));
if(results.some(x=>x.exitCode!==1)) process.exitCode=1;
