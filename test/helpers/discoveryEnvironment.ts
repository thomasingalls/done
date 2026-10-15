import { vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';

/** Unit wiring only; native compatibility tests exercise actual Web Lock exclusion. */
export function installDiscoveryEnvironment() {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('navigator', {
    locks: {
      request: async (_name: string, _options: unknown, work: () => Promise<unknown>) => work(),
    },
  });
}
