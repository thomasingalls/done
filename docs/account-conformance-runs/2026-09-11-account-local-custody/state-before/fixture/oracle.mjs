// Independent encodings; shared D5 oracle utilities import no production code.
import { hkdfSync, createHmac, createPrivateKey, createPublicKey, sign, diffieHellman, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
export { bytes, hex, lp, aes, openAES } from '../account-store-contract/oracle.mjs';
import { bytes, hex, lp, aes } from '../account-store-contract/oracle.mjs';
export const scope = { slotId: 'slot-🙂', principalId: 'principal-é', workspaceId: 'workspace-🙂' };
export const root = 'a1'.repeat(32), generation = 'b2'.repeat(32);
export const code = '0123456789ABCDEFGHJKMNPQR', codeDisplay = '01234-56789-ABCDE-FGHJK-MNPQR';
export const seed = role => role === 'wrapping' ? '42'.repeat(32) : '53'.repeat(32);
export const prefix = role => '302e020100300506032b65' + (role === 'wrapping' ? '6e' : '70') + '04220420';
export const privateKey = (role, raw = seed(role)) => createPrivateKey({ key: Buffer.from(prefix(role) + raw, 'hex'), format: 'der', type: 'pkcs8' });
export const publicBytes = (role, raw = seed(role)) => new Uint8Array(createPublicKey(privateKey(role, raw)).export({ format: 'der', type: 'spki' }).subarray(-32));
export const publicObject = raw => createPublicKey({ key: Buffer.from('302a300506032b656e032100' + hex(raw), 'hex'), format: 'der', type: 'spki' });
export const signingProbe = () => Buffer.from('done/custody-key-check/v2', 'utf8');
export const signature = (raw, message) => sign(null, message, privateKey('signing',raw));
export const shared = (raw, pub) => diffieHellman({ privateKey: privateKey('wrapping',raw), publicKey: publicObject(pub) });
export const factorInfo = (s, factor) => lp('done/devicelock/v1',s.principalId,s.workspaceId,factor);
export const factorFields = (s,v) => ['done/devicelock/v1',s.principalId,s.workspaceId,String(v.v),v.factor,v.id];
export const factorKey = (s,ikm,v) => new Uint8Array(hkdfSync('sha256',bytes(ikm),bytes(v.salt),factorInfo(s,v.factor),32));
export const envelopeFields = (s,gen) => ['done/keyenv/v1',s.principalId,s.workspaceId,'1',String(gen),'content-key'];
export const credentialFields = (s,c) => ['done/custody-credential/v2',s.principalId,s.workspaceId,c.role,c.id,c.publicKey];
export const metadataInfo = r => lp('done/custody-metadata/v2',r.slot_id,r.principal_id,r.workspace_id,r.root_id);
export const metadataKey = (r,raw=root) => new Uint8Array(hkdfSync('sha256',bytes(raw),Buffer.alloc(0),metadataInfo(r),32));
export const mac = (key,message) => createHmac('sha256',key).update(message).digest();
export const json = v => Buffer.from(JSON.stringify(v),'utf8');
export const metadataValues = r => ['done/custody-metadata/v2',r.v,r.state,r.slot_id,r.principal_id,r.workspace_id,r.store_id,r.root_id,
 r.seals.map(s=>[s.v,s.factor,s.id,s.salt,s.nonce,s.ct]),r.seal_reserved,r.rotation_owed,
 r.creation_intent ? [r.creation_intent.id,r.creation_intent.storeId,r.creation_intent.rootId,r.creation_intent.wrappingId,r.creation_intent.signingId] : null,
 r.envelope ? [r.envelope.v,r.envelope.gen,r.envelope.nonce,r.envelope.ct] : null,
 r.credentials ? r.credentials.map(c=>[c.role,c.id,c.publicKey,[c.sealed.v,c.sealed.nonce,c.sealed.ct]]) : null];
export const intent = {id:'11'.repeat(16),storeId:'22'.repeat(16),rootId:'33'.repeat(16),wrappingId:'44'.repeat(16),signingId:'55'.repeat(16)};
export function sealFixture(factor='code') {
 const value={v:1,factor,id:factor==='code'?'code':'prf-credential',salt:'01'.repeat(16),nonce:'02'.repeat(12)};
 const ikm=factor==='code'?hex(Buffer.from(code)): '03'.repeat(32);
 return {value:{...value,ct:hex(aes(factorKey(scope,ikm,value),bytes(value.nonce),lp(...factorFields(scope,value)),bytes(root)))},ikm};
}
export function envelopeFixture(gen=1) {const nonce='04'.repeat(11)+(gen===1?'01':'02');return {v:1,gen,nonce,ct:hex(aes(bytes(root),bytes(nonce),lp(...envelopeFields(scope,gen)),bytes(generation)))};}
export function credentialFixture(role='wrapping',raw=seed(role),advertised=hex(publicBytes(role,raw))) {
 const c={role,id:role==='wrapping'?intent.wrappingId:intent.signingId,publicKey:advertised},nonce=role==='wrapping'?'05'.repeat(12):'06'.repeat(12);
 return {...c,sealed:{v:2,nonce,ct:hex(aes(bytes(root),bytes(nonce),lp(...credentialFields(scope,c)),bytes(raw)))}};
}
export function recordFixture(state='creating',reserved=state==='creating'?0:3) {
 const r={v:2,state,slot_id:scope.slotId,principal_id:scope.principalId,workspace_id:scope.workspaceId,store_id:intent.storeId,root_id:intent.rootId,seals:[sealFixture().value],seal_reserved:reserved,rotation_owed:false,
 creation_intent:state==='creating'?intent:null,envelope:state==='protected'?envelopeFixture():null,credentials:state==='protected'?[credentialFixture(),credentialFixture('signing')]:null};
 return {...r,mac:hex(mac(metadataKey(r),json(metadataValues(r))))};
}
export const leaves = (v,path=[]) => Array.isArray(v) ? v.flatMap((x,i)=>leaves(x,[...path,i])) : [{path,value:v}];
export const changed = v => typeof v==='number'?v+1:typeof v==='boolean'?!v:v===null?'changed':v+'x';
export function edit(v,path,value,omit=false){const copy=structuredClone(v);let at=copy;for(const n of path.slice(0,-1))at=at[n];if(omit)at.splice(path.at(-1),1);else at[path.at(-1)]=value;return copy;}
const witnesses = (values,encode) => ({negatives:leaves(values).map(({path,value})=>({path,value:changed(value),messageHex:hex(encode(edit(values,path,changed(value))))})),encodedBindingControls:leaves(values).map(({path,value})=>({path,omittedHex:hex(encode(edit(values,path,null,true))),changedOmittedHex:hex(encode(edit(edit(values,path,changed(value)),path,null,true)))}))});
export function corpus(){
 const vectors=[];
 const add=(id,kind,input,message,result,values,encoder=arr=>lp(...arr))=>vectors.push({id,kind,signer:null,input,expected:{messageHex:hex(message),resultHex:hex(result)},...witnesses(values,encoder)});
 for(const factor of ['code','prf']){
  const f=sealFixture(factor),v=f.value,info=factorInfo(scope,factor),k=factorKey(scope,f.ikm,v);
  vectors.push({id:'custody-factor-key-'+factor,kind:'kdf',signer:null,input:{scope,...f},expected:{messageHex:hex(info),resultHex:hex(k)},negatives:['principalId','workspaceId','factor','ikm','salt'].map(field=>{const s=['principalId','workspaceId'].includes(field)?{...scope,[field]:scope[field]+'x'}:scope,v2={...v,...(field==='factor'?{factor:factor==='code'?'prf':'code'}:field==='salt'?{salt:'ff'.repeat(16)}:{})},ikm=field==='ikm'?'ff'.repeat(32):f.ikm;return {field,scope:s,value:v2,ikm,resultHex:hex(factorKey(s,ikm,v2))};})});
  const values=factorFields(scope,v);add('custody-factor-seal-'+factor,'aead',{scope,...f,root},lp(...values),bytes(v.ct),values);
 }
 const symbols='0123456789ABCDEFGHJKMNPQRSTVWXYZ',entropy=Uint8Array.from({length:25},(_,i)=>i*9),normalized=[...entropy].map(v=>symbols[v&31]).join(''),display=normalized.match(/.{5}/g).join('-');
 vectors.push({id:'custody-generated-code',kind:'predicate',signer:null,input:{entropyHex:hex(entropy)},expected:{messageHex:hex(entropy),resultHex:hex(Buffer.from(display)),normalized},negatives:[{input:'0'.repeat(24)},{input:'U'.repeat(25)},{input:'0'.repeat(26)}]});
 for(const gen of [1,2]){const v=envelopeFixture(gen),values=envelopeFields(scope,gen);add('custody-envelope-'+gen,'aead',{scope,root,generation,value:v},lp(...values),bytes(v.ct),values);}
 for(const role of ['wrapping','signing']){const c=credentialFixture(role),values=credentialFields(scope,c);add('custody-credential-'+role,'aead',{scope,root,seed:seed(role),value:c},lp(...values),bytes(c.sealed.ct),values);}
 vectors.push({id:'custody-signing-correspondence',kind:'predicate',signer:null,input:{seed:seed('signing'),publicKey:hex(publicBytes('signing'))},expected:{messageHex:hex(signingProbe()),resultHex:hex(signature(seed('signing'),signingProbe()))},negatives:[{seed:'99'.repeat(32),publicKey:hex(publicBytes('signing','99'.repeat(32)))}]});
 const peer='77'.repeat(32);vectors.push({id:'custody-wrapping-correspondence',kind:'predicate',signer:null,input:{seed:seed('wrapping'),publicKey:hex(publicBytes('wrapping')),peer,peerPublic:hex(publicBytes('wrapping',peer))},expected:{messageHex:hex(publicBytes('wrapping',peer)),resultHex:hex(shared(seed('wrapping'),publicBytes('wrapping',peer)))},negatives:[{seed:'99'.repeat(32),publicKey:hex(publicBytes('wrapping','99'.repeat(32)))}]});
 const r=recordFixture();vectors.push({id:'custody-metadata-key',kind:'kdf',signer:null,input:{root,value:r},expected:{messageHex:hex(metadataInfo(r)),resultHex:hex(metadataKey(r))},negatives:['slot_id','principal_id','workspace_id','root_id','root'].map(field=>{const value=field==='root'?r:{...r,[field]:r[field]+'x'},raw=field==='root'?'dd'.repeat(32):root;return {field,value,root:raw,resultHex:hex(metadataKey(value,raw))};})});
 for(const [id,state,n] of [['creating','creating',0],['reserved','creating',3],['protected','protected',3]]){const value=recordFixture(state,n),values=metadataValues(value);add('custody-metadata-'+id,'mac',{root,value},json(values),bytes(value.mac),values,json);}
 return {v:1,scope:'D6 current factor/custody bytes; no PRF enrollment, rotation, rollback or total-loss qualification',inherited:['device-lock','record-format'].map(n=>({path:`test/vectors/${n}.json`,sha256:createHash('sha256').update(readFileSync(`test/vectors/${n}.json`)).digest('hex')})),vectors};
}
