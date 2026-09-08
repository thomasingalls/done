import { EditorSelection } from '@codemirror/state';
import '../journal/browser.mjs';
import '@styles';
import { openAdmittedText } from '@text';
import { createAdmittedEditor } from '@editor';
import { connectTextChannel } from '@channel';
import { cloneDocument, prepareIntent, newWriterId } from '@document';
import { createDoc, applyUpdate, encodeState } from '@yjs';
const scope = {
  slotId: 'content-slot',
  principalId: 'content-principal',
  workspaceId: 'content-workspace',
};
let document,
  editor,
  channel,
  commits = 0;
const ime = [];
for (const name of [
  'compositionstart',
  'compositionupdate',
  'compositionend',
  'beforeinput',
  'input',
])
  window.document.addEventListener(
    name,
    (e) => {
      ime.push({ name, data: e.data, inputType: e.inputType, composing: e.isComposing });
    },
    true,
  );
const entries = {},
  outgoing = [],
  errors = [],
  publications = [];
const txs = new WeakSet(),
  nativeTx = IDBDatabase.prototype.transaction,
  nativeAdd = IDBObjectStore.prototype.add;
IDBDatabase.prototype.transaction = function (...args) {
  const tx = nativeTx.apply(this, args);
  tx.addEventListener('complete', () => {
    if (txs.has(tx)) commits++;
  });
  return tx;
};
IDBObjectStore.prototype.add = function (value, ...args) {
  const result = nativeAdd.call(this, value, ...args);
  if (this.name === 'content') txs.add(this.transaction);
  return result;
};
const track = (id, fn) => {
  entries[id] = { status: 'pending' };
  try {
    Promise.resolve(fn()).then(
      (value) => {
        entries[id] = { status: 'resolved', value };
      },
      (error) => {
        entries[id] = { status: 'rejected', error: { code: error.code, message: error.message } };
      },
    );
  } catch (error) {
    entries[id] = { status: 'rejected', error: { code: error.code, message: error.message } };
  }
};
window.integration = {
  open: (code) =>
    track('open', async () => {
      document = await openAdmittedText(
        { ...scope, resolvePrincipal: () => scope.principalId },
        code,
        { validateReceive: () => {} },
      );
      editor = createAdmittedEditor({ parent: window.document.querySelector('#editor'), document });
      document.outgoing((b) => outgoing.push(Array.from(b)));
      document.subscribe(() => {
        try {
          publications.push({ text: document.read().text, commits });
        } catch {}
      });
      channel = connectTextChannel(document, scope, (e) => errors.push(e.message));
      editor.view.focus();
    }),
  snapshot: () => {
    let accepted, exported;
    try {
      accepted = document.read();
      exported = document.exportEntries();
    } catch (e) {
      accepted = { error: e.message };
    }
    return {
      ime,
      entries,
      accepted,
      exported,
      view: editor?.view.state.doc.toString(),
      dom: editor?.view.contentDOM.textContent,
      status: document?.status,
      outgoing,
      errors,
      publications,
      commits,
      message: window.document.querySelector('[role=status]')?.textContent,
    };
  },
  input: (id, name, text, at) =>
    track(
      id,
      () =>
        document.input(
          name === 'insert' ? { name, text } : { name },
          at === undefined ? undefined : { ranges: [{ anchor: at, head: at }], main: 0 },
        ).accepted,
    ),
  receive: (id, bytes) => track(id, () => document.receive(new Uint8Array(bytes)).accepted),
  paste: (text) => {
    const data = new DataTransfer();
    data.setData('text/plain', text);
    editor.view.contentDOM.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
    );
  },
  cut: () => {
    const data = new DataTransfer();
    editor.view.contentDOM.dispatchEvent(
      new ClipboardEvent('cut', { clipboardData: data, bubbles: true, cancelable: true }),
    );
    return data.getData('text/plain');
  },
  selectRanges: (ranges) =>
    editor.view.dispatch({
      selection: EditorSelection.create(
        ranges.map(([anchor, head]) => EditorSelection.range(anchor, head)),
      ),
    }),
  select: (from, to = from) => editor.view.dispatch({ selection: { anchor: from, head: to } }),
  retry: () => document.retry(),
  discard: () => document.discardPending(),
  durable: (id) => track(id, () => document.whenDurable()),
  close: () =>
    track('close', () => {
      channel?.close();
      return document.close();
    }),
  remote: (at, text, remove = 0) => {
    const d = createDoc();
    for (const bytes of outgoing) applyUpdate(d, new Uint8Array(bytes));
    let update;
    d.on('update', (b) => {
      update = Array.from(b);
    });
    d.transact(() => {
      if (remove) d.getText('master').delete(at, remove);
      if (text) d.getText('master').insert(at, text);
    });
    d.destroy();
    return update;
  },
  profile: () => {
    const rows = [];
    for (const size of [1024, 100 * 1024, 1024 * 1024]) {
      const d = createDoc();
      d.getText('master').insert(0, 'x'.repeat(size));
      const times = [];
      for (let n = 0; n < 55; n++) {
        const start = performance.now();
        const p = prepareIntent(d, newWriterId(), new Uint8Array([1]), 16384, (draft) =>
          draft.getText('master').insert(draft.getText('master').length, 'z'),
        );
        const elapsed = performance.now() - start;
        p.update.fill(0);
        if (n >= 5) times.push(elapsed);
      }
      rows.push({
        shape: 'single text item',
        chars: size,
        encodedBytes: encodeState(d).length,
        samples: times,
      });
      d.destroy();
    }
    {
      const fragmented = createDoc();
      for (let i = 0; i < 2000; i++)
        fragmented
          .getText('master')
          .insert(Math.floor(fragmented.getText('master').length / 2), 'line\n');
      const times = [];
      for (let n = 0; n < 55; n++) {
        const start = performance.now();
        const p = prepareIntent(fragmented, newWriterId(), new Uint8Array([1]), 16384, (draft) =>
          draft.getText('master').insert(draft.getText('master').length, 'z'),
        );
        const elapsed = performance.now() - start;
        p.update.fill(0);
        if (n >= 5) times.push(elapsed);
      }
      rows.push({
        shape: 'one writer, 2000 middle inserts',
        chars: fragmented.getText('master').length,
        encodedBytes: encodeState(fragmented).length,
        samples: times,
      });
      fragmented.destroy();
    }
    const d = createDoc();
    for (let i = 0; i < 2000; i++) {
      const c = cloneDocument(d);
      c.getText('master').insert(Math.floor(c.getText('master').length / 2), 'line\n');
      applyUpdate(d, encodeState(c));
      c.destroy();
    }
    const times = [];
    for (let n = 0; n < 35; n++) {
      const start = performance.now();
      const p = prepareIntent(d, newWriterId(), new Uint8Array([1]), 16384, (draft) =>
        draft.getText('master').insert(draft.getText('master').length, 'z'),
      );
      const elapsed = performance.now() - start;
      p.update.fill(0);
      if (n >= 5) times.push(elapsed);
    }
    rows.push({
      shape: '2000 distinct writers, middle inserts',
      chars: d.getText('master').length,
      encodedBytes: encodeState(d).length,
      samples: times,
    });
    d.destroy();
    return rows;
  },
};
