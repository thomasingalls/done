/**
 * Sync (TRD §7.1, §11 "sync-absent").
 *
 * Two things are being kept honest here, and the second matters more than the
 * first:
 *
 * 1. The controller's states are the four §7.1 names and nothing else, and the
 *    transitions between them are driven by the transport rather than guessed.
 * 2. **Nothing is constructed until an endpoint is configured**, and an app
 *    with no configuration behaves exactly as it did before sync existed. Every
 *    other test file in this suite runs in that state, so this is the one that
 *    says so out loud.
 *
 * The transport is injected. A test that opened real websockets would be
 * testing `ws` and a network; the relay's own suite (`relay/test/`) does the
 * end-to-end version against the real process.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  Awareness,
  DEFAULT_ROOM,
  SYNC_KEYS,
  Y,
  createSync,
  describeSyncAge,
  disabledSync,
  normalizeEndpoint,
  normalizeRoom,
  parseEndpoint,
  openStore,
  readSyncConfig,
  transact,
  type OpenWebsocket,
  type WebsocketOptions,
} from '../src/crdt';

/**
 * A transport that records what it was asked for and hands the test the
 * callbacks, so a socket's whole life can be played out in a few lines.
 */
interface Opened {
  options: WebsocketOptions;
  destroyed: boolean;
  connects: number;
  disconnects: number;
}

const transport = (): { open: OpenWebsocket; opened: Opened[] } => {
  const opened: Opened[] = [];
  const open: OpenWebsocket = (options) => {
    const record: Opened = { options, destroyed: false, connects: 0, disconnects: 0 };
    opened.push(record);
    return Promise.resolve({
      connect: () => void record.connects++,
      disconnect: () => void record.disconnects++,
      destroy: () => void (record.destroyed = true),
      setToken: () => {},
    });
  };
  return { open, opened };
};

/** Reads back the callbacks a session was opened with, or says it never was. */
const optionsOf = (record: Opened | undefined): WebsocketOptions => {
  if (!record) throw new Error('the transport was never opened');
  return record.options;
};

const CONFIG = { endpoint: 'wss://relay.example', room: 'done', token: 'secret', enabled: true };

/** The promise `open` returns has to settle before the session is stored. */
const settle = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

beforeEach(() => {
  localStorage.clear();
});

describe('endpoints', () => {
  const secure = { protocol: 'https:' };
  const insecure = { protocol: 'http:' };

  it('defaults a bare host to wss, because the token is a bearer credential', () => {
    expect(normalizeEndpoint('relay.example', secure)).toBe('wss://relay.example');
    expect(normalizeEndpoint('relay.example', insecure)).toBe('wss://relay.example');
    // A LAN address is not loopback and does not get the development default.
    expect(normalizeEndpoint('192.168.1.10:1234', insecure)).toBe('wss://192.168.1.10:1234');
  });

  /**
   * The development case, and the one worth being clever for: a page served
   * over plain HTTP talking to a relay on the same machine. There is no
   * certificate on either side, `wss:` fails with nothing the browser will
   * explain, and this is the shape of every `pnpm dev` session.
   */
  it('defaults bare loopback to ws when the page itself is insecure', () => {
    expect(normalizeEndpoint('localhost:1234', insecure)).toBe('ws://localhost:1234');
    expect(normalizeEndpoint('127.0.0.1:1234', insecure)).toBe('ws://127.0.0.1:1234');
    // Not on a page that is itself secure: that is a deployment, not a laptop.
    expect(normalizeEndpoint('localhost:1234', secure)).toBe('wss://localhost:1234');
    // And never over a scheme that was typed.
    expect(normalizeEndpoint('wss://localhost:1234', insecure)).toBe('wss://localhost:1234');
  });

  it('refuses the address a relay listens on, which is not one to connect to', () => {
    expect(parseEndpoint('wss://0.0.0.0:1234', insecure).reason).toContain('listen on');
    expect(parseEndpoint('0.0.0.0:1234', insecure).url).toBeNull();
    expect(parseEndpoint('[::]:1234', insecure).url).toBeNull();
  });

  it('refuses ws from a page the browser will not allow it from', () => {
    expect(parseEndpoint('ws://relay.example', secure).reason).toContain('HTTPS');
    expect(parseEndpoint('ws://relay.example', insecure).url).toBe('ws://relay.example');
  });

  it('says which mistake was made rather than that one was', () => {
    expect(parseEndpoint('', insecure).reason).toBe("Enter the relay's address.");
    expect(parseEndpoint('ftp://relay.example', insecure).reason).toContain('ws://');
  });

  it('keeps a plain ws endpoint that was asked for explicitly', () => {
    expect(normalizeEndpoint('ws://box.local:1234')).toBe('ws://box.local:1234');
  });

  it('translates the schemes people actually paste', () => {
    expect(normalizeEndpoint('https://relay.example')).toBe('wss://relay.example');
    expect(normalizeEndpoint('http://box.local:1234')).toBe('ws://box.local:1234');
  });

  it('keeps a path prefix and drops a trailing slash, since the room is appended', () => {
    expect(normalizeEndpoint('wss://relay.example/sync/')).toBe('wss://relay.example/sync');
  });

  it('drops a query or fragment, which would end up mid-URL', () => {
    expect(normalizeEndpoint('wss://relay.example?token=leaked')).toBe('wss://relay.example');
  });

  it('refuses what is not an endpoint', () => {
    expect(normalizeEndpoint('')).toBeNull();
    expect(normalizeEndpoint('   ')).toBeNull();
    expect(normalizeEndpoint('file:///etc/passwd')).toBeNull();
    expect(normalizeEndpoint('not a url')).toBeNull();
  });

  it('takes an empty room as the default and refuses one that would need escaping', () => {
    expect(normalizeRoom('')).toBe(DEFAULT_ROOM);
    expect(normalizeRoom('done')).toBe('done');
    expect(normalizeRoom('my notes')).toBeNull();
    expect(normalizeRoom('../etc')).toBeNull();
  });
});

describe('with nothing configured', () => {
  it('is the null provider: disabled, and no transport is constructed', async () => {
    const doc = new Y.Doc();
    const { open, opened } = transport();
    const sync = createSync({ doc, awareness: new Awareness(doc), open });

    await settle();
    expect(sync.status).toBe('disabled');
    expect(sync.lastSyncedAt).toBeNull();
    expect(sync.state.config).toBeNull();
    expect(opened).toHaveLength(0);

    // connect() with nothing to connect to is a no-op, not an error.
    sync.connect();
    await settle();
    expect(opened).toHaveLength(0);

    sync.destroy();
    doc.destroy();
  });

  it('matches the null implementation the rest of the app is written against', () => {
    expect(disabledSync.status).toBe('disabled');
    expect(disabledSync.lastSyncedAt).toBeNull();
    expect(() => {
      disabledSync.connect();
      disabledSync.disconnect();
    }).not.toThrow();
  });
});

describe('the store, sync-absent', () => {
  it('opens, writes and undoes with no provider and no socket', async () => {
    // Not a stand-in for the transport: the point is that the *platform's*
    // socket constructor is never reached, whatever the transport would have
    // done with it. `vi.restoreAllMocks` puts it back.
    const socket = vi.spyOn(globalThis, 'WebSocket');

    const store = await openStore({ persist: false });
    expect(store.sync.status).toBe('disabled');

    transact(store.doc, store.actor.origin, () => store.master.insert(0, 'call the dentist'));
    expect(store.master.toString()).toBe('call the dentist');
    store.undo.undo();
    expect(store.master.toString()).toBe('');

    store.destroy();
    expect(socket).not.toHaveBeenCalled();
  });

  it('never reaches the transport when no endpoint is stored', async () => {
    const { open, opened } = transport();
    const store = await openStore({ persist: false, openWebsocket: open });
    await settle();

    transact(store.doc, store.actor.origin, () => store.master.insert(0, 'anything at all'));
    await settle();

    expect(opened).toHaveLength(0);
    store.destroy();
  });
});

describe('a configured relay', () => {
  it('connects with what was configured, and remembers it', async () => {
    const doc = new Y.Doc();
    const { open, opened } = transport();
    const sync = createSync({ doc, awareness: new Awareness(doc), open });

    sync.configure(CONFIG);
    expect(sync.status).toBe('connecting');
    await settle();

    expect(opened).toHaveLength(1);
    expect(opened[0]?.options.url).toBe('wss://relay.example');
    expect(opened[0]?.options.room).toBe('done');
    expect(opened[0]?.options.token).toBe('secret');
    expect(readSyncConfig()).toEqual(CONFIG);

    sync.destroy();
    doc.destroy();
  });

  it('follows the socket through connected, offline and back', async () => {
    const doc = new Y.Doc();
    const { open, opened } = transport();
    const sync = createSync({ doc, awareness: new Awareness(doc), open });
    sync.configure(CONFIG);
    await settle();

    const options = optionsOf(opened[0]);
    options.onStatus('connected');
    expect(sync.status).toBe('connected');

    options.onStatus('disconnected');
    expect(sync.status).toBe('offline');

    options.onStatus('connecting');
    expect(sync.status).toBe('connecting');

    sync.destroy();
    doc.destroy();
  });

  it('records when a change last arrived, and where from', async () => {
    const doc = new Y.Doc();
    const awareness = new Awareness(doc);
    const { open, opened } = transport();
    const sync = createSync({ doc, awareness, open });
    sync.configure(CONFIG);
    await settle();

    const options = optionsOf(opened[0]);
    options.onSynced(true);
    expect(sync.lastSyncedAt).toBeInstanceOf(Date);
    // Nobody else is connected, so the change came from the relay's own copy.
    expect(sync.state.lastSyncedFrom).toBeNull();

    // What the network does to awareness, done by hand: another device turns up.
    awareness.states.set(4242, { device: { id: 'zz', name: 'Laptop' } });
    awareness.emit('change', [{ added: [4242], updated: [], removed: [] }, 'test']);
    expect(sync.state.peers).toEqual(['Laptop']);

    options.onRemoteUpdate();
    expect(sync.state.lastSyncedFrom).toBe('Laptop');

    sync.destroy();
    doc.destroy();
  });

  it('says so when the relay refuses the token', async () => {
    const doc = new Y.Doc();
    const { open, opened } = transport();
    const sync = createSync({ doc, awareness: new Awareness(doc), open });
    sync.configure(CONFIG);
    await settle();

    const options = optionsOf(opened[0]);
    options.onClose(4401, 'unauthorized');
    expect(sync.state.error).toBe('The relay refused the token.');

    // An ordinary drop is not an error. Offline is the normal state.
    options.onClose(1006, '');
    expect(sync.state.error).toBeNull();

    sync.destroy();
    doc.destroy();
  });

  /**
   * The one drop worth explaining. A browser reports a failed TLS handshake as
   * an ordinary abnormal close, so `wss://localhost` failing looks exactly like
   * being offline — and it is nearly always a relay speaking plain `ws` behind
   * an address that promised otherwise.
   */
  it('explains a wss://localhost that will never connect', async () => {
    const doc = new Y.Doc();
    const { open, opened } = transport();
    const sync = createSync({ doc, awareness: new Awareness(doc), open });
    sync.configure({ ...CONFIG, endpoint: 'wss://localhost:1234' });
    await settle();

    optionsOf(opened[0]).onClose(1006, '');
    expect(sync.state.error).toContain('ws://');

    sync.destroy();
    doc.destroy();
  });

  it('pauses without forgetting, and a paused client opens nothing on start-up', async () => {
    const doc = new Y.Doc();
    const first = transport();
    const sync = createSync({ doc, awareness: new Awareness(doc), open: first.open });
    sync.configure(CONFIG);
    await settle();

    sync.disconnect();
    expect(sync.status).toBe('disabled');
    expect(first.opened[0]?.destroyed).toBe(true);
    expect(readSyncConfig()?.enabled).toBe(false);
    expect(readSyncConfig()?.endpoint).toBe('wss://relay.example');
    sync.destroy();

    const second = transport();
    const resumed = createSync({ doc, awareness: new Awareness(doc), open: second.open });
    await settle();
    expect(second.opened).toHaveLength(0);
    expect(resumed.status).toBe('disabled');

    resumed.connect();
    await settle();
    expect(second.opened).toHaveLength(1);
    expect(readSyncConfig()?.enabled).toBe(true);

    resumed.destroy();
    doc.destroy();
  });

  it('forgets everything, including when it last synced', async () => {
    const doc = new Y.Doc();
    const { open, opened } = transport();
    const sync = createSync({ doc, awareness: new Awareness(doc), open });
    sync.configure(CONFIG);
    await settle();
    optionsOf(opened[0]).onSynced(true);
    expect(sync.lastSyncedAt).not.toBeNull();

    sync.configure(null);
    await settle();
    expect(sync.status).toBe('disabled');
    expect(sync.lastSyncedAt).toBeNull();
    expect(opened[0]?.destroyed).toBe(true);
    expect(localStorage.getItem(SYNC_KEYS.config)).toBeNull();
    expect(localStorage.getItem(SYNC_KEYS.last)).toBeNull();

    sync.destroy();
    doc.destroy();
  });

  it('refuses an endpoint that is not one, and stays disabled', async () => {
    const doc = new Y.Doc();
    const { open, opened } = transport();
    const sync = createSync({ doc, awareness: new Awareness(doc), open });

    sync.configure({ endpoint: 'not a url', room: 'done', token: '', enabled: true });
    await settle();

    expect(sync.status).toBe('disabled');
    expect(sync.state.error).toBe('That is not an address.');
    expect(opened).toHaveLength(0);
    expect(readSyncConfig()).toBeNull();

    sync.destroy();
    doc.destroy();
  });

  it('refuses a bad endpoint without taking a working connection down', async () => {
    const doc = new Y.Doc();
    const { open, opened } = transport();
    const sync = createSync({ doc, awareness: new Awareness(doc), open });
    sync.configure(CONFIG);
    await settle();
    optionsOf(opened[0]).onStatus('connected');

    sync.configure({ endpoint: 'not a url', room: 'done', token: 'secret', enabled: true });
    await settle();

    expect(sync.state.error).toBe('That is not an address.');
    expect(sync.status).toBe('connected');
    expect(opened).toHaveLength(1);
    expect(opened[0]?.destroyed).toBe(false);
    expect(readSyncConfig()).toEqual(CONFIG);

    sync.destroy();
    doc.destroy();
  });

  it('tries again when the network comes back', async () => {
    const doc = new Y.Doc();
    const attempts: number[] = [];
    // The first attempt fails the way a transport fetched with no network
    // fails: the module never arrives, so there is no session to reconnect.
    const open: OpenWebsocket = () => {
      attempts.push(attempts.length);
      return attempts.length === 1
        ? Promise.reject(new Error('offline'))
        : Promise.resolve({
            connect: () => {},
            disconnect: () => {},
            destroy: () => {},
            setToken: () => {},
          });
    };

    const sync = createSync({ doc, awareness: new Awareness(doc), open });
    sync.configure(CONFIG);
    await settle();
    expect(sync.status).toBe('offline');
    expect(attempts).toHaveLength(1);

    window.dispatchEvent(new Event('online'));
    await settle();
    expect(attempts).toHaveLength(2);

    sync.destroy();
    doc.destroy();
  });

  it('drops a session that resolved after the controller moved on', async () => {
    const doc = new Y.Doc();
    const { open, opened } = transport();
    const sync = createSync({ doc, awareness: new Awareness(doc), open });

    // Configure and forget within the same tick: the transport is mid-import,
    // which is what leaving the menu quickly looks like.
    sync.configure(CONFIG);
    sync.configure(null);
    await settle();

    expect(opened).toHaveLength(1);
    expect(opened[0]?.destroyed).toBe(true);
    expect(sync.status).toBe('disabled');

    sync.destroy();
    doc.destroy();
  });

  it('tells subscribers, and stops when they go', async () => {
    const doc = new Y.Doc();
    const { open, opened } = transport();
    const sync = createSync({ doc, awareness: new Awareness(doc), open });

    let notifications = 0;
    const unsubscribe = sync.subscribe(() => void notifications++);
    const before = sync.state;

    sync.configure(CONFIG);
    await settle();
    optionsOf(opened[0]).onStatus('connected');

    expect(notifications).toBeGreaterThan(0);
    // A new object every change, and a stable one between them: what
    // useSyncExternalStore requires.
    expect(sync.state).not.toBe(before);
    expect(sync.state).toBe(sync.state);

    unsubscribe();
    const quiet = notifications;
    optionsOf(opened[0]).onStatus('disconnected');
    expect(notifications).toBe(quiet);

    sync.destroy();
    doc.destroy();
  });

  it('destroys the session and leaves the document alone', async () => {
    const doc = new Y.Doc();
    const { open, opened } = transport();
    const sync = createSync({ doc, awareness: new Awareness(doc), open });
    sync.configure(CONFIG);
    await settle();

    sync.destroy();
    expect(opened[0]?.destroyed).toBe(true);

    doc.getText('master').insert(0, 'still writable');
    expect(doc.getText('master').toString()).toBe('still writable');
    doc.destroy();
  });
});

describe('how long ago', () => {
  const at = new Date('2026-08-05T12:00:00Z');
  const after = (minutes: number): Date => new Date(at.getTime() + minutes * 60_000);

  it('is deliberately coarse', () => {
    expect(describeSyncAge(null)).toBe('never');
    expect(describeSyncAge(at, after(1))).toBe('just now');
    expect(describeSyncAge(at, after(20))).toBe('20 minutes ago');
    expect(describeSyncAge(at, after(65))).toBe('an hour ago');
    expect(describeSyncAge(at, after(60 * 5))).toBe('5 hours ago');
    expect(describeSyncAge(at, after(60 * 26))).toBe('yesterday');
    expect(describeSyncAge(at, after(60 * 24 * 4))).toBe('4 days ago');
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
