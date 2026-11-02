/** Observation targets only. This does not verify, grant authority or change saved account state. */
import {createHash} from 'node:crypto';
export function publisherForJoinedActor(actor) {
  const found=new Set();
  for(const origin of actor.storage.origins) for(const database of origin.indexedDB??[]) {
    if(database.name!=='done.custody')continue;
    for(const store of database.stores)for(const row of store.records){
      const candidate=row.value?.reading?.admission?.candidate;
      if(candidate===undefined)continue;
      if(typeof candidate!=='string'||!/^[0-9a-f]{32}$/.test(candidate))throw Error('Malformed fixture publisher role');
      found.add(candidate);
    }
  }
  if(found.size!==1)throw Error('Fixture needs one identifiable joined publisher role');
  return found.values().next().value;
}
export const publisherHashForJoinedActor=actor=>createHash('sha256').update(publisherForJoinedActor(actor)).digest('hex');
