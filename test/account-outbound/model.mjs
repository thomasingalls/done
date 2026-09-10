/** Preparation model, NOT a storage implementation. Each named commit is one proposed atomic write.
 * Volatile seal permission and bytes disappear at crash; the external oracle counts actual seals.
 */
export function model(limit = 12, faults = {}) {
  let disk = { next: 1, generation: 1, seals: { 1: 0 }, intents: [], rows: [] };
  let permission, minted;
  const oracle = { acknowledged: [], invocations: {}, sent: [], commits: [] };
  const clone = (value) => structuredClone(value);
  const row = () => disk.rows.find((r) => !r.bytes);
  const commit = (name, change) => {
    const next = clone(disk);
    change(next);
    disk = next;
    oracle.commits.push(name);
  };
  return {
    disk: () => clone(disk),
    oracle,
    accept(id, source = 'local', actor = 'human') {
      // Proposed capsule is the admission carrier, not a second asynchronous write.
      if (!faults.listenerGap) commit('admit', (d) => d.intents.push({ id, source, actor }));
      oracle.acknowledged.push({ id, source, actor });
    },
    reserve() {
      if (row()) return;
      const captured = new Set(disk.rows.flatMap((r) => r.intents.map((i) => i.id)));
      const pending = disk.intents.filter((i) => i.source === 'local' && !captured.has(i.id));
      if (!pending.length) return;
      const batch = pending.filter((i) => i.actor === pending[0].actor).slice(0, 3);
      commit('reserve-position-and-capture', (d) => {
        const position = d.next++;
        if (!faults.counterOnly) d.rows.push({ position, intents: batch, bytes: null });
      });
    },
    reserveSeal() {
      const r = row();
      if (!r || permission || minted) return;
      const gen = disk.generation;
      if (disk.seals[gen] + 1 >= limit) return;
      commit('reserve-seal-attempt', (d) => {
        d.seals[gen]++;
      });
      permission = { position: r.position, gen };
    },
    seal() {
      if (!permission || minted) return;
      const { position, gen } = permission;
      permission = undefined; // consumed BEFORE the invocation, never restored from a durable grant.
      oracle.invocations[gen] = (oracle.invocations[gen] ?? 0) + 1;
      minted = { position, gen, bytes: `${position}/${gen}/${oracle.invocations[gen]}` };
    },
    persist() {
      if (!minted) return;
      if (minted.gen !== disk.generation) {
        minted = undefined;
        return;
      }
      const prepared = minted;
      commit('persist-exact-envelope', (d) => {
        const r = d.rows.find((r) => r.position === prepared.position);
        if (!r || r.bytes) throw Error('Invalid promote');
        r.bytes = prepared.bytes;
      });
      minted = undefined;
    },
    send() {
      const ready = disk.rows.filter((r) => r.bytes);
      const r = ready[oracle.sent.length % ready.length];
      if (r) oracle.sent.push({ position: r.position, bytes: r.bytes });
      else if (faults.sendEarly && minted) oracle.sent.push({ ...minted });
    },
    crash() {
      permission = undefined;
      minted = undefined;
    },
    compact() {
      // Proposed outbox capsules survive document compaction until exact capture is durable.
      const captured = new Set(disk.rows.flatMap((r) => r.intents.map((i) => i.id)));
      commit('compact-covered-capsules', (d) => {
        d.intents = d.intents.filter((i) => !captured.has(i.id));
      });
    },
    rotate() {
      commit('model-generation-change', (d) => {
        d.generation++;
        d.seals[d.generation] = 0;
      });
      permission = undefined;
      minted = undefined;
    },
  };
}
/** External oracle: it never infers acknowledged work or actual invocations from durable counters. */
export function violations(m, limit = 12) {
  const disk = m.disk(),
    { oracle } = m,
    errors = [];
  for (const intent of oracle.acknowledged.filter((i) => i.source === 'local')) {
    if (
      ![...disk.intents, ...disk.rows.flatMap((r) => r.intents)].some(
        (i) => i.id === intent.id && i.actor === intent.actor && i.source === intent.source,
      )
    )
      errors.push('lost-admission');
  }
  if (
    disk.rows.some((r) =>
      r.intents.some((i) => i.source !== 'local' || i.actor !== r.intents[0].actor),
    )
  )
    errors.push('reattribution');
  if (disk.rows.length !== disk.next - 1 || disk.rows.some((r, i) => r.position !== i + 1))
    errors.push('position-gap');
  for (const [gen, invocations] of Object.entries(oracle.invocations)) {
    if (invocations > disk.seals[gen] || disk.seals[gen] >= limit) errors.push('undercounted-seal');
  }
  for (const sent of oracle.sent) {
    if (disk.rows.find((r) => r.position === sent.position)?.bytes !== sent.bytes)
      errors.push('changed-retry');
  }
  return [...new Set(errors)];
}
