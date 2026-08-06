/**
 * Sync (PRD §13 phase 3, TRD §7).
 *
 * The relay is a dumb pipe carrying opaque binary updates (TRD §2). It holds no
 * authority, runs no application logic, and can be absent entirely — so this
 * module is a *policy* layer over a socket, and the policy is mostly about
 * staying out of the way:
 *
 * - **Nothing on the read or write path awaits sync state** (TRD §7.1). Every
 *   entry point below returns synchronously; the transport is loaded and the
 *   socket opened in the background, and the document is fully writable the
 *   whole time.
 * - **No provider is constructed until an endpoint is configured.** With no
 *   configuration the controller is inert: no socket, no timers, and — because
 *   the transport is dynamically imported through the seam — not even the
 *   bytes.
 * - **Offline is the normal state** (PRD principle 3). There is no reconnecting
 *   banner and no read-only mode; the status lives in the menu, where someone
 *   who wants to know can go and look.
 *
 * The configuration is local and unsynced, like the actor and device identities
 * it sits beside (TRD §4.8). A bearer token belongs to the browser it was typed
 * into, and an endpoint reachable from one device is not necessarily reachable
 * from another.
 */

import { readLocalJson, removeLocal, writeLocalJson } from '../lib/localStore';
import {
  openWebsocket,
  type Awareness,
  type OpenWebsocket,
  type WebsocketSession,
  type YDoc,
} from './yjs';

export type SyncStatus = 'disabled' | 'connecting' | 'connected' | 'offline';

/**
 * TRD §7.1. The interface the rest of the app is allowed to see, with a null
 * implementation (`disabledSync`) as the default.
 */
export interface SyncProvider {
  connect: () => void;
  disconnect: () => void;
  readonly status: SyncStatus;
  readonly lastSyncedAt: Date | null;
}

export interface SyncConfig {
  /** Origin, optionally with a path prefix: `wss://relay.example`. */
  endpoint: string;
  /** The document's name on the relay. One person, one document, one room. */
  room: string;
  /** The shared bearer token (TRD §7.2). Empty where the relay wants none. */
  token: string;
  /** Configured but paused. Sync is a thing you can turn off without forgetting. */
  enabled: boolean;
}

export interface SyncState {
  status: SyncStatus;
  lastSyncedAt: Date | null;
  /** The device an incoming change came from, or null for the relay's own copy. */
  lastSyncedFrom: string | null;
  /** Device names of the other clients currently connected. */
  peers: string[];
  /** Set where a failure is worth a sentence: a refused token, a bad endpoint. */
  error: string | null;
  config: SyncConfig | null;
}

export interface SyncController extends SyncProvider {
  readonly state: SyncState;
  /** For `useSyncExternalStore`; the snapshot's identity changes only on change. */
  subscribe: (listener: () => void) => () => void;
  /** Saves and applies a configuration, or forgets it entirely with `null`. */
  configure: (config: SyncConfig | null) => void;
  destroy: () => void;
}

export const DEFAULT_ROOM = 'done';

const CONFIG_KEY = 'done.sync';
const LAST_KEY = 'done.sync.last';

/** A remote update every keystroke would otherwise be a localStorage write. */
const PERSIST_INTERVAL_MS = 10_000;

/* -------------------------------------------------------------------------- */
/* Configuration                                                               */

/**
 * `relay.example` → `wss://relay.example`, `http://box.local:1234` →
 * `ws://box.local:1234`, and anything that isn't a websocket endpoint → null.
 *
 * Defaulting a bare host to `wss:` rather than `ws:` is deliberate: the token
 * is a bearer credential and TRD §7.2 puts it over TLS. Plain `ws://` stays
 * available for a LAN box, but you have to have typed it.
 */
export const normalizeEndpoint = (raw: string): string | null => {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;

  const withScheme = /^[a-z][a-z\d+.-]*:\/\//iu.test(trimmed) ? trimmed : `wss://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }

  if (url.protocol === 'http:') url.protocol = 'ws:';
  if (url.protocol === 'https:') url.protocol = 'wss:';
  if (url.protocol !== 'ws:' && url.protocol !== 'wss:') return null;
  if (url.hostname.length === 0) return null;

  // The room is appended by the provider, so a query or fragment here would end
  // up in the middle of the URL it builds.
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/+$/u, '');
};

/**
 * The room names a document, and it is going into a URL path. Anything that
 * would need escaping is refused rather than escaped, so what the user typed
 * and what the relay stores are the same string.
 */
export const normalizeRoom = (raw: string): string | null => {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return DEFAULT_ROOM;
  return /^[a-z\d][a-z\d._-]{0,63}$/iu.test(trimmed) ? trimmed : null;
};

/**
 * Validates a configuration into the shape the transport takes, or null where
 * it cannot be one. The controller stores only what has been through here.
 */
export const normalizeConfig = (config: Partial<SyncConfig> | null): SyncConfig | null => {
  if (!config) return null;
  const endpoint = normalizeEndpoint(config.endpoint ?? '');
  const room = normalizeRoom(config.room ?? DEFAULT_ROOM);
  if (endpoint === null || room === null) return null;
  return { endpoint, room, token: (config.token ?? '').trim(), enabled: config.enabled !== false };
};

export const readSyncConfig = (): SyncConfig | null => {
  const stored = readLocalJson(CONFIG_KEY);
  if (!stored) return null;
  return normalizeConfig({
    endpoint: typeof stored['endpoint'] === 'string' ? stored['endpoint'] : '',
    room: typeof stored['room'] === 'string' ? stored['room'] : DEFAULT_ROOM,
    token: typeof stored['token'] === 'string' ? stored['token'] : '',
    enabled: stored['enabled'] !== false,
  });
};

export const writeSyncConfig = (config: SyncConfig | null): void => {
  if (config) writeLocalJson(CONFIG_KEY, config);
  else removeLocal(CONFIG_KEY);
};

interface LastSync {
  at: Date | null;
  from: string | null;
}

const readLastSync = (): LastSync => {
  const stored = readLocalJson(LAST_KEY);
  const at = typeof stored?.['at'] === 'string' ? new Date(stored['at']) : null;
  return {
    at: at && !Number.isNaN(at.getTime()) ? at : null,
    from: typeof stored?.['from'] === 'string' ? stored['from'] : null,
  };
};

/* -------------------------------------------------------------------------- */
/* The null provider                                                           */

/**
 * The default, and the thing every other module is written against. An app
 * whose sync configuration has been deleted runs on this and notices nothing
 * (TRD §7.1) — which is what the sync-absent suite asserts.
 */
export const disabledSync: SyncProvider = Object.freeze({
  connect: () => {},
  disconnect: () => {},
  status: 'disabled' as const,
  lastSyncedAt: null,
});

/* -------------------------------------------------------------------------- */
/* The controller                                                              */

export interface SyncOptions {
  doc: YDoc;
  awareness: Awareness;
  /** Injected by tests. The default loads `y-websocket` lazily via the seam. */
  open?: OpenWebsocket;
}

/**
 * A websocket close code the relay chose, turned into a sentence. Everything
 * else — 1006 in a tunnel, 1001 on a laptop lid — is ordinary offline and gets
 * no message, because "you are offline" is not news in a local-first app.
 */
const closeMessage = (code: number, reason: string): string | null => {
  if (code === 4401) return 'The relay refused the token.';
  if (code === 4404) return 'The relay does not serve that room.';
  if (code === 4400) return reason || 'The relay rejected the connection.';
  return null;
};

const deviceNameOf = (state: Record<string, unknown> | undefined): string => {
  const device = state?.['device'];
  if (
    device &&
    typeof device === 'object' &&
    typeof (device as Record<string, unknown>)['name'] === 'string'
  ) {
    return (device as Record<string, unknown>)['name'] as string;
  }
  return 'another device';
};

const sameNames = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((name, index) => name === b[index]);

export const createSync = ({
  doc,
  awareness,
  open = openWebsocket,
}: SyncOptions): SyncController => {
  let config = readSyncConfig();
  let status: SyncStatus = 'disabled';
  let error: string | null = null;
  let session: WebsocketSession | null = null;
  let peers: string[] = [];
  let last = readLastSync();
  let persistedAt = 0;

  /**
   * Bumped by every stop. An `open` in flight resolves into a controller that
   * may have been reconfigured or destroyed since — a disconnect during the
   * dynamic import is not a rare case, it is what leaving the menu looks like.
   */
  let generation = 0;

  const listeners = new Set<() => void>();

  const build = (): SyncState => ({
    status,
    lastSyncedAt: last.at,
    lastSyncedFrom: last.from,
    peers,
    error,
    config,
  });

  let snapshot = build();

  const emit = (): void => {
    snapshot = build();
    for (const listener of listeners) listener();
  };

  /**
   * A change arrived from somewhere else. Which device it came from is not in
   * the update — the relay forwards opaque bytes — so it is read off awareness,
   * where the other client publishes its device name. With no peer connected
   * the update came from the relay's stored copy, and `from` stays null.
   */
  const markSynced = (): void => {
    const at = new Date();
    last = { at, from: peers[0] ?? null };
    const now = at.getTime();
    if (now - persistedAt > PERSIST_INTERVAL_MS) {
      persistedAt = now;
      writeLocalJson(LAST_KEY, { at: at.toISOString(), from: last.from });
    }
    emit();
  };

  const onAwarenessChange = (): void => {
    const names = [...awareness.getStates().entries()]
      .filter(([clientId]) => clientId !== doc.clientID)
      .map(([, state]) => deviceNameOf(state as Record<string, unknown>));
    if (sameNames(names, peers)) return;
    peers = names;
    emit();
  };

  const start = (): void => {
    if (!config?.enabled || session) return;

    const mine = ++generation;
    const current = config;
    status = 'connecting';
    error = null;
    emit();

    void open({
      url: current.endpoint,
      room: current.room,
      doc,
      awareness,
      token: current.token,
      onStatus: (next) => {
        if (mine !== generation) return;
        status = next === 'disconnected' ? 'offline' : next;
        emit();
      },
      onSynced: (synced) => {
        if (mine !== generation || !synced) return;
        error = null;
        markSynced();
      },
      onRemoteUpdate: () => {
        if (mine !== generation) return;
        markSynced();
      },
      onClose: (code, reason) => {
        if (mine !== generation) return;
        error = closeMessage(code, reason);
        emit();
      },
    })
      .then((opened) => {
        if (mine !== generation) {
          opened.destroy();
          return;
        }
        session = opened;
      })
      .catch((cause: unknown) => {
        if (mine !== generation) return;
        // The transport itself failed to load. The document is unaffected —
        // this is a sync that isn't happening, not an app that is broken.
        status = 'offline';
        error = cause instanceof Error ? cause.message : String(cause);
        emit();
      });
  };

  const stop = (): void => {
    generation++;
    session?.destroy();
    session = null;
    peers = [];
    status = 'disabled';
    emit();
  };

  /**
   * A network that came back is the one moment retrying beats backing off. Two
   * cases, and the second is the one that matters after a reload on a plane:
   * a session that exists and is between reconnects, and no session at all
   * because the transport could not be fetched.
   */
  const onOnline = (): void => {
    if (!config?.enabled || status !== 'offline') return;
    if (session) session.connect();
    else start();
  };

  awareness.on('change', onAwarenessChange);
  if (typeof window !== 'undefined') window.addEventListener('online', onOnline);

  start();

  return {
    get state() {
      return snapshot;
    },
    get status() {
      return status;
    },
    get lastSyncedAt() {
      return last.at;
    },

    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    connect: () => {
      if (!config || config.enabled) {
        start();
        return;
      }
      config = { ...config, enabled: true };
      writeSyncConfig(config);
      start();
    },

    disconnect: () => {
      stop();
      if (!config || !config.enabled) return;
      config = { ...config, enabled: false };
      writeSyncConfig(config);
      emit();
    },

    configure: (next) => {
      const normalized = normalizeConfig(next);
      if (next && !normalized) {
        // Rejected before anything is stopped: a typo in the endpoint field of
        // a working configuration should be refused, not acted on by taking
        // the connection down and leaving the old settings on screen.
        error = 'That is not a websocket endpoint.';
        emit();
        return;
      }

      stop();
      config = normalized;
      writeSyncConfig(config);
      error = null;
      if (!config) {
        // Forgetting sync leaves nothing behind, including the record of when
        // it last happened — which would otherwise outlive the thing it
        // describes and read as a claim about a relay that is no longer there.
        removeLocal(LAST_KEY);
        last = { at: null, from: null };
      }
      start();
      emit();
    },

    destroy: () => {
      stop();
      listeners.clear();
      awareness.off('change', onAwarenessChange);
      if (typeof window !== 'undefined') window.removeEventListener('online', onOnline);
    },
  };
};

/**
 * How long ago, in words, for the menu. Deliberately coarse: the exact second
 * of a sync is not a thing anyone acts on, and a ticking timestamp is a
 * re-render every second for a panel that is usually closed.
 */
export const describeSyncAge = (at: Date | null, now: Date = new Date()): string => {
  if (!at) return 'never';
  const seconds = Math.max(0, Math.round((now.getTime() - at.getTime()) / 1000));
  if (seconds < 90) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? 'an hour ago' : `${hours} hours ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
};

/** The local keys, in one place, so a test can clear exactly what sync writes. */
export const SYNC_KEYS = { config: CONFIG_KEY, last: LAST_KEY } as const;
