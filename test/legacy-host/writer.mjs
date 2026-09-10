// These imports are redirected to the pinned predecessor source by the fixture build.
import { openLocalStore, LEGACY_STORE } from '@predecessor/persistence';
import { Y } from '@predecessor/yjs';
let local, doc;
window.writerFixture = {
  async open() {
    doc = new Y.Doc();
    local = openLocalStore(doc, LEGACY_STORE);
    await local.whenSynced;
    return doc.getText('master').toString();
  },
  edit(text, volatile = false) {
    const set = Storage.prototype.setItem,
      transaction = IDBDatabase.prototype.transaction;
    if (volatile) {
      Storage.prototype.setItem = function (key, ...args) {
        if (key.startsWith('done.pending-update.done.'))
          throw new DOMException('seeded quota', 'QuotaExceededError');
        return set.call(this, key, ...args);
      };
      IDBDatabase.prototype.transaction = function (...args) {
        if (args[1] === 'readwrite')
          throw new DOMException('seeded write refusal', 'QuotaExceededError');
        return transaction.apply(this, args);
      };
    }
    try {
      doc.getText('master').insert(doc.getText('master').length, text);
    } catch (error) {
      // The predecessor provider may throw after mutating the document; the test measures that gap.
      if (!volatile || error.name !== 'QuotaExceededError') throw error;
    }
    const visible = doc.getText('master').toString();
    if (volatile) {
      local.destroy();
      doc.destroy();
      Storage.prototype.setItem = set;
      IDBDatabase.prototype.transaction = transaction;
    }
    return visible;
  },
  durable: () => local.whenDurable(),
  close: () => {
    local.destroy();
    doc.destroy();
  },
};
