// @vitest-environment node
import { expect, it } from 'vitest';
import {
  wrapAccountJournal,
  unwrapAccountJournal,
  parseJournalEra,
  type JournalBinding,
} from '../src/crdt/journalEra';
import { createRetentionReads } from '../src/crdt/retentionReads';
import { checkRetainedCheckpointCuts } from '../src/crdt/retentionCheckpoint';
import type { LocalBaseline } from '../src/crdt/localBaselineRecord';
import { createJournalCodec } from '../src/crdt/journalCodec';

const binding: JournalBinding = {
  identity: {
    slotId: 'slot',
    principalId: 'principal',
    workspaceId: 'workspace',
    storeId: '11'.repeat(16),
    rootId: '22'.repeat(16),
  },
  intent: '33'.repeat(16),
  era: { current: '44'.repeat(32), previous: null, revision: 2 },
};
const bytes = new Uint8Array([9, 3, 4, 8]);
it('round trips exact capsule bytes inside authenticated framing without lending caller buffers', () => {
  const framed = wrapAccountJournal(bytes, binding),
    codec = createJournalCodec('workspace', 1, new Uint8Array(32));
  try {
    const sealed = codec.seal('journal-key', new Uint8Array(24), framed);
    const opened = codec.open('journal-key', sealed);
    const capsule = unwrapAccountJournal(opened.bytes, binding);
    expect(capsule).toEqual(bytes);
    capsule.fill(0);
    expect(unwrapAccountJournal(opened.bytes, binding)).toEqual(bytes);
    expect(() => codec.open('other-key', sealed)).toThrow();
  } finally {
    codec.dispose();
  }
});
it('refuses both restored-era directions, forked eras, legacy payloads, and scope changes', () => {
  const successor = {
    ...binding,
    era: { current: '55'.repeat(32), previous: binding.era.current, revision: 3 },
  };
  const old = wrapAccountJournal(bytes, binding),
    next = wrapAccountJournal(bytes, successor);
  for (const [b, current] of [
    [old, successor],
    [next, binding],
    [next, undefined],
    [bytes, binding],
  ] as const)
    expect(() => unwrapAccountJournal(b, current)).toThrow('pairing');
  for (const field of ['slotId', 'principalId', 'workspaceId', 'storeId', 'rootId'] as const)
    expect(() =>
      unwrapAccountJournal(old, {
        ...binding,
        identity: { ...binding.identity, [field]: 'changed' },
      }),
    ).toThrow('pairing');
  expect(() => unwrapAccountJournal(old, { ...binding, intent: '00'.repeat(16) })).toThrow(
    'pairing',
  );
  expect(() => parseJournalEra({ ...binding.era, ignored: true })).toThrow();
  expect(() =>
    parseJournalEra({ current: binding.era.current, previous: binding.era.current, revision: 3 }),
  ).toThrow();
  expect(old).toEqual(wrapAccountJournal(bytes, binding));
});
it('bounds and authenticates framing rather than learning a database era from journal bytes', () => {
  const framed = wrapAccountJournal(bytes, binding);
  for (const invalid of [framed.slice(0, 10), new Uint8Array([...framed, 1]).slice(0, 32), bytes])
    expect(() => unwrapAccountJournal(invalid, binding)).toThrow();
  const bad = framed.slice();
  bad[30] = 255;
  expect(() => unwrapAccountJournal(bad, binding)).toThrow();
});
it('late receive/history work stays invalid after abort, resume, another boundary and close', () => {
  const gate = createRetentionReads(() => Error('superseded'));
  const first = gate.capture(),
    release = gate.begin();
  expect(first.signal.aborted).toBe(true);
  expect(() => gate.capture()).toThrow('superseded');
  release();
  release();
  expect(() => first.check()).toThrow('superseded');
  const next = gate.capture();
  next.check();
  gate.begin()();
  expect(() => next.check()).toThrow('superseded');
  const last = gate.capture();
  const finish = gate.begin();
  gate.close();
  finish();
  expect(() => gate.capture()).toThrow('superseded');
  expect(() => last.check()).toThrow('superseded');
});
it('checks publisher cuts independently; known old links compare exactly and unknown links refuse', () => {
  const publisher = '11'.repeat(16),
    peer = '22'.repeat(16);
  const b = {
    streams: [
      {
        publisher,
        position: 20,
        link: 'aa'.repeat(32),
        startingPoint: { position: 8, link: 'bb'.repeat(32) },
      },
      { publisher: peer, position: 7, link: 'cc'.repeat(32), startingPoint: null },
    ],
    history: null,
  } as unknown as LocalBaseline;
  const head = (id: string, position: number, link: string) => ({
    credentialId: id,
    position,
    link,
  });
  checkRetainedCheckpointCuts(b, [
    head(publisher, 8, 'bb'.repeat(32)),
    head(peer, 9, 'dd'.repeat(32)),
  ]);
  expect(() => checkRetainedCheckpointCuts(b, [head(publisher, 8, 'ee'.repeat(32))])).toThrow(
    'differs',
  );
  expect(() =>
    checkRetainedCheckpointCuts(b, [
      head(publisher, 20, 'aa'.repeat(32)),
      head(peer, 6, 'cc'.repeat(32)),
    ]),
  ).toThrow('retired history');
  expect(() => checkRetainedCheckpointCuts(b, [head(peer, 0, 'cc'.repeat(32))])).toThrow('zero');
});
