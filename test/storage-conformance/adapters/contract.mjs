import * as c from '@candidate/crdt/index.ts';
import { KnownRefusal, seedIndex } from '../platform.mjs';
export { c };
export const paths = [
  'src/crdt/index.ts',
  'src/crdt/contentStore.ts',
  'src/crdt/keyStore.ts',
  'src/crdt/slotIndex.ts',
  'src/editor/createEditor.ts',
];
export async function fixture(name) {
  const handle = c.storeHandle(await c.deriveStoreName('probe-principal', name));
  const identity = { principal: 'probe-principal', workspace: name, handle };
  return {
    handle,
    recordStore: 'content',
    metaStore: 'store-meta',
    keyName: handle.dbName,
    async open(_create, app, transport) {
      if (app) {
        try {
          const store = await c.openStore({ identity, openWebsocket: transport });
          return { ...store, close: () => store.destroy() };
        } catch (error) {
          if (error instanceof c.StoreRefused) throw new KnownRefusal(error.refusal, error.message);
          throw error;
        }
      }
      const doc = new c.Y.Doc();
      const result = await c.openEncryptedStore(doc, identity);
      if (!result.opened) {
        doc.destroy();
        throw new KnownRefusal(result.refusal);
      }
      return {
        doc,
        local: result.store,
        close() {
          result.store.destroy();
          doc.destroy();
        },
      };
    },
    async clear() {
      const indexName = `${name}.index`;
      const index = await c.openSlotIndex(indexName);
      try {
        await seedIndex(indexName, 'probe-slot', identity.principal, name, handle.dbName);
        await index.removeSlot('probe-slot');
      } finally {
        index.close();
      }
    },
    openDefault: () => c.openStore(),
  };
}
