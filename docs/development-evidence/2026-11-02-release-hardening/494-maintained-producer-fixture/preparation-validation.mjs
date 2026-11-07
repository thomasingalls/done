import assert from 'node:assert/strict';
export function validatePreparation(p){
 assert.deepEqual(p.archiveAfter,p.archiveBefore,'maintenance changed writing');
 assert.deepEqual(p.archiveReopened,p.archiveBefore,'reopen changed writing');
 assert.deepEqual(p.serverAfter,p.serverBefore,'maintenance changed accepted service history');
 assert(p.beforeHint&&p.reducedHint&&p.reopenedHint,'missing native hint');
 assert(p.reducedHint.revision>p.beforeHint.revision,'no new baseline revision');
 assert(p.reducedHint.records<p.beforeHint.records,'no reduction of native rows');
 assert.equal(p.reopenedHint.revision,p.reducedHint.revision,'reopen baseline changed');
 assert(p.reopenedHint.records<p.beforeHint.records,'reopen lost native reduction');
}
