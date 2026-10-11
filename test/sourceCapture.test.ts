// @vitest-environment node
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { Y, createDoc, applyUpdate, sameDocState } from '../src/crdt/yjs';
import {
  encodeSourceCapsule,
  decodeSourceCapsule,
  capturedRecovery,
  captureCatalog,
  eraseCapsule,
  MAX_CAPTURE_BYTES,
  type CaptureRoute,
  type SourceCapsule,
} from '../src/crdt/sourceCapture';
import type { Bytes } from '../src/crdt/custodyCrypto';
import type { OpenedRecord } from '../src/crdt/contentRecord';
import { prepareIntent, cloneDocument } from '../src/crdt/admissionDocument';
import { createAdmissionOwner } from '../src/crdt/admissionQueue';
import { MAX_JOURNAL_UPDATE, type JournalSession } from '../src/crdt/custody';
import { createAdmittedWorkspace } from '../src/crdt/admittedWorkspace';
const route: CaptureRoute = {
  workspace: '01'.repeat(16),
  principal: '02'.repeat(16),
  credential: '03'.repeat(16),
  epoch: 1,
  generation: 1,
};
const capsule = (id: number, bytes = new Uint8Array([0, 0]), system = false): SourceCapsule => ({
  ...route,
  v: 1,
  id: id.toString(16).padStart(32, '0'),
  sources: [
    { actor: system ? 'system' : route.principal, kind: system ? 'system' : 'human', bytes },
  ],
});
const row = (seq: number, kind: OpenedRecord['kind'], bytes: Bytes): OpenedRecord => ({
  seq,
  gen: 1,
  kind,
  bytes,
});
const wire = (s: string) => new TextEncoder().encode(s);
const transaction = (d: Y.Doc, fn: () => void) => {
  let bytes!: Bytes;
  const capture = (b: Uint8Array) => (bytes = new Uint8Array(b));
  d.on('update', capture);
  try {
    d.transact(fn);
    return bytes;
  } finally {
    d.off('update', capture);
  }
};

describe('Account source capsule conformance', () => {
  it('250 generated transaction histories recover exact bytes, actors and independent text across carrier overlap and reverse delivery', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            text: fc.constantFrom('a', 'é', '🙂', 'xyz'),
            cut: fc.boolean(),
            system: fc.boolean(),
            disk: fc.boolean(),
            overlap: fc.boolean(),
          }),
          { minLength: 2, maxLength: 24 },
        ),
        (history) => {
          const d = createDoc(),
            recovered = createDoc(),
            records: OpenedRecord[] = [],
            journal: { key: string; generation: number; bytes: Bytes }[] = [],
            original: SourceCapsule[] = [];
          let expected = '';
          try {
            history.forEach((s, i) => {
              const n = s.cut ? (Array.from(expected)[0]?.length ?? 0) : 0;
              const bytes = transaction(d, () => {
                const t = d.getText('oracle');
                if (n) t.delete(0, n);
                t.insert(0, s.text);
              });
              expected = s.text + expected.slice(n);
              const c = capsule(i + 1, bytes, s.system),
                encoded = encodeSourceCapsule(c);
              original.push(c);
              expect(decodeSourceCapsule(encoded, route)).toEqual(c);
              if (s.disk)
                records.push(row(i * 2, 'update', bytes), row(i * 2 + 1, 'outbound', encoded));
              if (!s.disk || s.overlap)
                journal.unshift({ key: 'j' + i, generation: 1, bytes: encoded });
            });
            const recovery = capturedRecovery({ records: records.reverse(), journal }, route);
            for (const r of recovery.records)
              if (r.kind === 'update') applyUpdate(recovered, r.bytes);
            for (const r of recovery.journal) applyUpdate(recovered, r.bytes);
            expect(recovered.getText('oracle').toString()).toBe(expected);
            expect(recovery.journal.length).toBe(history.filter((h) => !h.disk).length);
            const all = new Map(captureCatalog(records, route));
            for (const j of journal) {
              const c = decodeSourceCapsule(j.bytes, route);
              all.set(c.id, j.bytes);
              eraseCapsule(c);
            }
            expect(all.size).toBe(original.length);
            for (const c of original) expect(decodeSourceCapsule(all.get(c.id)!, route)).toEqual(c);
          } finally {
            d.destroy();
            recovered.destroy();
          }
        },
      ),
      { seed: 9422026, numRuns: 250 },
    );
  });
  it('200 generated route and actor substitutions refuse without accepting a different authority', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          'workspace',
          'credential',
          'principal',
          'epoch',
          'generation',
          'actor',
          'kind',
        ),
        fc.nat(999),
        (key, n) => {
          const c = capsule(n),
            valid = encodeSourceCapsule(c),
            v = JSON.parse(new TextDecoder().decode(valid));
          if (key === 'actor') v[8][0][0] = '04'.repeat(16);
          else if (key === 'kind') v[8][0][1] = 'system';
          else
            v[{ workspace: 3, credential: 4, principal: 5, epoch: 6, generation: 7 }[key]] = [
              'epoch',
              'generation',
            ].includes(key)
              ? 2
              : '04'.repeat(16);
          expect(() => decodeSourceCapsule(wire(JSON.stringify(v)), route)).toThrow(
            /unreadable or unbound/,
          );
        },
      ),
      { seed: 9422027, numRuns: 200 },
    );
  });
  it('refuses noncanonical framing, unknown version, malformed CRDT, oversized payload and too many sources', () => {
    for (const value of [null, undefined, 'not bytes', {}, []])
      expect(() => decodeSourceCapsule(value as unknown as Bytes, route)).toThrow(
        'Source capsule is unreadable or unbound',
      );
    const c = capsule(1),
      b = encodeSourceCapsule(c),
      text = new TextDecoder().decode(b);
    for (const s of [
      ' ' + text,
      text + ' ',
      text.replace('"done/source-capture/v1",1', '"done/source-capture/v1",2'),
      text.replace('"0000"', '"ff"'),
    ])
      expect(() => decodeSourceCapsule(wire(s), route)).toThrow();
    expect(() => decodeSourceCapsule(new Uint8Array(MAX_CAPTURE_BYTES + 1), route)).toThrow();
    expect(() => encodeSourceCapsule({ ...c, sources: Array(65).fill(c.sources[0]) })).toThrow();
    expect(() =>
      encodeSourceCapsule({
        ...c,
        sources: [{ ...c.sources[0]!, bytes: new Uint8Array(MAX_CAPTURE_BYTES) }],
      }),
    ).toThrow();
  });
  it('conflicting stable identity refuses journal/disk, disk/disk and journal/journal overlap', () => {
    const a = encodeSourceCapsule(capsule(1)),
      d = createDoc();
    const b = encodeSourceCapsule(
      capsule(
        1,
        transaction(d, () => d.getText('x').insert(0, 'different')),
      ),
    );
    d.destroy();
    const journal = (bytes: Bytes) => ({ key: 'journal', generation: 1, bytes });
    expect(() => captureCatalog([row(1, 'outbound', a), row(2, 'outbound', b)], route)).toThrow(
      /Conflicting/,
    );
    expect(() =>
      capturedRecovery({ records: [row(1, 'outbound', a)], journal: [journal(b)] }, route),
    ).toThrow(/Conflicting/);
    expect(() =>
      capturedRecovery({ records: [], journal: [journal(a), journal(b)] }, route),
    ).toThrow(/Conflicting/);
    expect(
      capturedRecovery({ records: [], journal: [journal(a), journal(a)] }, route).journal,
    ).toHaveLength(1);
  });
  it('requires original sources to cover all prepared state, including deletions', () => {
    const d = createDoc(),
      base = createDoc();
    const insert = transaction(d, () => d.getText('x').insert(0, 'first'));
    const remove = transaction(d, () => d.getText('x').delete(0, 1));
    const prepare = (complete: boolean) =>
      prepareIntent(base, 42, wire('intent'), 32768, (draft) => {
        applyUpdate(draft, insert);
        applyUpdate(draft, remove);
        return {
          sources: (complete ? [insert, remove] : [insert]).map((bytes) => ({
            actor: route.principal,
            kind: 'human',
            bytes: bytes.slice(),
          })),
        };
      });
    try {
      expect(() => prepare(false)).toThrow(/do not cover/);
      const result = prepare(true);
      expect(result.sources!.map((s) => s.bytes)).toEqual([insert, remove]);
    } finally {
      d.destroy();
      base.destroy();
    }
  });
  it.each(['reference', 'account-snapshots'] as const)(
    'private %s initialization and undo retain original transaction attribution',
    async (preparation) => {
      const admitted: SourceCapsule[] = [];
      const carrier = {
        state: 'active',
        signal: new AbortController().signal,
        loadRecovery: async () => ({ records: [], journal: [] }),
        captureLocal(_update: Bytes, sources: SourceCapsule['sources']) {
          const c = { ...capsule(admitted.length + 1), sources };
          const b = encodeSourceCapsule(c);
          return b;
        },
        appendLocal(b: Bytes) {
          admitted.push(decodeSourceCapsule(b, route));
          return { status: 'journalled' };
        },
        flushJournal: async () => ({ retained: 0 }),
        close: async () => {},
      } as unknown as JournalSession;
      const workspace = await createAdmittedWorkspace(
        (o) => createAdmissionOwner(carrier, o),
        {
          identity: {
            id: route.principal,
            actor: { kind: 'human', name: 'author', color: '#123456' },
            device: { id: 'device', name: 'fixture' },
          },
          captureSources: true,
          validateReceive: () => {},
          today: () => '2026-09-10',
        },
        preparation,
      );
      try {
        expect(new Set(admitted[0]!.sources.map((s) => s.kind))).toEqual(new Set(['system']));
        await workspace.text({ kind: 'master' }).input({ name: 'insert', text: 'human edit' })
          .accepted;
        expect(
          admitted[1]!.sources.every((s) => s.kind === 'human' && s.actor === route.principal),
        ).toBe(true);
        expect(
          admitted[0]!.sources
            .filter((s) => s.kind === 'system')
            .every((s) => s.actor === 'system'),
        ).toBe(true);
        const surface = workspace.text({ kind: 'master' });
        for (let i = 0; i < 24; i++) {
          await surface.input({ name: 'insert', text: i % 2 ? 'x' : '😀' }).accepted;
        }
        const beforeUndo = workspace.read().master;
        await workspace.command({ kind: 'undo' }).accepted;
        expect(workspace.read().master).not.toBe(beforeUndo);
        await workspace.command({ kind: 'redo' }).accepted;
        expect(workspace.read().master).toBe(beforeUndo);
        const d = createDoc(),
          accepted = createDoc();
        try {
          for (const c of admitted) for (const s of c.sources) applyUpdate(d, s.bytes);
          applyUpdate(accepted, workspace.snapshot());
          expect(sameDocState(d, accepted)).toBe(true);
        } finally {
          d.destroy();
          accepted.destroy();
        }
      } finally {
        await workspace.close();
      }
    },
  );
  it('repeated oversized preparation does not accumulate capsule reservations or acknowledge input', async () => {
    const d = createDoc(),
      large = transaction(d, () =>
        d.getText('large').insert(0, 'a'.repeat(MAX_JOURNAL_UPDATE + 1)),
      );
    d.destroy();
    let writes = 0;
    const carrier = {
      state: 'active',
      signal: new AbortController().signal,
      loadRecovery: async () => ({ records: [], journal: [] }),
      captureLocal: () => new Uint8Array(300),
      appendLocal: () => {
        writes++;
        return { status: 'journalled' };
      },
      close: async () => {},
    } as unknown as JournalSession;
    const admission = await createAdmissionOwner(carrier, {
      validateReceive: () => {},
      prepare: (draft) => {
        applyUpdate(draft, large);
        return { sources: [{ actor: route.principal, kind: 'human', bytes: large.slice() }] };
      },
    });
    try {
      admission.submit(wire('intent'));
      const reservation = admission.status.reservedBytes;
      for (let n = 0; n < 5; n++) {
        expect(admission.status.pressure?.code).toBe('slice-required');
        admission.retry();
        expect(admission.status.reservedBytes).toBe(reservation);
      }
      expect(writes).toBe(0);
    } finally {
      await admission.close();
    }
  });
});

it('160 generated source coverage checks include preexisting pending structs missing clocks and delete sets', () => {
  fc.assert(
    fc.property(
      fc.string({ minLength: 1, maxLength: 15 }),
      fc.string({ minLength: 1, maxLength: 15 }),
      (seed, input) => {
        const producer = createDoc(),
          canonical = createDoc();
        producer.clientID = 701;
        producer.getText('remote').insert(0, seed);
        const later = transaction(producer, () =>
          producer.getText('remote').insert(seed.length, 'later'),
        );
        const deletion = transaction(producer, () => producer.getText('remote').delete(0, 1));
        applyUpdate(canonical, later);
        applyUpdate(canonical, deletion);
        expect(canonical.store.pendingStructs).not.toBeNull();
        expect(canonical.store.pendingDs).not.toBeNull();
        const before = structuredClone({
          pending: canonical.store.pendingStructs,
          ds: canonical.store.pendingDs,
        });
        const run = (fault: 'none' | 'structs' | 'clocks' | 'deletions') =>
          prepareIntent(canonical, 42, wire('intent'), 32768, (draft) => {
            const command = cloneDocument(draft);
            command.clientID = draft.clientID;
            let update: Bytes;
            try {
              update = transaction(command, () => command.getText('local').insert(0, input));
              applyUpdate(draft, update);
            } finally {
              command.destroy();
            }
            if (fault === 'structs') draft.store.pendingStructs = null;
            if (fault === 'clocks') draft.store.pendingStructs!.missing.set(999, 1);
            if (fault === 'deletions') draft.store.pendingDs = null;
            return { sources: [{ actor: route.principal, kind: 'human', bytes: update }] };
          });
        try {
          const result = run('none');
          try {
            const cold = createDoc();
            try {
              applyUpdate(cold, Y.encodeStateAsUpdate(canonical));
              applyUpdate(cold, result.update);
              expect(cold.getText('local').toString()).toBe(input);
              expect(cold.store.pendingStructs).not.toBeNull();
              expect(cold.store.pendingDs).not.toBeNull();
            } finally {
              cold.destroy();
            }
          } finally {
            result.update.fill(0);
            for (const source of result.sources ?? []) source.bytes.fill(0);
          }
          for (const fault of ['structs', 'clocks', 'deletions'] as const)
            expect(
              () => run(fault),
              'source verification must cover the complete pending basis',
            ).toThrow(/Source updates do not cover/);
          expect({
            pending: canonical.store.pendingStructs,
            ds: canonical.store.pendingDs,
          }).toEqual(before);
        } finally {
          producer.destroy();
          canonical.destroy();
        }
      },
    ),
    { seed: 140923, numRuns: 160 },
  );
});
