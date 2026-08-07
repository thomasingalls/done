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
  type TransportDevice,
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

/** Just enough of `location` to decide a scheme, and mockable in a test. */
export interface PageOrigin {
  protocol: string;
}

const currentPage = (): PageOrigin | undefined =>
  typeof window === 'undefined' ? undefined : window.location;

/** `localhost`, the loopback block, and `::1`. Not "private" — actually local. */
const LOOPBACK = /^(?:localhost|127(?:\.\d{1,3}){3}|\[::1\])$/iu;

/** What you bind to, which is not what you connect to. A common first try. */
const BIND_ANY = /^(?:0\.0\.0\.0|\[::\])$/u;

export interface ParsedEndpoint {
  url: string | null;
  /** A sentence for the menu when `url` is null. */
  reason: string | null;
}

/**
 * `relay.example` → `wss://relay.example`, `http://box.local:1234` →
 * `ws://box.local:1234`, and anything that isn't a websocket endpoint → a
 * reason why.
 *
 * **The default scheme depends on where the page came from**, which is the one
 * piece of cleverness here and it earns its place. A bare host normally becomes
 * `wss:`, because the token is a bearer credential and TRD §7.2 puts it over
 * TLS. But `localhost` on a page that is itself being served over plain HTTP is
 * the development setup and nothing else, there is no certificate on either
 * side of it, and defaulting that to `wss:` produces a connection that fails
 * with nothing the browser is willing to explain. Loopback only: a LAN address
 * or a real hostname still gets `wss:`, and plain `ws://` to either is
 * available but has to be typed.
 */
export const parseEndpoint = (
  raw: string,
  page: PageOrigin | undefined = currentPage(),
): ParsedEndpoint => {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { url: null, reason: "Enter the relay's address." };

  const typedScheme = /^[a-z][a-z\d+.-]*:\/\//iu.test(trimmed);
  const securePage = page?.protocol === 'https:';

  let url: URL;
  try {
    url = new URL(typedScheme ? trimmed : `wss://${trimmed}`);
  } catch {
    return { url: null, reason: 'That is not an address.' };
  }

  if (url.protocol === 'http:') url.protocol = 'ws:';
  if (url.protocol === 'https:') url.protocol = 'wss:';
  if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
    return { url: null, reason: 'A relay is reached over ws:// or wss://.' };
  }
  if (url.hostname.length === 0) return { url: null, reason: 'That is not an address.' };

  if (BIND_ANY.test(url.hostname)) {
    return {
      url: null,
      reason: `${url.hostname} is an address to listen on, not one to connect to. Try localhost.`,
    };
  }

  if (!typedScheme && !securePage && LOOPBACK.test(url.hostname)) url.protocol = 'ws:';

  // A browser refuses this outright, and says so only in the console.
  if (securePage && url.protocol === 'ws:') {
    return { url: null, reason: 'A page served over HTTPS cannot open a ws:// connection.' };
  }

  // The room is appended by the provider, so a query or fragment here would end
  // up in the middle of the URL it builds.
  url.search = '';
  url.hash = '';
  return { url: url.toString().replace(/\/+$/u, ''), reason: null };
};

export const normalizeEndpoint = (raw: string, page?: PageOrigin): string | null =>
  parseEndpoint(raw, page).url;

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
 *
 * The exception is `wss://localhost`, where 1006 is nearly always a TLS
 * handshake against a relay that speaks plain `ws`. The browser will not say
 * which of the two it was, and both readings lead to the same advice, so the
 * sentence covers them together rather than guessing.
 */
const closeMessage = (code: number, reason: string, endpoint: string): string | null => {
  if (code === 4401) return 'The relay refused the token.';
  if (code === 4404) return 'The relay does not serve that room.';
  if (code === 4400) return reason || 'The relay rejected the connection.';

  if (code === 1006 && /^wss:\/\/(?:localhost|127\.|\[::1\])/iu.test(endpoint)) {
    return 'Could not reach it. Nothing on localhost usually has a TLS certificate — in development the address is ws://, not wss://.';
  }
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
   * may have been reconfigured or destroyed since — a disconnect before the
   * asynchronously opened session settles is not a rare case.
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

  /** A merge completed, optionally carrying the connection that originated it. */
  const markSynced = (device: TransportDevice | null = null): void => {
    const at = new Date();
    last = { at, from: device?.name ?? null };
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
      onRemoteUpdate: (device) => {
        if (mine !== generation) return;
        markSynced(device);
      },
      onClose: (code, reason) => {
        if (mine !== generation) return;
        error = closeMessage(code, reason, current.endpoint);
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
      // Rejected before anything is stopped: a typo in the endpoint field of a
      // working configuration should be refused, not acted on by taking the
      // connection down and leaving the old settings on screen. The complaint
      // names which field and why — "that is not an endpoint" is true of a
      // dozen different mistakes and helps with none of them.
      const problem = next
        ? (parseEndpoint(next.endpoint ?? '').reason ??
          (normalizeRoom(next.room ?? DEFAULT_ROOM) === null
            ? 'A room name is letters, digits, dots, dashes and underscores.'
            : null))
        : null;
      if (problem) {
        error = problem;
        emit();
        return;
      }

      const normalized = normalizeConfig(next);
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
