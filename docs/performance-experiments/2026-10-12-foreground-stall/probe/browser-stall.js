// Disposable diagnostics only. Closed labels/numeric spans; no inspected values or arguments.
(() => {
  let spans = [],
    counts = {},
    dropped = 0;
  const measure = (name, began) => {
    const end = performance.now();
    counts[name] = (counts[name] ?? 0) + 1;
    if (end - began < 2) return;
    if (spans.length >= 50000) {
      dropped++;
      return;
    }
    spans.push({ name, at: performance.timeOrigin + began, ms: end - began });
  };
  Object.defineProperty(globalThis, '__stall', {
    value: {
      start: (name) => {
        const at = performance.now();
        if (name === 'accountReceive.ts.checkFull' && globalThis.__stallArmed)
          void globalThis.__auditStarted?.();
        return () => measure(name, at);
      },
      measure,
      reset: () => {
        spans = [];
        counts = {};
        dropped = 0;
      },
      read: () => ({ spans: spans.map((s) => ({ ...s })), counts: { ...counts }, dropped }),
    },
  });
  const clone = globalThis.structuredClone;
  globalThis.structuredClone = (...args) => {
    const done = globalThis.__stall.start('structuredClone');
    try {
      return clone(...args);
    } finally {
      done();
    }
  };
})();
