
it('text history catch-up applies the exact delta and copies both detached stacks', () => {
  const owner=createSelectionHistory(),human={};
  const source=owner.create(createHistoryDoc(),human);
  source.doc.transact(()=>source.doc.getText('master').insert(0,'A'),human);
  const target=owner.fork(source,human),updates:Uint8Array[]=[];
  source.doc.on('update',b=>updates.push(new Uint8Array(b)));
  try {
    source.stopCapturing();source.doc.transact(()=>source.doc.getText('master').insert(1,'B'),human);
    owner.catchUpText(target,source,updates[0]!);
    expect(target.doc.getText('master').toString()).toBe('AB');
    expect(target.undoStack).toEqual(source.undoStack);
    expect(target.undoStack[0]).not.toBe(source.undoStack[0]);
    expect(target.redoStack).not.toBe(source.redoStack);
    target.undo();expect(target.doc.getText('master').toString()).toBe('A');
    expect(source.doc.getText('master').toString()).toBe('AB');
  } finally {for(const h of [source,target]){h.destroy();h.doc.destroy();}owner.close();}
});
