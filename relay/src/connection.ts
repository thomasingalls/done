/**
 * The sync and awareness message loop.
 *
 * A fork of `@y/websocket-server`'s `setupWSConnection` (MIT, Kevin Jahns),
 * which is itself the server that used to ship inside `y-websocket` and now
 * lives in a repository whose README describes it as forkable. This is that
 * fork: typed, trimmed to what this relay does, and pinned to the same Yjs 13
 * and `y-protocols` the app uses.
 *
 * **Why a fork and not the dependency.** `@y/websocket-server@0.1.1` imports
 * `y-leveldb` at the top of the module, unconditionally, for a persistence
 * backend this relay does not use — and `y-leveldb` pulls in `leveldown`, a
 * native module. Where a prebuilt binary exists for the running platform and
 * ABI that is invisible; where one does not, the relay does not start at all.
 * Node 26 on an arm64 Mac is one of the places it does not. There is no flag
 * that fixes it: the import is static, so the module loads whether or not the
 * package is wanted, and skipping optional dependencies at install time only
 * changes which of the two failures you get. The version that removed the
 * import also moved to Yjs 14, which is a migration this codebase makes on
 * both sides of the socket at once or not at all (TRD §10.1).
 *
 * What is left after the trim is glue: the protocol itself is
 * `y-protocols/sync` and `y-protocols/awareness`, which are still upstream's
 * and are the part that would be worth not reinventing (PRD §12). Gone are the
 * leveldb backend, the HTTP callback/webhook machinery, and the environment
 * variables that configured them — this relay's persistence is passed in
 * (`persistence.ts`) and its configuration is `server.ts`.
 *
 * The relay still holds no authority (TRD §2, §10.6): it applies what it is
 * given and forwards it on. Nothing here inspects a document.
 */

import * as Y from 'yjs';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as syncProtocol from 'y-protocols/sync';
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import type { WebSocket } from 'ws';
import type { Persistence } from './persistence.js';

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;
/** App-specific envelope types, outside y-websocket's 0–3 range. */
const MESSAGE_DEVICE = 4;
const MESSAGE_DEVICE_UPDATE = 5;

const WS_OPEN = 1;

/** Upstream's interval. A client sends awareness every 15s, so 30s is quiet. */
const PING_TIMEOUT_MS = 30_000;

/** One per room, alive while at least one connection is. */
export class SharedDoc extends Y.Doc {
  readonly name: string;
  /** Connection → the awareness client ids it controls, cleared when it goes. */
  readonly conns = new Map<WebSocket, Set<number>>();
  /** Connection metadata used only to label the opaque updates it originated. */
  readonly devices = new Map<WebSocket, { id: string; name: string }>();
  readonly awareness: awarenessProtocol.Awareness;

  constructor(name: string) {
    super({ gc: true });
    this.name = name;

    this.awareness = new awarenessProtocol.Awareness(this);
    // The relay is not a participant. It carries other people's cursors and
    // has none of its own.
    this.awareness.setLocalState(null);

    this.awareness.on(
      'update',
      (
        changes: { added: number[]; updated: number[]; removed: number[] },
        origin: unknown,
      ): void => {
        const { added, updated, removed } = changes;
        const controlled = this.conns.get(origin as WebSocket);
        if (controlled) {
          for (const clientId of added) controlled.add(clientId);
          for (const clientId of removed) controlled.delete(clientId);
        }

        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
        encoding.writeVarUint8Array(
          encoder,
          awarenessProtocol.encodeAwarenessUpdate(this.awareness, [
            ...added,
            ...updated,
            ...removed,
          ]),
        );
        const message = encoding.toUint8Array(encoder);
        for (const conn of this.conns.keys()) send(this, conn, message);
      },
    );

    this.on('update', (update: Uint8Array, origin: unknown): void => {
      const encoder = encoding.createEncoder();
      const device = this.devices.get(origin as WebSocket);
      if (device) {
        // The update remains opaque. This envelope records only which accepted
        // connection supplied the bytes, so clients need not guess from the
        // set of peers that happen to be online.
        encoding.writeVarUint(encoder, MESSAGE_DEVICE_UPDATE);
        encoding.writeVarString(encoder, device.id);
        encoding.writeVarString(encoder, device.name);
        encoding.writeVarUint8Array(encoder, update);
      } else {
        encoding.writeVarUint(encoder, MESSAGE_SYNC);
        syncProtocol.writeUpdate(encoder, update);
      }
      const message = encoding.toUint8Array(encoder);
      for (const conn of this.conns.keys()) send(this, conn, message);
    });
  }
}

/** Live rooms. Exported so shutdown can flush them (`server.ts`). */
export const documents = new Map<string, SharedDoc>();

let persistence: Persistence | null = null;

export const setPersistence = (next: Persistence | null): void => {
  persistence = next;
};

const getDoc = (name: string): SharedDoc => {
  const existing = documents.get(name);
  if (existing) return existing;

  const doc = new SharedDoc(name);
  // Before the caller sends its first sync step, so the relay answers with
  // what it knows rather than with nothing (see persistence.ts).
  persistence?.bindState(name, doc);
  documents.set(name, doc);
  return doc;
};

const send = (doc: SharedDoc, conn: WebSocket, message: Uint8Array): void => {
  if (conn.readyState !== WS_OPEN) {
    closeConn(doc, conn);
    return;
  }
  try {
    conn.send(message, (error) => {
      if (error) closeConn(doc, conn);
    });
  } catch {
    closeConn(doc, conn);
  }
};

const closeConn = (doc: SharedDoc, conn: WebSocket): void => {
  const controlled = doc.conns.get(conn);
  if (controlled) {
    doc.conns.delete(conn);
    doc.devices.delete(conn);
    awarenessProtocol.removeAwarenessStates(doc.awareness, [...controlled], null);

    if (doc.conns.size === 0) {
      // The last device left. Write the room out and let it go: the whole
      // point of the file is that the state outlives the connection, and the
      // whole point of dropping the doc is that an idle relay holds nothing.
      void persistence?.writeState(doc.name, doc).then(() => doc.destroy());
      documents.delete(doc.name);
    }
  }
  conn.close();
};

const readMessage = (doc: SharedDoc, conn: WebSocket, message: Uint8Array): void => {
  const encoder = encoding.createEncoder();
  const decoder = decoding.createDecoder(message);

  switch (decoding.readVarUint(decoder)) {
    case MESSAGE_SYNC: {
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      syncProtocol.readSyncMessage(decoder, encoder, doc, conn);
      // Length 1 is the message type and no message: nothing to reply with.
      if (encoding.length(encoder) > 1) send(doc, conn, encoding.toUint8Array(encoder));
      break;
    }
    case MESSAGE_AWARENESS: {
      awarenessProtocol.applyAwarenessUpdate(
        doc.awareness,
        decoding.readVarUint8Array(decoder),
        conn,
      );
      break;
    }
    case MESSAGE_DEVICE: {
      const id = decoding.readVarString(decoder);
      const name = decoding.readVarString(decoder);
      // Identity is display metadata, not authorization. Bound it anyway: an
      // authenticated but malformed client should not make the relay retain an
      // unbounded label for the lifetime of the connection.
      if (id.length > 0 && id.length <= 128 && name.length > 0 && name.length <= 256) {
        doc.devices.set(conn, { id, name });
      }
      break;
    }
    // Anything else is from a protocol this relay does not speak. Ignored
    // rather than refused: an update it cannot read is not its business.
  }
};

export const setupConnection = (conn: WebSocket, room: string): void => {
  conn.binaryType = 'arraybuffer';
  const doc = getDoc(room);
  doc.conns.set(conn, new Set());

  conn.on('message', (data: ArrayBuffer) => {
    try {
      readMessage(doc, conn, new Uint8Array(data));
    } catch (cause) {
      // One malformed message must not take the room down for the other
      // device. Log it and keep carrying everything else.
      console.error(`relay: bad message in ${room}:`, cause);
    }
  });

  /**
   * A half-open socket — a phone that went into a tunnel and never sent a
   * close — otherwise keeps its awareness state in the room forever, so the
   * other device shows a peer that is not there.
   */
  let alive = true;
  const ping = setInterval(() => {
    if (!doc.conns.has(conn)) {
      clearInterval(ping);
      return;
    }
    if (!alive) {
      closeConn(doc, conn);
      clearInterval(ping);
      return;
    }
    alive = false;
    try {
      conn.ping();
    } catch {
      closeConn(doc, conn);
      clearInterval(ping);
    }
  }, PING_TIMEOUT_MS);

  conn.on('pong', () => {
    alive = true;
  });
  conn.on('close', () => {
    closeConn(doc, conn);
    clearInterval(ping);
  });

  // Sync step 1: what the relay has, so the client can send what it is missing.
  const sync = encoding.createEncoder();
  encoding.writeVarUint(sync, MESSAGE_SYNC);
  syncProtocol.writeSyncStep1(sync, doc);
  send(doc, conn, encoding.toUint8Array(sync));

  const states = doc.awareness.getStates();
  if (states.size > 0) {
    const awareness = encoding.createEncoder();
    encoding.writeVarUint(awareness, MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(
      awareness,
      awarenessProtocol.encodeAwarenessUpdate(doc.awareness, [...states.keys()]),
    );
    send(doc, conn, encoding.toUint8Array(awareness));
  }
};
