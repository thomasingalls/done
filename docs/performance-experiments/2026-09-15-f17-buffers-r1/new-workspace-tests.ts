
describe('persistent text buffers', () => {
  const insert = (text: string) => ({ name: 'insert' as const, text });
  it('alternates two actual histories, detaches ranges and erases consumed delta copies', async () => {
    const original = historySeam.createSelectionHistory, copies: Uint8Array[] = [];
    const spy = vi.spyOn(historySeam, 'createSelectionHistory').mockImplementation(() => {
      const owner = original();
      return { ...owner, catchUpText(target, source, update) {
        copies.push(update);
        return owner.catchUpText(target, source, update);
      } };
    });
    const f = await makeFixture(undefined, 'local-snapshots');
    try {
      const before = f.doc.read();
      for (let i = 0; i < 40; i++) {
        await master(f.doc).input(insert('x')).accepted;
        expect(f.doc.read().master).toBe('x'.repeat(i + 1));
        const current = f.owned.at(-1)!.state.history, other = f.retired.at(-1)!.history;
        expect(current).not.toBe(other);
        for (let j = 0; j < Math.min(current.undoStack.length, other.undoStack.length); j++) {
          const a = current.undoStack[j]!, b = other.undoStack[j]!;
          expect(a).not.toBe(b);
          expect(a.meta).not.toBe(b.meta);
          expect(a.insertions).not.toBe(b.insertions);
          for (const [client, ranges] of a.insertions.clients) {
            const old = b.insertions.clients.get(client);
            if (old?.length && ranges.length) expect(ranges[0]).not.toBe(old[0]);
          }
        }
      }
      expect(new Set(f.owned.map(x => x.state.history.doc)).size).toBe(2);
      expect(copies).toHaveLength(39);
      expect(copies.every(b => b.every(v => v === 0))).toBe(true);
      expect(before.master).toBe('');
      const current = f.owned.at(-1)!.state;
      for (const old of f.owned.slice(0, -1)) {
        expect(() => old.scope.ownState(current)).toThrow(/already owned/);
        expect(current.history.doc.isDestroyed).toBe(false);
      }
      for (let i = 0; i < 40; i++) await f.doc.command({kind: 'undo'}).accepted;
      expect(f.doc.read().master).toBe('');
      for (let i = 0; i < 40; i++) await f.doc.command({kind: 'redo'}).accepted;
      expect(f.doc.read().master).toBe('x'.repeat(40));
    } finally {
      await f.doc.close(); spy.mockRestore();
    }
    expect(f.owned.every(x => x.state.history.doc.isDestroyed)).toBe(true);
  });

  it('reused candidates remain private under refusal, retry, discard and drained close', async () => {
    const f = await makeFixture(undefined, 'local-snapshots');
    try {
      await master(f.doc).input(insert('kept')).accepted;
      const accepted = f.owned.at(-1)!.state, retired = f.retired.at(-1)!;
      f.refuse(); f.fail();
      const ticket = master(f.doc).input(insert('later'));
      await until(() => f.doc.status.state === 'blocked');
      expect(f.owned.at(-1)!.state).toBe(retired);
      expect(f.doc.read().master).toBe('kept');
      expect(accepted.history.doc.getText('master').toString()).toBe('kept');
      const count = f.owned.length;
      f.doc.retry(); await ticket.accepted;
      expect(f.owned).toHaveLength(count);
      expect(f.doc.read().master).toBe('keptlater');
      f.fail();
      const discarded = master(f.doc).input(insert('discarded'));
      await until(() => f.doc.status.state === 'blocked');
      const abandoned = f.owned.at(-1)!.state;
      f.doc.discardPending();
      await expect(discarded.accepted).rejects.toHaveProperty('code', 'discarded');
      expect(abandoned.history.doc.isDestroyed).toBe(true);
      expect(f.doc.read().master).toBe('keptlater');
      await master(f.doc).input(insert('new')).accepted;
      f.pause();
      const late = master(f.doc).input(insert('late'));
      await until(() => f.owned.at(-1)!.state.history.doc.getText('master').toString().endsWith('late'));
      const pending = f.owned.at(-1)!.state;
      const closing = f.doc.close();
      expect(pending.history.doc.isDestroyed).toBe(false);
      f.resume(); await closing;
      await expect(late.accepted).rejects.toHaveProperty('code', 'inactive-session');
      expect(f.owned.every(x => x.state.history.doc.isDestroyed)).toBe(true);
    } finally { f.resume(); await f.doc.close(); }
  });

  it('resets retired buffers before remote and structural changes, then rebuilds eligibility', async () => {
    const f = await makeFixture(undefined, 'local-snapshots');
    try {
      await master(f.doc).input(insert('A')).accepted;
      let retired = f.retired.at(-1)!;
      await f.doc.receive(remote(f.doc, d => d.getText('master').insert(0, 'R'))).accepted;
      expect(retired.history.doc.isDestroyed).toBe(true);
      await master(f.doc).input(insert('B'), selection(2)).accepted;
      retired = f.retired.at(-1)!;
      await f.doc.command({kind:'device-label', name:'updated'}).accepted;
      expect(retired.history.doc.isDestroyed).toBe(true);
      await master(f.doc).input(insert('C')).accepted;
      const nextSpare = f.retired.at(-1)!;
      await master(f.doc).input(insert('D')).accepted;
      expect(f.owned.at(-1)!.state).toBe(nextSpare);
      expect(f.doc.read().master).toBe('RABCD');
      expect(f.doc.read().deviceName).toBe('updated');
    } finally { await f.doc.close(); }
  });

  it('surrogate and pending bases retain fresh-fork normalization rather than reuse', async () => {
    for (const text of ['emoji \u{1f600}', 'lone \ud800', 'lone \udc00']) {
      const seed = createDoc(); seed.getText('master').insert(0,text);
      const f = await makeFixture(new Uint8Array(encodeState(seed)), 'local-snapshots');
      seed.destroy();
      try {
        for (let i=0;i<4;i++) await master(f.doc).input(insert('x'),selection(0)).accepted;
        // Valid pairs remain excluded; native encoding already normalizes lone halves in seed.
        if (text.includes('\u{1f600}')) expect(f.retired).toHaveLength(0);
        expect(f.doc.read().master).toBe('xxxx'+text.toWellFormed());
      } finally { await f.doc.close(); }
    }
    const f = await makeFixture(undefined, 'local-snapshots');
    try {
      await master(f.doc).input(insert('A')).accepted;
      const old = f.retired.at(-1)!;
      await master(f.doc).input(insert('\ud800')).accepted;
      expect(old.history.doc.isDestroyed).toBe(true);
      await master(f.doc).input(insert('B')).accepted;
      expect(f.doc.read().master).toBe('A\ufffdB');
    } finally { await f.doc.close(); }
  });

  it('full catch-up comparison refuses corrupted retired content before another append', async () => {
    const f = await makeFixture(undefined, 'local-snapshots');
    try {
      await master(f.doc).input(insert('A')).accepted;
      const spare = f.retired.at(-1)!, count=f.emitted.length;
      spare.history.doc.getMap('meta').set('uncovered', 'drift');
      const ticket=master(f.doc).input(insert('B'));
      await until(() => f.doc.status.state==='blocked');
      expect(f.doc.read().master).toBe('A');
      expect(f.emitted).toHaveLength(count);
      expect(spare.history.doc.isDestroyed).toBe(true);
      f.doc.discardPending();
      await expect(ticket.accepted).rejects.toHaveProperty('code','discarded');
    } finally { await f.doc.close(); }
  });

  it('generated buffer histories match fresh forks through deletion, grouping, reset and refusal', async () => {
    const actions=fc.array(fc.record({
      kind:fc.constantFrom('insert','delete','undo','redo','remote','metadata','retry','discard','noop','unicode','sliced'),
      n:fc.integer({min:0,max:20}),
    }),{minLength:15,maxLength:35});
    await fc.assert(fc.asyncProperty(actions, async generated => {
      const a=await makeFixture(undefined,'local-handoff'), b=await makeFixture(undefined,'local-snapshots');
      const prefix=['insert','insert','delete','undo','redo','retry','discard','remote','metadata','noop'];
      try {
        for (const step of [...prefix.map(kind=>({kind,n:1})),...generated]) {
          const outputs=[];
          for (const f of [a,b]) {
            const text=f.doc.read().master, at=Math.min(step.n,text.length);
            if (['insert','delete','retry','discard','noop','unicode','sliced'].includes(step.kind)) {
              if(step.kind==='retry'||step.kind==='discard'){f.refuse();f.fail();}
              const inserted=step.kind==='unicode'?'\u{1f600}':step.kind==='sliced'?'q'.repeat(1001):step.kind==='noop'?'':'x';
              const action=step.kind==='delete'?{name:'backspace' as const}:insert(inserted);
              const ticket=master(f.doc).input(action,selection(at));
              if(step.kind==='retry'||step.kind==='discard') {
                await until(()=>f.doc.status.state==='blocked');
                expect(f.doc.read().master).toBe(text);
                if(step.kind==='discard') {
                  f.doc.discardPending();await expect(ticket.accepted).rejects.toHaveProperty('code','discarded');
                  outputs.push('discarded');continue;
                }
                const calls=f.preparations.length;f.doc.retry();await ticket.accepted;
                expect(f.preparations).toHaveLength(calls);
              }
              outputs.push((await ticket.accepted).value);
            } else if(step.kind==='remote') {
              await f.doc.receive(remote(f.doc,d=>d.getText('master').insert(d.getText('master').length,'R'))).accepted;
              outputs.push('remote');
            } else outputs.push((await f.doc.command(step.kind==='metadata'?{kind:'device-label',name:'device'+step.n}:{kind:step.kind as 'undo'|'redo'}).accepted).value);
          }
          expect(outputs[1]).toEqual(outputs[0]);
          expect(b.doc.read()).toEqual(a.doc.read());
          expect(master(b.doc).read()).toEqual(master(a.doc).read());
          expect(b.doc.status.revision).toBe(a.doc.status.revision);
        }
        const replay=createDoc();
        try {
          for(const bytes of [...b.disk,...b.wal])applyUpdate(replay,bytes);
          expect(replay.getText('master').toString()).toBe(b.doc.read().master);
        } finally {replay.destroy();}
      } finally { await a.doc.close();await b.doc.close(); }
      expect(b.owned.every(x=>x.state.history.doc.isDestroyed)).toBe(true);
    }),{seed:171510,numRuns:60});
  },30000);
});
