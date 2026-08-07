/**
 * The Yjs seam (TRD §10.1).
 *
 * This is the ONLY module in the codebase permitted to import from `yjs`,
 * `y-indexeddb`, `y-protocols`, `y-codemirror.next` or `y-websocket`. Yjs v13,
 * `y-codemirror.next@0.3.5` and `y-websocket@3.0.0` are pinned; v14,
 * `@y/codemirror` and whatever the provider becomes on top of them are planned
 * debt. Keeping every import here means that migration touches one file.
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
