import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {initializePublicState,openPublicState} from './account-service/public-state.ts';
import {SnapshotSource} from './account-service/backup/snapshot.ts';
import {encryptSnapshot} from './account-service/backup/archive.ts';
import {restorePublicBackup} from './account-service/public-restore.ts';
process.umask(0o077);
const root=mkdtempSync('/tmp/restore-smoke-');
try {
  const sourceRevision=process.env.DONE_SOURCE_REVISION;
  const options={directory:join(root,'source'),operatorKeyFile:join(root,'key'),pinFile:join(root,'pin'),policy:{origin:'https://done.example.com',rpId:'done.example.com'}};
  writeFileSync(options.operatorKeyFile,randomBytes(32),{mode:0o600});
  const pin=initializePublicState(options);
  writeFileSync(options.pinFile,JSON.stringify(pin));
  const owner=openPublicState(options);
  const attempt=owner.core.begin({operation:'register',retryKey:randomBytes(32).toString('base64url')});
  assert.equal(attempt.stage,'ceremony');
  const snapshot=join(root,'snapshot');mkdirSync(snapshot,{mode:0o700});
  const reader=new SnapshotSource(join(options.directory,'store'),pin);
  try {await reader.capture(snapshot,sourceRevision);} finally {reader.close();owner.close();}
  const identityFile=join(root,'age.key');
  execFileSync('age-keygen',['-o',identityFile],{stdio:'ignore'});
  const recipient=execFileSync('age-keygen',['-y',identityFile],{encoding:'utf8'}).trim();
  const archive=join(root,'backup.age');
  const digest=await encryptSnapshot(snapshot,archive,recipient,AbortSignal.timeout(10000));
  const restore={...options,directory:join(root,'recovered'),archive,identityFile,archiveSha256:digest.sha256,sourceRevision};
  const result=await restorePublicBackup(restore);
  assert.equal(result.phase,'quarantined');
  assert.equal(result.report.servingAllowed,false);
  assert.deepEqual(await restorePublicBackup(restore),result);
  assert.throws(()=>openPublicState(restore),/quarantined/);
  assert.deepEqual(JSON.parse(readFileSync(join(restore.directory,'candidate/pin.json'))),pin);
  console.log(JSON.stringify({ok:true,sourceRevision,node:process.version,uid:process.getuid(),network:'none',checks:['initialize and durable attempt','capture/encrypt/decrypt/verify','quarantined completion and stable retry','preserved service pin','public startup refusal']}));
} finally {rmSync(root,{recursive:true,force:true});}
