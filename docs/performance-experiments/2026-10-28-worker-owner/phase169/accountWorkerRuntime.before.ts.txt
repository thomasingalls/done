/** Fixed dedicated-worker environment. No Window installer, lock-manager override or storage shim. */
import { createAccountWorkerJoin, type AccountWorkerTicket } from './accountWorkerCohort';
import type { WorkerChannel } from './workerChannel';
import { WorkerChannelError } from './workerChannel';
import type { RawJournalSnapshot, RawJournalPage, RawJournalRemoval } from './windowJournalBridge';
import { RAW_JOURNAL_REMOVE_ITEMS } from './windowJournalBridge';

export interface WorkerActivity {
  readonly visibility: DocumentVisibilityState;
  readonly online: boolean;
}
let current: ReturnType<typeof installAccountWorkerRuntime> | undefined;
const refused = () => new WorkerChannelError('worker-lifetime');

/** A module-private singleton in a real dedicated worker. Native join still authenticates holders;
 * the ordinary Account owner still authenticates factor, binding, authority and passkey. */
export function installAccountWorkerRuntime(
  ticket: AccountWorkerTicket,
  channel: WorkerChannel,
  initial: WorkerActivity,
) {
  if (
    typeof window !== 'undefined' ||
    typeof globalThis.postMessage !== 'function' ||
    globalThis.isSecureContext !== true ||
    !globalThis.navigator?.locks ||
    current ||
    typeof initial.online !== 'boolean' ||
    !['visible', 'hidden'].includes(initial.visibility)
  )
    throw refused();
  const join = createAccountWorkerJoin(ticket),
    stop = new AbortController(),
    events = new EventTarget();
  let activity = { ...initial },
    opening = true,
    fence: number | undefined;
  const pinned = new Map<string, RawJournalSnapshot>();
  const live = () => {
    if (stop.signal.aborted || channel.closed) throw refused();
  };
  const journal = {
    async read(prefix: string): Promise<RawJournalSnapshot> {
      live();
      const id = await channel.request<number>('journalBegin', { prefix });
      const entries: [string, string][] = [];
      let characters = 0,
        retainedCharacters = 0;
      try {
        for (;;) {
          live();
          const page = await channel.request<RawJournalPage>('journalPage', { id });
          live();
          if (
            !Array.isArray(page.entries) ||
            typeof page.done !== 'boolean' ||
            !Number.isSafeInteger(page.characters) ||
            page.characters < 0
          )
            throw refused();
          for (const pair of page.entries) {
            if (
              !Array.isArray(pair) ||
              pair.length !== 2 ||
              typeof pair[0] !== 'string' ||
              !pair[0].startsWith(prefix) ||
              typeof pair[1] !== 'string'
            )
              throw refused();
            entries.push([pair[0], pair[1]]);
            retainedCharacters += pair[0].length + pair[1].length;
          }
          if (entries.length > 65536 || retainedCharacters > 16 * 1024 * 1024) throw refused();
          characters = page.characters;
          if (page.done) break;
        }
        const value = { entries, characters };
        if (opening || fence !== undefined) pinned.set(prefix, value);
        return value;
      } finally {
        if (!channel.closed) await channel.request('journalFinish', { id }).catch(() => {});
      }
    },
    /** Synchronous checks require this incarnation's current opening or Window FIFO reservation.
     * A snapshot retained after that reservation ends cannot authorize a later effect. */
    pinned(prefix: string): RawJournalSnapshot {
      live();
      if (!opening && fence === undefined) throw refused();
      const value = pinned.get(prefix);
      if (!value) throw refused();
      return value;
    },
    async remove(
      prefix: string,
      entries: readonly (readonly [string, string])[],
    ): Promise<RawJournalRemoval> {
      live();
      const result = { removed: 0, changed: 0, retained: 0 };
      for (let i = 0; i < entries.length; i += RAW_JOURNAL_REMOVE_ITEMS) {
        const next = await channel.request<RawJournalRemoval>('journalRemove', {
          prefix,
          entries: entries.slice(i, i + RAW_JOURNAL_REMOVE_ITEMS),
        });
        live();
        if (
          Object.values(next).some((n) => !Number.isSafeInteger(n) || n < 0) ||
          next.removed + next.changed + next.retained >
            Math.min(RAW_JOURNAL_REMOVE_ITEMS, entries.length - i)
        )
          throw refused();
        result.removed += next.removed;
        result.changed += next.changed;
        result.retained += next.retained;
      }
      if (opening || fence !== undefined) await journal.read(prefix);
      return result;
    },
  };
  const runtime = Object.freeze({
    ticket: Object.freeze({ ...ticket }),
    join,
    signal: stop.signal,
    events,
    journal,
    assertCurrent: live,
    get activity() {
      return activity;
    },
    update(input: WorkerActivity, kind: string) {
      live();
      if (
        typeof input.online !== 'boolean' ||
        !['visible', 'hidden'].includes(input.visibility) ||
        ![
          'visibilitychange',
          'keydown',
          'beforeinput',
          'pointerdown',
          'freeze',
          'resume',
          'online',
          'offline',
          'pageshow',
          'pagehide',
        ].includes(kind)
      )
        throw refused();
      activity = { ...input };
      events.dispatchEvent(new Event(kind));
    },
    finishOpening() {
      live();
      opening = false;
      pinned.clear();
    },
    async withFence<T>(id: number, prefix: string, operation: () => Promise<T>): Promise<T> {
      live();
      if (opening || fence !== undefined || !Number.isSafeInteger(id) || id < 1) throw refused();
      fence = id;
      try {
        await journal.read(prefix);
        live();
        return await operation();
      } finally {
        fence = undefined;
        pinned.clear();
      }
    },
    close() {
      if (stop.signal.aborted) return;
      stop.abort();
      events.dispatchEvent(new Event('pagehide'));
      pinned.clear();
    },
  });
  current = runtime;
  return runtime;
}
export function accountWorkerRuntime(slotId?: string) {
  if (!current) return;
  current.assertCurrent();
  if (slotId !== undefined && current.ticket.slotId !== slotId) throw refused();
  return current;
}
