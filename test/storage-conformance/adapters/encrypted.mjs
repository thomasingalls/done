import * as c from '@candidate/crdt/index.ts';
import { KnownRefusal } from '../platform.mjs';
export { c };
export const paths = [
  'src/crdt/index.ts',
  'src/crdt/encryptedPersistence.ts',
  'src/crdt/encryptedStore.ts',
  'src/crdt/keys.ts',
  'src/editor/createEditor.ts',
];
export async function fixture(name) {
  const handle = c.storeHandle(await c.deriveStoreName('probe-principal', name));
  const identity = { principal: 'probe-principal', workspace: name },
    slot = 'probe-slot';
  const keyName = `${name}.keys`;
  async function keys(create) {
    const store = await c.openKeyStore(keyName);
    if (create) {
      await store.ensureSlot(slot);
      await store.createGeneration(slot, identity, 1);
    }
    return store;
  }
  return {
    handle,
    recordStore: 'updates',
    metaStore: 'meta',
    keyName,
    async open(create, app, transport) {
      const keyStore = await keys(create);
      const config = { handle, identity, keys: keyStore, slot };
      try {
        if (app) {
          const store = await c.openStore({
            encrypted: { ...config, options: { trimThreshold: 100000 } },
            openWebsocket: transport,
          });
          return {
            ...store,
            close() {
              store.destroy();
              keyStore.close();
            },
          };
        }
        const doc = new c.Y.Doc();
        const local = await c.openEncryptedLocalStore(doc, config, { trimThreshold: 100000 });
        return {
          doc,
          local,
          close() {
            local.destroy();
            doc.destroy();
            keyStore.close();
          },
        };
      } catch (error) {
        keyStore.close();
        // Exact existing candidate refusal, recorded as untyped. This is not
        // an adapter inventing a successful repair-required result.
        if (
          error.message === `${handle.dbName} has no store metadata; it is not an encrypted store.`
        )
          throw new KnownRefusal('missing-store-metadata', error.message, false);
        throw error;
      }
    },
    async clear() {
      const keyStore = await keys(false);
      try {
        await c.clearEncryptedWorkspace(handle, keyStore, slot, identity);
      } finally {
        keyStore.close();
      }
    },
    openDefault: () => c.openStore(),
  };
}
