import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';

// Node 26 exposes an unusable `localStorage` placeholder unless it receives a
// CLI file flag, and that placeholder prevents jsdom from installing its own.
// A small standards-shaped in-memory store is sufficient for actor/device
// identity tests and keeps the documented `pnpm test` command version-agnostic.
if (Number(process.versions.node.split('.')[0]) >= 26) {
  const entries = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return entries.size;
    },
    clear: () => entries.clear(),
    getItem: (key) => entries.get(key) ?? null,
    key: (index) => [...entries.keys()][index] ?? null,
    removeItem: (key) => void entries.delete(key),
    setItem: (key, value) => void entries.set(key, value),
  };
  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    configurable: true,
  });
}

if (!globalThis.crypto?.getRandomValues) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}
