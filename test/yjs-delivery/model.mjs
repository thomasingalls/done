/** Wire generation is supplied by Yjs; expected text and object inventories are input ledgers. */
export const names = ['master', 'lane1', 'lane2'];
export const equal = (actual, expected, label) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    const error = new Error(label);
    error.name = 'InvariantFailure';
    error.actual = actual;
    error.expected = expected;
    throw error;
  }
};
export const orderBy = (length, keys) =>
  Array.from({ length }, (_, i) => i).sort(
    (a, b) => keys[a % keys.length] - keys[b % keys.length] || a - b,
  );
export const state = (Y, doc) => ({
  text: names.map((name) => doc.getText(name).toString()),
  pendingStructs: Boolean(doc.store.pendingStructs),
  pendingDs: Boolean(doc.store.pendingDs),
});
export const check = (Y, doc, source, label = 'complete-basis') => {
  equal(state(Y, doc), { text: source.expected, pendingStructs: false, pendingDs: false }, label);
  if (source.tokens) {
    equal(doc.getArray('tokens').toArray().slice().sort(), source.tokens, label + '-tokens');
    const actual = [...doc.getMap('objects')]
      .map(([id, value]) => [id, value.toJSON()])
      .sort(([a], [b]) => a.localeCompare(b));
    equal(actual, source.objects, label + '-nested-objects');
  }
};

export function concurrentSource(Y, history) {
  const docs = [101, 102, 103].map((id) => {
    const d = new Y.Doc({ gc: false });
    d.clientID = id;
    return d;
  });
  const source = { names, updates: [], expected: ['', '', ''], tokens: [], objects: [] };
  try {
    docs.forEach((d) =>
      d.on('update', (u, origin) => {
        if (origin === 'source') source.updates.push([...u]);
      }),
    );
    // Three concurrent authors per epoch; synchronize only between epochs. Each owns one text root,
    // while all concurrently append to one array and insert nested objects into one map.
    for (let epoch = 0; epoch < history.edits.length; epoch++) {
      const edit = history.edits[epoch],
        start = source.updates.length;
      docs.forEach((d, actor) => {
        const before = source.expected[actor],
          scalar = Array.from(before),
          scalarAt = edit.at % (scalar.length + 1),
          at = scalar.slice(0, scalarAt).join('').length,
          remove = scalar.slice(scalarAt, scalarAt + edit.remove).join('').length;
        source.expected[actor] = before.slice(0, at) + edit.text + before.slice(at + remove);
        const id = `${epoch}:${actor}`;
        source.tokens.push(id);
        source.objects.push([id, { text: edit.text, values: [epoch, actor] }]);
        d.transact(() => {
          const t = d.getText(names[actor]);
          if (remove) t.delete(at, remove);
          if (edit.text) t.insert(at, edit.text);
          d.getArray('tokens').push([id]);
          const object = new Y.Map();
          object.set('text', new Y.Text(edit.text));
          const values = new Y.Array();
          values.push([epoch, actor]);
          object.set('values', values);
          d.getMap('objects').set(id, object);
        }, 'source');
      });
      for (const d of docs)
        for (const u of source.updates.slice(start)) Y.applyUpdate(d, Uint8Array.from(u));
    }
    source.tokens.sort();
    source.objects.sort(([a], [b]) => a.localeCompare(b));
    for (const d of docs) check(Y, d, source, 'concurrent-source-ledger');
    return source;
  } finally {
    docs.forEach((d) => d.destroy());
  }
}

/** A completed remote apply must not leave a pending retry whose lower bound is already satisfied. */
export function parkedIsBlocked(Y, doc) {
  for (const [client, clock] of doc.store.pendingStructs?.missing ?? [])
    equal(clock >= Y.getState(doc.store, client), true, 'ready-wakeup-drained');
}

export function exercise(Y, source, history, arm) {
  const order = orderBy(source.updates.length, history.keys),
    donor = new Y.Doc({ gc: false });
  let receiver = new Y.Doc({ gc: false });
  const apply = (doc, id) => {
    Y.applyUpdate(doc, Uint8Array.from(source.updates[id]));
    parkedIsBlocked(Y, doc);
  };
  let pendingDonor = false,
    pendingDeletionDonor = false;
  try {
    if (arm === 'originals') {
      for (const id of order) {
        apply(receiver, id);
        if (history.duplicate) apply(receiver, id);
      }
    } else {
      const split = history.split % (order.length + 1),
        early = history.early % (order.length - split + 1);
      for (const id of order.slice(0, split)) apply(donor, id);
      pendingDonor = Boolean(donor.store.pendingStructs);
      pendingDeletionDonor = Boolean(donor.store.pendingDs);
      for (const id of order.slice(split, split + early)) apply(receiver, id);
      // Repeated pending handoffs can regroup bytes. Receiver-local state must survive each handoff.
      receiver.getMap('local').set('marker', 'keep');
      let wire = Y.encodeStateAsUpdate(donor);
      for (let hop = 0; hop < 1 + (history.hops % 4); hop++) {
        const next = new Y.Doc({ gc: false });
        Y.applyUpdate(next, wire);
        parkedIsBlocked(Y, next);
        wire.fill(0);
        wire = Y.encodeStateAsUpdate(next);
        next.destroy();
      }
      Y.applyUpdate(receiver, wire);
      parkedIsBlocked(Y, receiver);
      if (history.duplicate) Y.applyUpdate(receiver, wire);
      wire.fill(0);
      for (const id of order.slice(split + early)) apply(receiver, id);
      equal(receiver.getMap('local').get('marker'), 'keep', 'receiver-local-survives');
    }
    check(Y, receiver, source);
    return { pendingDonor, pendingDeletionDonor };
  } finally {
    donor.destroy();
    receiver.destroy();
  }
}

/** Translate generated scalar positions to Y.Text's UTF-16 coordinates before encoding source edits. */
export function scalarEdits(edits) {
  const strings = ['base0', 'base1', 'base2'];
  return edits.map((edit) => {
    const lane = edit.lane % 3,
      before = strings[lane],
      scalar = Array.from(before),
      scalarAt = edit.at % (scalar.length + 1);
    const at = scalar.slice(0, scalarAt).join('').length,
      remove = scalar.slice(scalarAt, scalarAt + edit.remove).join('').length;
    strings[lane] = before.slice(0, at) + edit.text + before.slice(at + remove);
    return { ...edit, at, remove };
  });
}
