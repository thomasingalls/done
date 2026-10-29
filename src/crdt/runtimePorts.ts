/** Environment endpoints only: no keys, proofs, admission or configurable ownership policy. */
export interface RuntimeActivityPort {
  visibilityState(): DocumentVisibilityState;
  onDocument(kind: 'visibilitychange' | 'freeze' | 'resume', listener: () => void): () => void;
  onPageShow(listener: () => void): () => void;
}

export interface RuntimeLifetimePort {
  requireLocks(): LockManager;
  onPageHide(listener: () => void): () => void;
  onRetirement(slotId: string, listener: () => void): () => void;
  requestRetirement(slotId: string): void;
}

export interface RuntimeJournalPort {
  /** Resolve on every call. A captured storage view cannot authorize a later journal write. */
  storage(): Storage;
  onStorage(listener: (event: StorageEvent) => void): () => void;
}

export interface RuntimePorts {
  readonly activity: RuntimeActivityPort;
  readonly lifetime: RuntimeLifetimePort;
  readonly journal: RuntimeJournalPort;
}

const retirementChannel = 'done/slot-lifecycle';

/** Fixed page adapter. There is deliberately no setter or caller-supplied runtime option.
 * Future worker execution needs a separately reviewed owner, not a substitute lock manager. */
export const pageRuntimePorts: RuntimePorts = Object.freeze({
  activity: Object.freeze({
    visibilityState: () => document.visibilityState,
    onDocument(kind, listener) {
      const target = document;
      target.addEventListener(kind, listener);
      return () => target.removeEventListener(kind, listener);
    },
    onPageShow(listener) {
      const target = window;
      target.addEventListener('pageshow', listener);
      return () => target.removeEventListener('pageshow', listener);
    },
  } satisfies RuntimeActivityPort),
  lifetime: Object.freeze({
    requireLocks() {
      if (globalThis.isSecureContext !== true || !globalThis.navigator?.locks)
        throw new Error('Web Locks requires a supported secure context.');
      return globalThis.navigator.locks;
    },
    onPageHide(listener) {
      globalThis.addEventListener?.('pagehide', listener, { once: true });
      return () => globalThis.removeEventListener?.('pagehide', listener);
    },
    onRetirement(slotId, listener) {
      if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return () => {};
      const channel = new BroadcastChannel(retirementChannel);
      channel.onmessage = (event) => {
        if (event.data?.kind === 'retire' && event.data?.slotId === slotId) listener();
      };
      return () => channel.close();
    },
    requestRetirement(slotId) {
      if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return;
      const channel = new BroadcastChannel(retirementChannel);
      channel.postMessage({ kind: 'retire', slotId });
      channel.close();
    },
  } satisfies RuntimeLifetimePort),
  journal: Object.freeze({
    storage: () => globalThis.localStorage,
    onStorage(listener) {
      globalThis.addEventListener?.('storage', listener);
      return () => globalThis.removeEventListener?.('storage', listener);
    },
  } satisfies RuntimeJournalPort),
});
