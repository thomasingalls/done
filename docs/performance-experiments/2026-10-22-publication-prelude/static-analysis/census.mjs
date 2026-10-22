import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
const repo='/Users/thomasingalls/.codex/worktrees/7fda/done';
const output='/private/tmp/done-publication-prelude-20261022/static-analysis';
const require=createRequire(path.join(repo,'package.json'));
const babel=require('@babel/core');
const scope=['account-service','src/crdt','src/account','src/editor'];
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const test=/(?:\.test\.|\.spec\.|\/__tests__\/)/;
function files(dir){return fs.readdirSync(path.join(repo,dir),{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):[path.join(dir,e.name)]);}
const oldIdentity=fs.existsSync(path.join(output,'source-identity.json'))?JSON.parse(fs.readFileSync(path.join(output,'source-identity.json'),'utf8')):undefined;
const oldCensus=fs.existsSync(path.join(output,'census.json'))?JSON.parse(fs.readFileSync(path.join(output,'census.json'),'utf8')):undefined;
const inventory=oldIdentity?.sources.map(s=>s.file)??scope.flatMap(files).filter(f=>/\.tsx?$/.test(f)&&!test.test(f)).sort();
const calls=[], loops=[], awaitSites=[], sources=[], errors=[], sql=[];
const primitives=new Set(['importKey','verify','sign','digest','encrypt','decrypt','deriveKey','deriveBits']);
const authority=new Set(['verifyWorkspaceAuthority','verifyCurrentWorkspaceAuthority','reuseInboundAuthority','verifyMembershipChain','verifyEarlyHistory','verifyCertificationHistory','verifyAdmissionHistory','extendMembershipHistory','createAdmissionPrefixVerifier','resolveMembershipDeliveryAuthority','verifyMembershipDiscoveryResponse','verifyDiscoveryResponse','verifyHistoryExchange']);
const reconstruction=new Set(['census','verifiedCensus','verifyServed','inspectSpool','inspectDelivery','inspectInbound','inspectAccountLedger','verifySpool','verifyDelivery','verifyInboundLedger','verifyAccountUnderPermit','verifyJoinedAccount','readPromotion','readJoinedAccount','captureCatalog','capturedRecovery','sourceRecords','verifyInstalledMembership','verifyInstalledSuccessor','state','readState','replaySnapshot','extendAccountLedger','createAccountLedger','inspectCensus','readProgress','recoverAccountLedger','inspectInboundCooperatively','inspectDeliveryCooperatively','inspectSpoolCooperatively','indexVerifiedLedger','verifyBaselineAuthority','verifyInstalledSuccessor']);
const capture=new Set(['snapshot','snapshotBytes','snapshotBytesForPurpose','read','readScopedRows','slotCustodyRows','getAll','getAllKeys','openCursor','load','loadSelection','spoolWitness','metadata']);
const scheduling=new Set(['setTimeout','setInterval','queueMicrotask','requestIdleCallback','requestAnimationFrame','createSyncScheduler','createDeliveryScheduler','createReceiveScheduler','createBatchWindow','createReceiveSelection','createAdmissionOwner','runCaptureTask','runStorageTask','networkTask','budgetedTask','maintenanceTask','driveReceiveStep','driveDeliveryStep','enter','canDispatch','acquire']);
const bulk=new Set(['JSON.stringify','JSON.parse','structuredClone','serialize','deserialize','Y.encodeStateAsUpdate','Y.applyUpdate','Y.mergeUpdates','Y.decodeUpdate','encodeStateAsUpdate','applyUpdate','mergeUpdates','decodeUpdate','copyBatch','cloneSnapshot','cloneHistory','copySnapshot','bytesEqual','equalBytes','sameBytes','guardedBytesEqual','indexOf']);
function sqlText(n){if(!n)return '<none>';if(n.type==='StringLiteral')return n.value;if(n.type==='TemplateLiteral')return n.quasis.map(x=>x.value.raw).join('${expression}');if(n.type==='BinaryExpression'&&n.operator==='+')return sqlText(n.left)+sqlText(n.right);return '${expression}';}
function callee(n){if(!n)return '?'; if(n.type==='Identifier')return n.name;if(n.type==='MemberExpression'||n.type==='OptionalMemberExpression')return callee(n.object)+'.'+(n.computed&&n.property.type!=='StringLiteral'?'[]':n.property.name??n.property.value);if(n.type==='TSNonNullExpression'||n.type==='TSInstantiationExpression')return callee(n.expression);if(n.type==='CallExpression')return callee(n.callee)+'()';if(n.type==='Import')return 'import';return n.type;}
function functionName(ancestors){for(let i=ancestors.length-1;i>=0;i--){const n=ancestors[i],p=ancestors[i-1];if(/Function/.test(n.type)||n.type==='ObjectMethod'||n.type==='ClassMethod'){const own=n.id?.name||n.key?.name||n.key?.value;if(own)return own;if(p?.type==='VariableDeclarator')return p.id.name??'<destructure>';if(p?.type==='ObjectProperty')return p.key.name??p.key.value;if(p?.type==='CallExpression')return '<callback:'+callee(p.callee)+'>';return '<anonymous>';}}return '<module>';}
for(const file of inventory){
 const destination=path.join(output,'source',file);const content=fs.readFileSync(fs.existsSync(destination)?destination:path.join(repo,file));fs.mkdirSync(path.dirname(destination),{recursive:true});if(!fs.existsSync(destination))fs.writeFileSync(destination,content);
 sources.push({file,sha256:hash(content),bytes:content.length});
 let ast;try{ast=babel.parseSync(content.toString('utf8'),{filename:file,configFile:false,babelrc:false,parserOpts:{sourceType:'module',plugins:['typescript',...(file.endsWith('.tsx')?['jsx']:[])]}});}catch(e){errors.push({file,message:e.message});continue;}
 function visit(node,anc=[]){if(!node||typeof node!=='object'||!node.type)return;const location={file,line:node.loc.start.line,column:node.loc.start.column+1,owner:functionName(anc)};const loopAnc=anc.filter(n=>/^(?:ForStatement|ForInStatement|ForOfStatement|WhileStatement|DoWhileStatement)$/.test(n.type)).map(n=>n.loc.start.line);
  if(/^(?:ForStatement|ForInStatement|ForOfStatement|WhileStatement|DoWhileStatement)$/.test(node.type))loops.push({...location,kind:node.type,text:content.toString().slice(node.start,Math.min(node.end,node.start+180)).split('\n')[0]});
  if(node.type==='AwaitExpression')awaitSites.push({...location,expression:callee(node.argument.type==='CallExpression'?node.argument.callee:node.argument),loopAncestors:loopAnc});
  if(node.type==='CallExpression'||node.type==='OptionalCallExpression'||node.type==='NewExpression'){
   const name=callee(node.callee),last=name.split('.').at(-1),categories=[];
   if(last==='prepare'){ const q=node.arguments?.[0]; const query=sqlText(q); if(query)sql.push({...location,query,select:/^\s*SELECT/i.test(query),boundedByLimit:/\bLIMIT\b/i.test(query),dynamic:query.includes('${expression}')}); }
   if(authority.has(last))categories.push('authority_evidence');
   if(primitives.has(last)&&(/subtle/i.test(name)||name.startsWith('crypto.')))categories.push('crypto_primitive_call');
   if(reconstruction.has(last))categories.push('state_reconstruction_or_full_validation');
   if(capture.has(last))categories.push('capture_storage_or_snapshot');
   if(scheduling.has(last))categories.push('scheduling_or_admission');
   if(bulk.has(name)||bulk.has(last))categories.push('copy_serialization_or_bulk_bytes');
   if(/(?:verify|authenticate|replay|inspect|clone|copy|equal|serialize|decode|encode|load|capture|snapshot|lookup|index|sort|filter|find|map|slice|every|some|reduce)/i.test(last))categories.push('broad_structural_inventory');
   if(categories.length)calls.push({...location,callee:name,categories,awaited:anc.at(-1)?.type==='AwaitExpression',loopAncestors:loopAnc,text:content.toString().slice(node.start,Math.min(node.end,node.start+240)).replace(/\s+/g,' ')});
  }
  for(const [key,value]of Object.entries(node)){if(['loc','start','end','leadingComments','trailingComments','innerComments','extra','tokens','comments'].includes(key))continue;if(Array.isArray(value))for(const child of value)visit(child,[...anc,node]);else if(value?.type)visit(value,[...anc,node]);}
 }
 visit(ast);
}
const definitions={crypto_primitive_call:{leaf:[...primitives],qualifiedCallee:'includes subtle case-insensitive, or starts crypto.'},authority_evidence:[...authority],state_reconstruction_or_full_validation:[...reconstruction],capture_storage_or_snapshot:[...capture],scheduling_or_admission:[...scheduling],copy_serialization_or_bulk_bytes:[...bulk],broad_structural_inventory:'case-insensitive callee leaf regex /(?:verify|authenticate|replay|inspect|clone|copy|equal|serialize|decode|encode|load|capture|snapshot|lookup|index|sort|filter|find|map|slice|every|some|reduce)/'};
const metadata={schema:1,generatedAt:new Date().toISOString(),repository:repo,head:oldIdentity?.head??execFileSync('git',['rev-parse','HEAD'],{cwd:repo,env:{...process.env,GIT_OPTIONAL_LOCKS:'0'},encoding:'utf8'}).trim(),branch:oldCensus?.branch??execFileSync('git',['branch','--show-current'],{cwd:repo,env:{...process.env,GIT_OPTIONAL_LOCKS:'0'},encoding:'utf8'}).trim(),description:'Frozen working-tree source, not HEAD alone; cumulative patches14–20 present; no runtime cost inferred from call counts.',scope,exclusions:['tests/specs','non-TypeScript files','node_modules','account-protocol definitions and cryptographic primitives (callee consumers inventoried)','UI outside src/editor','SQLite query plans/native internals','dynamic dispatch and alias whole-program resolution','runtime frequency or cost attribution'],parser:{name:'@babel/core',version:babel.version},definitions,sourceCount:sources.length,parseErrors:errors,counts:{calls:calls.length,loops:loops.length,awaits:awaitSites.length,sqlStatements:sql.length,categories:Object.fromEntries(Object.keys(definitions).map(k=>[k,calls.filter(c=>c.categories.includes(k)).length]))}};
fs.writeFileSync(path.join(output,'census.json'),JSON.stringify({...metadata,sources,calls,loops,awaitSites,sql},null,2)+'\n');
fs.writeFileSync(path.join(output,'source-identity.json'),JSON.stringify({head:metadata.head,description:metadata.description,sources,sourceSetSha256:hash(JSON.stringify(sources)),scannerSha256:hash(fs.readFileSync(new URL(import.meta.url)))},null,2)+'\n');
console.log(JSON.stringify({...metadata,definitions:undefined},null,2));
