import '../journal/browser.mjs';
import '@styles';
import { inspectWorkspaceStartup, openOwnedWorkspace } from '@startup';
import { openAdmittedWorkspace } from '@workspace';
import { beginCustodyEnrollment, initializeContentStore, openContentSession } from '@custody';
import { createAdmittedEditor } from '@editor';
import { connectWorkspaceChannel } from '@channel';
import { withExclusiveSlot, slotPermitName } from '@write-session';
import { deriveStoreName } from '@store-name';
import { journalPrefix } from '@journal-codec';
import { createDoc, applyUpdate, encodeState } from '@yjs';
const scope = {
  slotId: 'content-slot',
  principalId: 'content-principal',
  workspaceId: 'content-workspace',
};
const nativeDatabases = indexedDB.databases.bind(indexedDB);
let enumerationCalls = 0;
indexedDB.databases = () => {
  enumerationCalls++;
  throw Error('Startup must not enumerate databases.');
};
const entries = {},
  gates = new Map(),
  checks = [],
  events = [],
  errors = [];
let workspace,
  editor,
  channel,
  mounts = 0,
  channels = 0,
  controller,
  pauseIdentity = false;
const identity = (id) => ({
  id,
  actor: { kind: 'human', name: id, color: '#3f8fd6' },
  device: { id: id + '-device', name: 'fixture' },
});
const options = {
  identity: identity('startup-human'),
  validateReceive: () => {},
  today: () => '2026-09-08',
};
const track = (id, fn) => {
  entries[id] = { status: 'pending' };
  Promise.resolve()
    .then(fn)
    .then(
      (value) => {
        entries[id] = { status: 'resolved', value };
      },
      (error) => {
        entries[id] = { status: 'rejected', error: { code: error.code, message: error.message } };
      },
    );
};
const gate = (name) =>
  new Promise((resolve) =>
    gates.set(name, () => {
      gates.delete(name);
      resolve();
    }),
  );
const db = (name) =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(name);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
const transaction = async (name, stores, fn) => {
  const d = await db(name);
  try {
    return await new Promise((resolve, reject) => {
      const tx = d.transaction(stores, 'readwrite');
      let result;
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(tx.error);
      fn(tx, (v) => {
        result = v;
      });
    });
  } finally {
    d.close();
  }
};
const removeDb = (name) =>
  new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(Error('fixture deletion blocked'));
  });
const index = async (workspaceId = scope.workspaceId, route) => {
  const name = route ?? (await deriveStoreName(scope.principalId, workspaceId));
  await new Promise((resolve, reject) => {
    const req = indexedDB.open('done.slots', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('slots', { keyPath: 'id' });
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      req.result.close();
      resolve();
    };
  });
  await transaction('done.slots', ['slots'], (tx) => {
    const store = tx.objectStore('slots'),
      req = store.get(scope.slotId);
    req.onsuccess = () => {
      const row = req.result ?? {
        id: scope.slotId,
        status: 'active',
        unlockBinding: null,
        stores: [],
      };
      row.stores = row.stores.filter((s) => s.workspace !== workspaceId);
      row.stores.push({ principal: scope.principalId, workspace: workspaceId, dbName: name });
      store.put(row);
    };
  });
};
const authority = (workspaceId = scope.workspaceId) => ({
  slotId: scope.slotId,
  workspaceId,
  resolveIdentity: async (task) => {
    const locks = await task.wait(() => navigator.locks.query());
    checks.push({
      shared: locks.held.some(
        (l) => l.name === slotPermitName(scope.slotId) && l.mode === 'shared',
      ),
    });
    if (pauseIdentity) {
      pauseIdentity = false;
      await gate('identity');
    }
    return { kind: 'local', principalId: scope.principalId };
  },
});
const custodyAuthority = (workspaceId) => ({
  slotId: scope.slotId,
  workspaceId,
  resolvePrincipal: () => scope.principalId,
});
const marker = (state, workspaceId = scope.workspaceId) =>
  transaction('done.custody', ['entries'], (tx) => {
    tx.objectStore('entries').put({ state }, [
      scope.slotId,
      scope.principalId,
      workspaceId,
      'fixture-transition',
    ]);
  });
const inventory = async () => {
  const listed = (await nativeDatabases()).sort((a, b) => a.name.localeCompare(b.name));
  const result = [];
  for (const entry of listed) {
    const d = await db(entry.name),
      stores = [...d.objectStoreNames],
      data = {};
    try {
      if (stores.length)
        await new Promise((resolve, reject) => {
          const tx = d.transaction(stores, 'readonly');
          tx.oncomplete = () => resolve();
          tx.onabort = () => reject(tx.error);
          for (const name of stores) {
            const keys = tx.objectStore(name).getAllKeys(),
              values = tx.objectStore(name).getAll();
            data[name] = {};
            keys.onsuccess = () => {
              data[name].keys = keys.result;
            };
            values.onsuccess = () => {
              data[name].values = values.result;
            };
          }
        });
      result.push({ ...entry, data });
    } finally {
      d.close();
    }
  }
  return JSON.stringify(
    {
      databases: result,
      storage: Object.fromEntries(
        Object.keys(localStorage)
          .sort()
          .map((k) => [k, localStorage.getItem(k)]),
      ),
    },
    (_k, v) => (v instanceof Uint8Array ? Array.from(v) : v),
  );
};
window.startup = {
  snapshot: () => {
    let accepted, exported;
    try {
      accepted = workspace?.read();
      exported = workspace?.exportEntries();
    } catch {}
    return {
      entries,
      gates: [...gates.keys()],
      checks,
      events,
      errors,
      mounts,
      channels,
      enumerationCalls,
      accepted,
      exported,
      view: editor?.view.state.doc.toString(),
      status: workspace?.status,
    };
  },
  async seed(workspaceId = scope.workspaceId, text = 'retained') {
    const auth = custodyAuthority(workspaceId);
    // Synthetic fixture enrollment and identity/index installation, not product genesis evidence.
    const enrollment = beginCustodyEnrollment(auth, { checkCreation: () => {} }),
      code = enrollment.displayCode;
    await enrollment.confirm(code);
    await index(workspaceId);
    await initializeContentStore(auth, code, { checkCreation: () => {} });
    const w = await openAdmittedWorkspace(auth, code, {
      ...options,
      identity: identity('seed-human'),
    });
    try {
      await w.text({ kind: 'master' }).input({ name: 'insert', text }).accepted;
      await w.whenDurable();
    } finally {
      await w.close();
    }
    return code;
  },
  async partial() {
    const auth = custodyAuthority(scope.workspaceId),
      enrollment = beginCustodyEnrollment(auth, { checkCreation: () => {} }),
      code = enrollment.displayCode;
    await enrollment.confirm(code);
    await index();
    return code;
  },
  inspect: (id = 'inspect', workspaceId) =>
    track(id, () => inspectWorkspaceStartup(authority(workspaceId))),
  open: (id, code, workspaceId, connect = true) =>
    track(id, async () => {
      controller = new AbortController();
      const result = await openOwnedWorkspace(authority(workspaceId), code, {
        ...options,
        signal: controller.signal,
      });
      if (result.kind !== 'ready') return result;
      workspace = result.workspace;
      editor = createAdmittedEditor({
        parent: document.querySelector('#editor'),
        document: workspace.text({ kind: 'master' }),
      });
      mounts++;
      if (connect) {
        channel = connectWorkspaceChannel(workspace, result.scope, (e) => errors.push(e.message));
        channels++;
      }
      events.push('exposed-ready');
      return { kind: result.kind, scope: result.scope, storeId: result.storeId };
    }),
  cancel: () => controller?.abort(),
  close: () =>
    track('close', async () => {
      channel?.close();
      await workspace?.close();
    }),
  pauseIdentity: () => {
    pauseIdentity = true;
  },
  release: (name) => gates.get(name)?.(),
  input: (id, text) =>
    track(id, () => workspace.text({ kind: 'master' }).input({ name: 'insert', text }).accepted),
  durable: (id) => track(id, () => workspace.whenDurable()),
  inventory,
  databases: () => nativeDatabases(),
  index,
  marker,
  holdExclusive: (id, state) =>
    track(id, () =>
      withExclusiveSlot(scope.slotId, async () => {
        if (state) await marker(state);
        await gate('exclusive');
      }),
    ),
  async legacy() {
    await new Promise((resolve, reject) => {
      const req = indexedDB.open('done', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('updates');
      req.onsuccess = () => {
        req.result.close();
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
    await transaction('done', ['updates'], (tx) =>
      tx.objectStore('updates').put('retained legacy bytes', 1),
    );
    await index(scope.workspaceId, 'done');
  },
  async mutate(kind, workspaceId = scope.workspaceId) {
    const name = await deriveStoreName(scope.principalId, workspaceId);
    if (kind === 'missing-content') return removeDb(name);
    if (kind === 'journal') {
      localStorage.setItem(journalPrefix(name) + 'bad', '9:opaque');
      return;
    }
    if (kind === 'missing-custody')
      return transaction('done.custody', ['entries'], (tx) =>
        tx.objectStore('entries').delete([scope.slotId, scope.principalId, workspaceId]),
      );
    if (['unindexed', 'route', 'closed'].includes(kind))
      return transaction('done.slots', ['slots'], (tx) => {
        const store = tx.objectStore('slots'),
          req = store.get(scope.slotId);
        req.onsuccess = () => {
          const slot = req.result;
          if (kind === 'unindexed')
            slot.stores = slot.stores.filter((s) => s.workspace !== workspaceId);
          if (kind === 'route')
            slot.stores.find((s) => s.workspace === workspaceId).dbName = 'done.wrong';
          if (kind === 'closed') slot.status = 'closed';
          store.put(slot);
        };
      });
    if (kind === 'ciphertext')
      return transaction(name, ['content'], (tx) => {
        const req = tx.objectStore('content').openCursor();
        req.onsuccess = () => {
          const c = req.result;
          if (c) {
            const v = c.value;
            v.ct[0] ^= 1;
            c.update(v);
          }
        };
      });
    throw Error('Unknown fixture mutation');
  },
  future: (code) =>
    track('future', async () => {
      const doc = createDoc();
      const session = await openContentSession(custodyAuthority(scope.workspaceId), code);
      try {
        for (const r of await session.loadRecords())
          if (r.kind === 'update' || r.kind === 'state') applyUpdate(doc, r.bytes);
        doc.getMap('meta').set('schemaVersion', 999);
        await session.appendBatch([{ kind: 'update', bytes: encodeState(doc) }]);
      } finally {
        doc.destroy();
        await session.close();
      }
    }),
};
