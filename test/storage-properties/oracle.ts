import { Y } from '../../src/crdt/yjs';

export interface Edit {
  lane: number;
  actor?: number;
  at: number;
  text: string;
  remove: number;
}
export interface Source {
  updates: number[][];
  final: string[];
}
export class PropertyViolation extends Error {
  constructor(
    readonly invariant: string,
    readonly actual: unknown,
    readonly expected: unknown,
  ) {
    super(`${invariant}: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`);
  }
}
export const equal = (id: string, actual: unknown, expected: unknown) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new PropertyViolation(id, actual, expected);
};

/** Source bytes and the string model never read the carrier or its compaction receipts. */
export function makeSource(edits: Edit[]): Source {
  const docs = [0, 1, 2].map((lane) => {
    const d = new Y.Doc({ gc: false });
    d.clientID = 101 + lane;
    return d;
  });
  const result: Source = { updates: [], final: ['', '', ''] };
  try {
    docs.forEach((d) =>
      d.on('update', (u: Uint8Array, origin: unknown) => {
        if (origin === 'source-edit') result.updates.push(Array.from(u));
      }),
    );
    // Nonempty sources keep the schedule alphabet total, including after shrinking all edits away.
    const history: Edit[] = [
      ...docs.map((_, lane) => ({ lane, at: 0, text: `base${lane}`, remove: 0 })),
      ...edits,
    ];
    for (const edit of history) {
      const lane = edit.lane % docs.length,
        d = docs[(edit.actor ?? lane) % docs.length]!,
        prior = result.final[lane]!,
        at = edit.at % (prior.length + 1),
        remove = Math.min(edit.remove, prior.length - at);
      result.final[lane] = prior.slice(0, at) + edit.text + prior.slice(at + remove);
      const beforeUpdates = result.updates.length;
      d.transact(() => {
        const text = d.getText(`lane${lane}`);
        if (remove) text.delete(at, remove);
        if (edit.text) text.insert(at, edit.text);
      }, 'source-edit');
      if (result.updates.length > beforeUpdates)
        for (const peer of docs) {
          if (peer !== d) Y.applyUpdate(peer, new Uint8Array(result.updates.at(-1)!));
        }
      equal('source-string-model', d.getText(`lane${lane}`).toString(), result.final[lane]);
    }
    return result;
  } finally {
    docs.forEach((d) => d.destroy());
  }
}

const view = (d: Y.Doc) => [0, 1, 2].map((i) => d.getText(`lane${i}`).toString());
const vector = (d: Y.Doc) =>
  [...Y.decodeStateVector(Y.encodeStateVector(d))].sort(([a], [b]) => a - b);

/** Normalize generated text structs and deletion ranges without applying or merging them. */
const wireInventory = (updates: readonly Uint8Array[]) => {
  const structs = new Map<string, unknown>(),
    deletions = new Set<string>();
  for (const u of updates) {
    const decoded = Y.decodeUpdate(u);
    for (const s of decoded.structs) {
      if (s instanceof Y.Skip) continue;
      const values = s instanceof Y.Item ? s.content.getContent() : [];
      for (let i = 0; i < s.length; i++)
        structs.set(`${s.id.client}:${s.id.clock + i}`, values[i] ?? null);
    }
    for (const [client, ranges] of decoded.ds.clients)
      for (const r of ranges)
        for (let i = 0; i < r.len; i++) deletions.add(`${client}:${r.clock + i}`);
  }
  return {
    structs: [...structs].sort(([a], [b]) => a.localeCompare(b)),
    deletions: [...deletions].sort(),
  };
};

/**
 * Acknowledged IDs are an external operation ledger, never a disk-derived coverage set.
 * Wire inventory always checks pending structs and deletion sets. Visibility is compared when
 * the expected dependency set integrates completely; incomplete Yjs integration can differ by
 * batching/order despite identical wire coverage. Missing source updates are then delivered;
 * the final fully supplied history must match the independent plain string model.
 * Yjs is shared for wire semantics, so this is a storage oracle, not independent CRDT validation.
 */
export function checkRecovery(source: Source, accepted: number[], recovered: Uint8Array[]): number {
  const actual = new Y.Doc({ gc: false }),
    expected = new Y.Doc({ gc: false }),
    acknowledged = new Set(accepted);
  let comparisons = 0;
  const check = () => {
    if (expected.store.pendingStructs || expected.store.pendingDs) return;
    equal('recovery-visible', view(actual), view(expected));
    equal('recovery-structs', vector(actual), vector(expected));
    comparisons += 2;
  };
  try {
    const original = [...acknowledged].map((id) => new Uint8Array(source.updates[id]!));
    const a = wireInventory(recovered),
      b = wireInventory(original);
    equal('recovery-wire-structs', a.structs, b.structs);
    equal('recovery-wire-deletions', a.deletions, b.deletions);
    comparisons += 2;
    for (const u of original) Y.applyUpdate(expected, u);
    for (const u of recovered) Y.applyUpdate(actual, u);
    check();
    source.updates.forEach((bytes, id) => {
      if (acknowledged.has(id)) return;
      Y.applyUpdate(actual, new Uint8Array(bytes));
      Y.applyUpdate(expected, new Uint8Array(bytes));
      check();
    });
    equal('recovery-string-model', view(actual), source.final);
    return comparisons + 1;
  } finally {
    actual.destroy();
    expected.destroy();
  }
}
