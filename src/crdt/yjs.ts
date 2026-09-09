/**
 * The Yjs seam (TRD §10.1).
 *
 * This is the ONLY module in the codebase permitted to import from `yjs`,
 * `y-indexeddb`, `y-protocols`, `y-codemirror.next` or `y-websocket`. Yjs v13,
 * `y-codemirror.next@0.3.5` and `y-websocket@3.0.0` are pinned; v14,
 * `@y/codemirror` and whatever the provider becomes on top of them are planned
 * debt. v13.6.31 also requires the wake-up patch pinned in vendor-patches; yjs:check verifies it.
 * Keeping every import here means that migration touches one file.
 *
 * `test/seam.test.ts` enforces this mechanically for static and dynamic imports.
 */

import * as Y from 'yjs';
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import { IndexeddbPersistence } from 'y-indexeddb';
import { Awareness } from 'y-protocols/awareness';
import { yCollab, ySyncFacet, yUndoManagerKeymap } from 'y-codemirror.next';
import { WebsocketProvider } from 'y-websocket';

export { Y, IndexeddbPersistence, Awareness, yCollab, ySyncFacet, yUndoManagerKeymap };

export type YDoc = Y.Doc;
export type YText = Y.Text;
export type YMap<T> = Y.Map<T>;
export type YArray<T> = Y.Array<T>;
export type YUndoManager = Y.UndoManager;
export type YTransaction = Y.Transaction;

export const createDoc = (): YDoc => new Y.Doc();

export const newMap = <T>(): YMap<T> => new Y.Map<T>();
export const newText = (initial?: string): YText => new Y.Text(initial);
export const newArray = <T>(): YArray<T> => new Y.Array<T>();

export const encodeState = (doc: YDoc): Uint8Array => Y.encodeStateAsUpdate(doc);

/**
 * Pinned v13 encoder read view. encodeStateAsUpdate reads store.clients and the two pending fields.
 * Excluding pending fields here avoids its merge/diff step changing the missing-dependency map on
 * a subsequent apply. This shallow view is never applied/mutated and never changes the source doc.
 */
const encodeIntegratedState = (doc: YDoc): Uint8Array =>
  Y.encodeStateAsUpdate({
    ...doc,
    store: { ...doc.store, pendingStructs: null, pendingDs: null },
  } as YDoc);

/** Detached runtime fork, not a wire/archive format. Preserve pending bookkeeping without replaying it. */
export const forkDoc = (source: YDoc, gc = true): YDoc => {
  const doc = new Y.Doc({ gc }),
    bytes = encodeIntegratedState(source);
  try {
    Y.applyUpdate(doc, bytes);
    const pending = source.store.pendingStructs;
    doc.store.pendingStructs = pending
      ? { missing: new Map(pending.missing), update: pending.update.slice() }
      : null;
    doc.store.pendingDs = source.store.pendingDs?.slice() ?? null;
    return doc;
  } catch (error) {
    doc.destroy();
    throw error;
  } finally {
    bytes.fill(0);
  }
};
const equalBytes = (a: Uint8Array | null, b: Uint8Array | null): boolean =>
  a === b || (a !== null && b !== null && a.length === b.length && a.every((v, i) => v === b[i]));
const normalizedIntegratedState = (source: YDoc): Uint8Array => {
  const doc = createDoc(),
    bytes = encodeIntegratedState(source);
  try {
    Y.applyUpdate(doc, bytes);
    return encodeIntegratedState(doc);
  } finally {
    bytes.fill(0);
    doc.destroy();
  }
};
/**
 * Compare integrated identity/deletions/content plus exact pending bytes and dependency bookkeeping.
 * Normalizing integrated data with gc:true ignores runtime undo retention and Item split boundaries.
 * This scans/copies document state; it is not an input-latency or memory-budget acceptance receipt.
 */
export const sameDocState = (a: YDoc, b: YDoc): boolean => {
  if (!Y.equalSnapshots(Y.snapshot(a), Y.snapshot(b))) return false;
  const ap = a.store.pendingStructs,
    bp = b.store.pendingStructs;
  if (Boolean(ap) !== Boolean(bp)) return false;
  if (
    ap &&
    bp &&
    (ap.missing.size !== bp.missing.size ||
      [...ap.missing].some(([id, clock]) => bp.missing.get(id) !== clock) ||
      !equalBytes(ap.update, bp.update))
  )
    return false;
  if (!equalBytes(a.store.pendingDs, b.store.pendingDs)) return false;
  const aa = normalizedIntegratedState(a);
  let bb: Uint8Array | undefined;
  try {
    bb = normalizedIntegratedState(b);
    return equalBytes(aa, bb);
  } finally {
    aa.fill(0);
    bb?.fill(0);
  }
};

/** Pinned v13 integration state. Incomplete disk unions must retain their original update framing. */
export const hasPendingUpdates = (doc: YDoc): boolean =>
  doc.store.pendingStructs !== null || doc.store.pendingDs !== null;

/** A replayed untyped root can be requested as a Map even if its wire content was a sequence. */
export const hasSequenceContent = (map: YMap<unknown>): boolean => map._length !== 0;

/** Text projection skips some foreign item kinds. Refuse them at a plain-text capture boundary. */
export const hasNonTextContent = (text: YText): boolean => {
  for (let item = text._start; item; item = item.right) {
    if (!item.deleted && !(item.content instanceof Y.ContentString)) return true;
  }
  return false;
};

export const applyUpdate = (doc: YDoc, update: Uint8Array, origin?: unknown): void =>
  Y.applyUpdate(doc, update, origin);

/**
 * Every mutation runs through here so that no write path can forget to name
 * its actor (TRD §4.8). `transact` already takes an origin argument; this
 * wrapper only removes the option of passing `null`.
 */
export const transact = <T>(doc: YDoc, origin: unknown, fn: () => T): T => doc.transact(fn, origin);

/* -------------------------------------------------------------------------- */
/* Transport (TRD §7)                                                          */

/**
 * What the sync layer is allowed to know about a websocket connection. The
 * provider's own surface is wider than this — `params`, `bcconnected`,
 * `wsUnsuccessfulReconnects` — and none of it belongs in `sync.ts`, whose job
 * is the policy rather than the socket.
 */
export interface WebsocketSession {
  connect: () => void;
  disconnect: () => void;
  destroy: () => void;
  /** Swapped in place, so a re-entered token is used by the next reconnect. */
  setToken: (token: string) => void;
}

export interface WebsocketOptions {
  /** Origin only: `wss://relay.example`. The room is appended by the provider. */
  url: string;
  room: string;
  doc: YDoc;
  awareness: Awareness;
  /** The shared bearer token (TRD §7.2). Empty means the relay wants none. */
  token: string;
  onStatus: (status: 'connecting' | 'connected' | 'disconnected') => void;
  /** Fires with `true` once the server's state has been merged into the doc. */
  onSynced: (synced: boolean) => void;
  /**
   * A change that arrived over the wire rather than from this device. Which
   * transaction origin means "the provider" is the provider's own business, so
   * the comparison stays in here.
   */
  onRemoteUpdate: (device: TransportDevice | null) => void;
  /**
   * The socket closed. A refused token and a tunnel look identical from the
   * status alone, so the close code is passed on for the UI to tell them apart.
   */
  onClose: (code: number, reason: string) => void;
}

export type OpenWebsocket = (options: WebsocketOptions) => Promise<WebsocketSession>;

export interface TransportDevice {
  id: string;
  name: string;
}

/** Custom messages outside y-websocket's 0–3 range. Kept in sync with the relay. */
const MESSAGE_DEVICE = 4;
const MESSAGE_DEVICE_UPDATE = 5;

const awarenessDevice = (awareness: Awareness): TransportDevice | null => {
  const state = awareness.getLocalState();
  const value = state?.['device'];
  if (!value || typeof value !== 'object') return null;
  const device = value as Record<string, unknown>;
  return typeof device['id'] === 'string' && typeof device['name'] === 'string'
    ? { id: device['id'], name: device['name'] }
    : null;
};

const announceDevice = (provider: WebsocketProvider, awareness: Awareness): void => {
  const device = awarenessDevice(awareness);
  if (!device || provider.ws?.readyState !== WebSocket.OPEN) return;
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_DEVICE);
  encoding.writeVarString(encoder, device.id);
  encoding.writeVarString(encoder, device.name);
  provider.ws.send(encoding.toUint8Array(encoder));
};

/**
 * The transport is imported eagerly. It is intentionally still *constructed*
 * only after configuration (TRD §7.1); keeping a short-lived websocket layer
 * in a separate lazy chunk is not worth coupling the service-worker precache
 * and performance budget to it before the planned transport replacement.
 */
export const openWebsocket: OpenWebsocket = async (options) => {
  const provider = new WebsocketProvider(options.url, options.room, options.doc, {
    connect: false,
    awareness: options.awareness,
    params: options.token ? { token: options.token } : {},
    // The default 2.5s is tuned for a room full of people. One person's phone
    // waking up in a tunnel can afford to back off further.
    maxBackoffTime: 10_000,
  });

  let terminal = false;
  let incomingDevice: TransportDevice | null = null;
  provider.messageHandlers[MESSAGE_DEVICE_UPDATE] = (_encoder, decoder) => {
    const device = {
      id: decoding.readVarString(decoder),
      name: decoding.readVarString(decoder),
    };
    const update = decoding.readVarUint8Array(decoder);
    incomingDevice = device;
    try {
      Y.applyUpdate(options.doc, update, provider);
    } finally {
      incomingDevice = null;
    }
  };

  const onUpdate = (_update: Uint8Array, origin: unknown): void => {
    if (origin === provider) options.onRemoteUpdate(incomingDevice);
  };
  const onAwarenessChange = ({ added, updated }: { added: number[]; updated: number[] }): void => {
    if ([...added, ...updated].includes(options.doc.clientID)) {
      announceDevice(provider, options.awareness);
    }
  };

  provider.on('status', ({ status }) => {
    if (status === 'connected') announceDevice(provider, options.awareness);
    options.onStatus(status);
  });
  provider.on('sync', (synced: boolean) => options.onSynced(synced));
  provider.on('connection-close', (event) => {
    const code = event?.code ?? 0;
    options.onClose(code, event?.reason ?? '');
    // These are policy decisions, not transient network failures. Because the
    // relay completes the handshake before closing, y-websocket otherwise
    // resets its backoff and retries a bad token every 100 ms forever.
    if (code === 4400 || code === 4401 || code === 4404) {
      terminal = true;
      provider.shouldConnect = false;
    }
  });
  options.doc.on('update', onUpdate);
  options.awareness.on('change', onAwarenessChange);
  provider.connect();

  return {
    connect: () => {
      if (!terminal) provider.connect();
    },
    disconnect: () => provider.disconnect(),
    destroy: () => {
      options.doc.off('update', onUpdate);
      options.awareness.off('change', onAwarenessChange);
      provider.destroy();
    },
    setToken: (token: string) => {
      if (token) provider.params['token'] = token;
      else delete provider.params['token'];
      terminal = false;
    },
  };
};

export type UndoScope = YText | YMap<unknown> | YArray<unknown>;

/**
 * One undo manager over several roots. Scoping by *type* would give each
 * surface its own history, which is not what PRD §11.3 asks for — undo is
 * scoped to the actor, not to where they happened to be typing.
 */
export const createUndoManager = (
  scope: UndoScope | UndoScope[],
  trackedOrigins: Set<unknown>,
): YUndoManager => new Y.UndoManager(scope, { trackedOrigins });

/** Private runtime workspace history. Deleted content is retained until this history is disposed. */
export const createHistoryDoc = (): YDoc => new Y.Doc({ gc: false });
export const workspaceUndo = (doc: YDoc, origin: unknown): YUndoManager =>
  new Y.UndoManager(
    [doc.getText('master'), doc.getMap('days'), doc.getMap('cards'), doc.getMap('cardLocations')],
    {
      trackedOrigins: new Set([origin]),
      captureTimeout: Infinity,
    },
  );

/**
 * Fork an accepted runtime history for private preparation. Yjs wire updates do not carry
 * Item.redone links or UndoManager stacks. Keep this version-sensitive use inside the v13 seam.
 * Metadata is application-owned structured-cloneable selection data, never Yjs types/callbacks.
 */
export const forkWorkspaceHistory = (source: YUndoManager, origin: unknown): YUndoManager => {
  const doc = forkDoc(source.doc, false);
  try {
    doc.transact((tr) => {
      for (const structs of source.doc.store.clients.values())
        for (const item of structs) {
          if (!(item instanceof Y.Item) || !item.redone) continue;
          const copied = Y.getItemCleanStart(tr, item.id);
          Y.getItemCleanEnd(
            tr,
            doc.store,
            Y.createID(item.id.client, item.id.clock + item.length - 1),
          );
          if (!(copied instanceof Y.Item))
            throw Error('Runtime undo content was garbage-collected.');
          copied.redone = Y.createID(item.redone.client, item.redone.clock);
        }
    });
    const manager = workspaceUndo(doc, origin);
    const copySet = (value: (typeof source.undoStack)[number]['insertions']) => {
      const copy = Y.createDeleteSet();
      for (const [client, ranges] of value.clients)
        copy.clients.set(
          client,
          ranges.map((r) => ({ clock: r.clock, len: r.len })),
        );
      return copy;
    };
    const copyStack = (stack: typeof source.undoStack) =>
      stack.map((item) => ({
        insertions: copySet(item.insertions),
        deletions: copySet(item.deletions),
        meta: structuredClone(item.meta),
      }));
    manager.undoStack = copyStack(source.undoStack);
    manager.redoStack = copyStack(source.redoStack);
    manager.lastChange = source.lastChange;
    return manager;
  } catch (error) {
    doc.destroy();
    throw error;
  }
};
