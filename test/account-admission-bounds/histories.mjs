import * as Y from 'yjs';
/** Synthetic unbranched clocks; each new ID models another offline writer incarnation. */
export function history(kind, count = 12000) {
  const doc = new Y.Doc({ gc: false });
  const text = doc.getText('master');
  doc.clientID = 10000;
  doc.transact(() => {
    if (kind === 'sv') {
      for (let i = 0; i < count; i++) {
        doc.clientID = 10000 + i;
        text.insert(text.length, 'x');
      }
    } else {
      text.insert(0, '.x'.repeat(count));
      for (let i = count - 1; i >= 0; i--) text.delete(i * 2 + 1, 1);
    }
  });
  const parts = {
    sv: Buffer.from(Y.encodeStateVector(doc)).toString('hex'),
    ds: Buffer.from(Y.encodeSnapshot(Y.createSnapshot(Y.snapshot(doc).ds, new Map()))).toString(
      'hex',
    ),
  };
  const update = Y.encodeStateAsUpdate(doc),
    visible = text.toString();
  doc.destroy();
  return { parts, update, visible, count };
}
