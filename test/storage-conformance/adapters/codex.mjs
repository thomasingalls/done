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
  const scope = { slotId: 'probe-slot', principalId: 'probe-principal', workspaceId: name };
  const keyName = `${name}.keys`,
    indexName = `${name}.index`;
  async function keys(create) {
    const keyStore = await c.openKeyStore(keyName);
    if (create) {
      await keyStore.ensurePromptlessSlot(scope.slotId);
      await keyStore.generateGeneration(scope, 1);
    }
    return keyStore;
  }
  return {
    handle,
    recordStore: 'records',
    metaStore: 'meta',
    keyName,
    async open(create, app, transport) {
      const keyStore = await keys(create);
      const options = { keyStore, scope, initialGeneration: 1, trimAfterRecords: 0 };
      try {
        if (app) {
          const store = await c.openStore({
            store: handle,
            encrypted: options,
            openWebsocket: transport,
          });
          return {
            ...store,
            doc: store.doc,
            close() {
              store.destroy();
              keyStore.close();
            },
          };
        }
        const doc = new c.Y.Doc();
        const local = await c.openEncryptedContentStore(doc, handle, options);
        return {
          doc,
          local,
          writeMap(key, value) {
            // This candidate's public local-input API consumes an update, not
            // a mutation of the persistence doc (which it classifies as receive).
            const input = new c.Y.Doc();
            c.Y.applyUpdate(input, c.Y.encodeStateAsUpdate(doc));
            input.on('update', (update) => local.admitUpdate(update, { fixtureInput: true }));
            input.getMap('probe').set(key, value);
            input.destroy();
          },
          close() {
            local.destroy();
            doc.destroy();
            keyStore.close();
          },
        };
      } catch (error) {
        keyStore.close();
        if (
          error instanceof c.ContentStoreError ||
          error instanceof c.KeyStoreError ||
          error instanceof c.JournalError
        )
          throw new KnownRefusal(error.code, error.message);
        throw error;
      }
    },
    async clear() {
      const keyStore = await keys(false);
      const index = await c.openSlotIndex(indexName, { keyStore });
      try {
        await seedIndex(indexName, scope.slotId, scope.principalId, name, handle.dbName);
        await index.removeSlot(scope.slotId);
      } finally {
        index.close();
        keyStore.close();
      }
    },
    openDefault: () =>
      c.openStore({ startup: { keyStoreName: keyName, slotIndexName: indexName } }),
  };
}
