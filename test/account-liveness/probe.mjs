/** Count-only metadata; never records arguments, keys or writing. Durations are inclusive. */
export function installProbe(target = globalThis) {
  let enabled = false,
    active = 0,
    rows = {},
    events = [];
  const start = (name, size = 0) => {
    if (!enabled) return undefined;
    const at = performance.now();
    active++;
    const row = (rows[name] ??= { calls: 0, milliseconds: 0, size: 0 });
    row.calls++;
    row.size += Number.isFinite(size) ? size : 0;
    let ended = false;
    return () => {
      if (ended) throw Error('Probe span ended twice');
      ended = true;
      active--;
      row.milliseconds += performance.now() - at;
    };
  };
  const restore = [];
  target.livenessProbe = {
    start,
    reset() {
      if (active) throw Error('Cannot reset an active measurement');
      rows = {};
      events = [];
      enabled = true;
    },
    stop() {
      if (active) throw Error('Cannot stop an active measurement');
      enabled = false;
      return { rows: structuredClone(rows), events: structuredClone(events) };
    },
    event(name) {
      if (enabled) events.push({ name, at: performance.now() });
    },
    restoreCrypto() {
      for (const restoreMethod of restore) restoreMethod();
    },
  };
  for (const name of ['sign', 'verify', 'encrypt', 'decrypt', 'digest', 'deriveBits']) {
    const method = target.crypto.subtle[name];
    const original = method.bind(target.crypto.subtle);
    restore.push(() => {
      target.crypto.subtle[name] = method;
    });
    target.crypto.subtle[name] = async (...args) => {
      const end = start('crypto.' + name);
      try {
        return await original(...args);
      } finally {
        end?.();
      }
    };
  }
  return target.livenessProbe;
}
