import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {stripTypeScriptTypes} from 'node:module';
const source=readFileSync(new URL('./grow.spec.ts',import.meta.url),'utf8');
const oldPoll='(await(globalThis as any).b.compositionStatus()).sync.send.acceptedThrough';
const newPoll='(globalThis as any).b.session.session.sync.status.send.acceptedThrough';
const expectedOriginalHash='01cd88818811dd063c3aece992b8b85c3805cda7eed1fe5da7122f20f63bdf35';
const read=new Function('globalThis','return '+stripTypeScriptTypes(newPoll));
test('only approved per-position poll changes; every check and deadline inverses exactly',()=>{
 assert.equal(source.split(newPoll).length,2);
 const inverse=source.replace(newPoll,oldPoll);
 assert.equal(createHash('sha256').update(inverse).digest('hex'),expectedOriginalHash);
 assert(source.includes('i<1024'));
 assert(source.includes('{timeout:30000,intervals:[25,50,100]}).toBe(before.prefix+i+1)'));
});
function fake(position){let reads=0,rpc=0;const status={send:{acceptedThrough:position}};
 const g={b:{compositionStatus(){rpc++;throw Error('unbounded RPC invoked');},session:{session:{sync:{get status(){reads++;return status;}}}}}};
 return{g,status,counts:()=>({reads,rpc})};
}
test('published scalar is read without an RPC or history traversal',()=>{
 const f=fake(3078);Object.defineProperty(f.g.b,'spool',{get(){assert.fail('history read');}});
 assert.equal(read(f.g),3078);assert.deepEqual(f.counts(),{reads:1,rpc:0});
});
test('read current published progress past the former failure and through3072backlog',()=>{
 const f=fake(2054);for(const position of[2054,2130,2131,3077,3078]){f.status.send.acceptedThrough=position;assert.equal(read(f.g),position);}assert.equal(f.counts().rpc,0);
});
test('lagging or skipped prefix is returned unchanged for the exact existing assertion',()=>{
 const f=fake(2130);assert.notEqual(read(f.g),2131);f.status.send.acceptedThrough=2132;assert.notEqual(read(f.g),2131);
});
test('missing status cannot manufacture acceptance progress',()=>assert.throws(()=>read({b:{session:{session:{sync:{}}}}})));
test('negative control restoring the original poll calls the poisoned full-status RPC',async()=>{
 const f=fake(3078),original=new Function('globalThis','return (async()=>'+stripTypeScriptTypes(oldPoll)+')()');
 await assert.rejects(original(f.g),/unbounded RPC invoked/);assert.equal(f.counts().rpc,1);
});
