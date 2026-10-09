/** Independent input-string ledger; Yjs supplies wire encoding, not expected text. */
import * as Y from 'yjs';
import assert from 'node:assert/strict';

export const corpusEdits = [
  { lane: 0, actor: 1, at: 0, text: 'a', remove: 0 },
  ...Array.from({ length: 3 }, () => ({ lane: 0, actor: 0, at: 0, text: 'a', remove: 0 })),
];
export const corpusOrder = [3, 1, 5, 0, 2, 4, 6];

export function makeSource(edits, names = ['master', 'lane1', 'lane2']) {
  const docs = [101, 102, 103].map((id) => {
    const doc = new Y.Doc({ gc: false });
    doc.clientID = id;
    return doc;
  });
  const updates = [],
    authors = [],
    expected = ['', '', ''];
  try {
    docs.forEach((doc) =>
      doc.on('update', (u, origin) => {
        if (origin === 'source-edit') updates.push(Array.from(u));
      }),
    );
    const history = [
      ...docs.map((_, lane) => ({ lane, actor: lane, at: 0, text: `base${lane}`, remove: 0 })),
      ...edits,
    ];
    for (const edit of history) {
      const lane = edit.lane % 3,
        actor = edit.actor % 3,
        doc = docs[actor];
      const before = expected[lane],
        at = edit.at % (before.length + 1);
      const remove = Math.min(edit.remove, before.length - at);
      expected[lane] = before.slice(0, at) + edit.text + before.slice(at + remove);
      const count = updates.length;
      doc.transact(() => {
        const text = doc.getText(names[lane]);
        if (remove) text.delete(at, remove);
        if (edit.text) text.insert(at, edit.text);
      }, 'source-edit');
      if (updates.length > count) {
        authors.push(actor);
        for (const peer of docs)
          if (peer !== doc) Y.applyUpdate(peer, Uint8Array.from(updates.at(-1)));
      }
      for (const peer of docs)
        assert.deepEqual(
          names.map((name) => peer.getText(name).toString()),
          expected,
          'source ledger',
        );
    }
    return { names, updates, authors, expected };
  } finally {
    docs.forEach((doc) => doc.destroy());
  }
}

export const state = (doc, names) => ({
  text: names.map((name) => doc.getText(name).toString()),
  vector: [...Y.decodeStateVector(Y.encodeStateVector(doc))].sort(([a], [b]) => a - b),
  pendingStructs: Boolean(doc.store.pendingStructs),
  pendingDs: Boolean(doc.store.pendingDs),
  missing: [...(doc.store.pendingStructs?.missing ?? [])].sort(([a], [b]) => a - b),
});
export function replay(source, order) {
  const doc = new Y.Doc({ gc: false });
  try {
    for (const id of order) Y.applyUpdate(doc, Uint8Array.from(source.updates[id]));
    return state(doc, source.names);
  } finally {
    doc.destroy();
  }
}
export const complete = (actual, source) =>
  !actual.pendingStructs &&
  !actual.pendingDs &&
  JSON.stringify(actual.text) === JSON.stringify(source.expected);

export function senderFIFO(source, order) {
  const last = new Map();
  for (const id of order) {
    const author = source.authors[id];
    if ((last.get(author) ?? -1) > id) return false;
    last.set(author, id);
  }
  return true;
}

export function orderedByKeys(length, keys) {
  return Array.from({ length }, (_, id) => id).sort(
    (a, b) => (keys[a % keys.length] ?? 0) - (keys[b % keys.length] ?? 0) || a - b,
  );
}
