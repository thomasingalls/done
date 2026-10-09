import { fixture, c, paths } from '@adapter';
import { createEditor } from '@candidate/editor/createEditor.ts';
import {
  KnownRefusal,
  installFaults,
  inventory,
  raw,
  rows,
  put,
  encode,
  request,
} from './platform.mjs';
const faults = installFaults();
const sessions = new Map(),
  pending = new Map();
let home, transportDoc;
const errors = [];
window.addEventListener('unhandledrejection', (e) => {
  errors.push(String(e.reason));
});
const transport = async (options) => {
  transportDoc = options.doc;
  return { connect() {}, disconnect() {}, destroy() {}, setToken() {} };
};
function begin(name, operation) {
  if (pending.has(name)) throw Error(`Duplicate operation ${name}`);
  pending.set(name, { status: 'pending' });
  void Promise.resolve()
    .then(operation)
    .then(
      () => pending.set(name, { status: 'resolved' }),
      (error) =>
        pending.set(name, {
          status: 'rejected',
          name: error.name,
          code: error.code ?? error.refusal ?? null,
          message: error.message,
        }),
    );
}
function session(id) {
  const s = sessions.get(id);
  if (!s) throw Error(`No session: ${id}`);
  return s;
}
async function open(id, create = false, app = false) {
  const s = await home.open(create, app, transport);
  sessions.set(id, s);
  if (app) {
    s.editor = createEditor({
      parent: document.getElementById('editor'),
      text: s.master,
      awareness: s.awareness,
      undo: s.undo,
      origin: s.actor.origin,
    });
    s.sync.configure({ endpoint: 'ws://127.0.0.1:9', room: 'fixture', token: '', enabled: true });
  }
  await s.local.whenDurable();
  return snapshot(id);
}
function snapshot(id) {
  const s = session(id);
  const master = s.master?.toString() ?? null;
  return {
    map: s.doc.getMap('probe').toJSON(),
    canonical: master,
    visible: s.editor?.view.state.doc.toString() ?? null,
    transport: transportDoc?.getText('master').toString() ?? null,
    undoDepth: s.undo?.undoStack.length ?? null,
    exported: s.editor ? c.exportEntries(s.doc, s.editor.view.state.doc.toString()) : null,
    notDurable:
      typeof s.local.notDurable === 'function' ? s.local.notDurable() : s.local.notDurable,
  };
}
function edit(id, text, at) {
  const s = session(id);
  if (!s.editor) throw Error('Editor scenario requires the application path');
  s.editor.view.dispatch({ changes: { from: at ?? s.editor.view.state.doc.length, insert: text } });
  return snapshot(id);
}
window.harness = {
  paths,
  async setup(name) {
    home = await fixture(name);
    faults.prefix(home.handle.journalPrefix);
    return {
      productionEntryFiles: paths,
      db: home.handle.dbName,
      prefix: home.handle.journalPrefix,
      recordStore: home.recordStore,
      metaStore: home.metaStore,
    };
  },
  open,
  async attemptOpen(id, app = false) {
    try {
      return { opened: true, snapshot: await open(id, false, app) };
    } catch (e) {
      if (e instanceof KnownRefusal) return { opened: false, typed: e.typed, code: e.code };
      throw e;
    }
  },
  close(id) {
    const s = session(id);
    s.editor?.destroy();
    s.close();
    sessions.delete(id);
  },
  snapshot,
  edit,
  mapEdit(id, key, value) {
    const s = session(id);
    if (s.writeMap) s.writeMap(key, value);
    else s.doc.getMap('probe').set(key, value);
  },
  flush(id) {
    return session(id).local.whenDurable();
  },
  beginFlush(id) {
    begin('flush', () => session(id).local.whenDurable());
  },
  beginTrim(id) {
    begin('trim', () => session(id).local.trim());
  },
  operations() {
    return Object.fromEntries(pending);
  },
  faults(action, value) {
    if (typeof faults[action] !== 'function') throw Error('Unknown fault operation');
    return faults[action](value);
  },
  gateState: () => faults.state(),
  events: () => faults.events,
  errors: () => errors,
  inventory,
  async records() {
    return encode(await rows(home.handle.dbName, home.recordStore));
  },
  async damageRecord(version = false) {
    const record = (await rows(home.handle.dbName, home.recordStore))[0];
    if (!record) throw Error('Damage schedule has no record');
    if (version) record.v = 999;
    else {
      record.ct = Uint8Array.from(record.ct);
      record.ct[0] ^= 1;
    }
    await put(home.handle.dbName, home.recordStore, record);
    return record.seq;
  },
  async clearMetadata() {
    await raw(home.handle.dbName, home.metaStore, (s) => request(s.clear()), 'readwrite');
  },
  async metadata() {
    return encode(await rows(home.handle.dbName, home.metaStore));
  },
  journal() {
    return Object.fromEntries(
      Object.keys(localStorage)
        .filter((k) => k.startsWith(home.handle.journalPrefix))
        .sort()
        .map((k) => [k, localStorage.getItem(k)]),
    );
  },
  damageJournal() {
    const key = Object.keys(localStorage).find((k) => k.startsWith(home.handle.journalPrefix));
    if (!key) throw Error('Damage schedule has no journal');
    localStorage.setItem(key, 'unsupported journal fixture');
    return key;
  },
  beginClear() {
    begin('clear', () => home.clear());
  },
  remote(kind, text = 'R') {
    if (!transportDoc)
      throw Error('Production sync controller has not exposed its transport document');
    const remote = new c.Y.Doc();
    c.Y.applyUpdate(remote, c.Y.encodeStateAsUpdate(transportDoc));
    const before = c.Y.encodeStateVector(remote);
    let update;
    remote.on('update', (bytes) => {
      update = bytes;
    });
    if (kind === 'insert') remote.getText('master').insert(0, text);
    else remote.getText('master').delete(0, remote.getText('master').length);
    if (!update) throw Error('Remote fixture did not generate an update');
    const sameVector =
      Array.from(before).join() === Array.from(c.Y.encodeStateVector(remote)).join();
    // This is the provider application seam used in the pinned yjs.ts. It
    // exercises the real persistence/editor bridge, not encrypted wire admission.
    c.Y.applyUpdate(transportDoc, update, { fixtureTransport: true });
    remote.destroy();
    return { sameVector, snapshot: snapshot('app') };
  },
  async seedLegacy() {
    const s = await c.openStore({ store: c.LEGACY_STORE });
    s.doc.transact(() => s.master.insert(0, 'legacy survives'), s.actor.origin);
    await s.local.whenDurable();
    s.destroy();
  },
  async openDefault() {
    const s = await home.openDefault();
    const value = s.master.toString();
    s.destroy();
    return value;
  },
};
