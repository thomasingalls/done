// Installed only in disposable diagnostic contexts. No arguments, values or database names retained.
(() => {
  const costs = {};
  const add = (name, ms) => {
    const row = (costs[name] ??= { calls: 0, totalMs: 0, maxMs: 0 });
    row.calls++;
    row.totalMs += ms;
    row.maxMs = Math.max(row.maxMs, ms);
  };
  const start = (name) => {
    const at = performance.now();
    return () => add(name, performance.now() - at);
  };
  Object.defineProperty(window, '__attribution', {
    value: { start, read: () => structuredClone(costs) },
  });
  for (const name of [
    'sign',
    'verify',
    'digest',
    'encrypt',
    'decrypt',
    'importKey',
    'deriveKey',
    'deriveBits',
  ]) {
    const original = SubtleCrypto.prototype[name];
    SubtleCrypto.prototype[name] = function (...args) {
      const end = start('crypto.' + name);
      try {
        return original.apply(this, args).finally(end);
      } catch (cause) {
        end();
        throw cause;
      }
    };
  }
  const original = IDBDatabase.prototype.transaction;
  IDBDatabase.prototype.transaction = function (...args) {
    const transaction = original.apply(this, args);
    const end = start('transaction.' + transaction.mode);
    transaction.addEventListener('complete', end, { once: true });
    transaction.addEventListener('abort', end, { once: true });
    return transaction;
  };
})();
