// Disposable-build diagnostic only. No document or history reference escapes.
const digest = async (bytes) => {
  try { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2,'0')).join(''); }
  finally { bytes.fill(0); }
};
export const createGrowthProbe = ({ live, getHistory, getSelections, getGroup, getStatus, read, snapshot, encode, matches, whenDurable, emit }) => {
  const inspect = async () => {
    live(); await whenDurable(); live();
    const h=getHistory(), doc=h.doc, status=getStatus();
    if (status.state!=='active' || status.pendingItems!==0 || !matches(doc)) throw Error('Growth inspection requires an idle matched owner');
    const canonical=snapshot(), history=encode(doc), view=read();
    const {undo,redo,...content}=view;
    const state={undo:h.undoStack.length,redo:h.redoStack.length,group:getGroup(),revision:status.revision,writer:doc.clientID,selections:JSON.stringify([...getSelections()]),selectionTargets:getSelections().size,canonicalBytes:canonical.length,historyBytes:history.length,cards:view.cards.length,days:view.days.length,clients:doc.store.clients.size,structs:0,deletedStructs:0,historyRanges:0,pendingStructs:Boolean(doc.store.pendingStructs),pendingDs:Boolean(doc.store.pendingDs)};
    for(const structs of doc.store.clients.values())for(const item of structs){state.structs++;if(item.deleted)state.deletedStructs++;}
    for(const item of [...h.undoStack,...h.redoStack])for(const set of [item.insertions,item.deletions])for(const ranges of set.clients.values())state.historyRanges+=ranges.length;
    [state.canonicalDigest,state.historyDigest,state.contentDigest]=await Promise.all([digest(canonical),digest(history),digest(new TextEncoder().encode(JSON.stringify(content)))]);
    live(); if(getHistory()!==h || getStatus().revision!==state.revision)throw Error('Owner changed during growth inspection');
    return state;
  };
  const clearHistory = async () => {
    const before=await inspect();
    getHistory().clear();
    const after=await inspect();
    for(const key of Object.keys(before))if(!['undo','redo','historyRanges'].includes(key) && before[key]!==after[key])throw Error('History clear changed '+key);
    if(after.undo!==0||after.redo!==0||after.historyRanges!==0)throw Error('History clear did not empty undo/redo');
    emit();
    return {before,after};
  };
  return Object.freeze({inspect,clearHistory});
};
