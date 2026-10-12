import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const require=createRequire(process.cwd()+'/package.json');require('fake-indexeddb/auto');
const transaction=IDBDatabase.prototype.transaction;IDBDatabase.prototype.transaction=function(names,...args){return transaction.call(this,typeof names==='string'?names:Array.from(names),...args);};
const storage=()=>{const data=new Map();return {clear(){data.clear();},setItem(k,v){data.set(k,v);Object.defineProperty(this,k,{value:v,enumerable:true,configurable:true});},getItem(k){return data.get(k)??null;}};};
Object.defineProperty(globalThis,'localStorage',{value:storage(),configurable:true});
Object.defineProperty(globalThis,'sessionStorage',{value:storage(),configurable:true});
const bundle=readFileSync('node_modules/.pnpm/playwright-core@1.62.0/node_modules/playwright-core/lib/coreBundle.js','utf8');const source=new Function('return '+bundle.match(/source10 = ('.*');\n/)[1])();
const codec=new Function('const module={exports:{}};'+source+';return new StorageScript(false);')();
const fixture=JSON.parse(readFileSync('/tmp/done-online-typing-20261012/seed-matched-12000/fixture.json','utf8')).b.storage.origins.find(o=>o.origin==='http://localhost:53771');
await codec.restore(fixture);const restored=await codec.collect(true);
const canonical=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
for(const expected of fixture.indexedDB){const actual=restored.indexedDB.find(d=>d.name===expected.name);assert(actual,'Missing database');assert.equal(actual.version,expected.version);for(const store of expected.stores){const got=actual.stores.find(s=>s.name===store.name);assert(got,'Missing store');assert.equal(got.records.length,store.records.length);assert(canonical(got.records)===canonical(store.records),'Record round-trip mismatch in '+store.name);}}
for(const row of fixture.localStorage)assert.equal(localStorage.getItem(row.name),row.value);
const phone=readFileSync('docs/performance-experiments/2026-10-12-status-subscriptions/probe/phone.ts','utf8');const template=phone.match(/toString: \(\) => `([\s\S]*?)` }/)[1];new Function('return '+template.replace('${source}',source));
console.log('Full synthetic fixture IndexedDB round-trip, localStorage values and phone expression parse pass.');
