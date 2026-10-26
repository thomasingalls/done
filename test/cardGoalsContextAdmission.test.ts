// @vitest-environment node
import { expect, it } from 'vitest';
import { createAdmittedWorkspace, type AdmittedWorkspace } from '../src/crdt/admittedWorkspace';
import { createAdmissionOwner } from '../src/crdt/admissionQueue';
import type { JournalSession } from '../src/crdt/custody';

const identity = {
  id: 'context-human',
  actor: { kind: 'human' as const, name: 'Test', color: '#777777' },
  device: { id: 'context-device', name: 'Test' },
};
const to = { date: '2026-08-05', section: 'scheduled' as const };
const PATH = [
  { level: 1, title: 'Work' },
  { level: 3, title: 'Site' },
];
// Controlled semantic carrier, not an encryption or receiving-authority proof.
const fixture = async (
  preparation: 'reference' | 'local-snapshots' | 'account-text',
  seed: Uint8Array[] = [],
) => {
  const disk: Uint8Array[] = seed.map((b) => b.slice()),
    wal: Uint8Array[] = [];
  let refuse = false,
    gate: Promise<void> | undefined,
    release: (() => void) | undefined;
  const abort = new AbortController();
  const carrier = {
    state: 'active',
    signal: abort.signal,
    ...(preparation === 'account-text'
      ? { captureLocal: (update: Uint8Array) => update.slice() }
      : {}),
    loadRecovery: async () => ({
      records: disk.map((bytes) => ({ kind: 'update', bytes: bytes.slice() })),
      journal: wal.map((bytes) => ({ bytes: bytes.slice() })),
    }),
    appendLocal(bytes: Uint8Array) {
      if (refuse) return { status: 'refused', reason: 'quota' };
      wal.push(bytes.slice());
      return { status: 'journalled' };
    },
    async appendBatch(records: { bytes: Uint8Array }[]) {
      await gate;
      disk.push(...records.map((r) => r.bytes.slice()));
      return {};
    },
    async flushJournal() {
      disk.push(...wal.splice(0));
      return { retained: 0 };
    },
    async close() {
      release?.();
    },
  } as unknown as JournalSession;
  const workspace = await createAdmittedWorkspace(
    (options) => createAdmissionOwner(carrier, options),
    {
      identity,
      today: () => to.date,
      validateReceive: () => {},
      ...(preparation === 'account-text'
        ? { captureSources: true, suppressEmptySources: true }
        : {}),
    },
    preparation,
  );
  return {
    workspace,
    disk,
    wal,
    hold() {
      refuse = true;
      gate = new Promise<void>((resolve) => {
        release = resolve;
      });
    },
    resume() {
      release?.();
      gate = undefined;
      refuse = false;
    },
  };
};
const waitPending = async (w: AdmittedWorkspace) => {
  for (let n = 0; n < 100; n++) {
    if (w.status.pendingItems) return;
    await new Promise((r) => setTimeout(r, 0));
  }
  throw Error('No pending semantic command');
};
for (const preparation of ['reference', 'local-snapshots', 'account-text'] as const) {
  it(`${preparation} admits context atomically, owns input, preserves duplication and cold recovery`, async () => {
    const f = await fixture(preparation);
    let reopened: Awaited<ReturnType<typeof fixture>> | undefined;
    try {
      const headings = structuredClone(PATH);
      const command = f.workspace.command({
        kind: 'copy',
        to,
        lines: ['task'],
        goalsContexts: [headings],
      });
      headings[0]!.title = 'mutated caller';
      expect((await command.accepted).value).toBe(1);
      const source = f.workspace.read().cards[0]!;
      expect(source.goalsContext).toEqual(PATH);
      expect((await f.workspace.command({ kind: 'duplicate', id: source.id }).accepted).value).toBe(
        true,
      );
      expect(f.workspace.read().cards.map((c) => c.goalsContext)).toEqual([PATH, PATH]);
      await f.workspace.whenDurable();
      reopened = await fixture(preparation, f.disk);
      expect(
        reopened.workspace.read().cards.map((c) => ({ text: c.text, path: c.goalsContext })),
      ).toEqual([
        { text: 'task', path: PATH },
        { text: 'task', path: PATH },
      ]);
    } finally {
      await reopened?.workspace.close();
      await f.workspace.close();
    }
  });
  it(`${preparation} keeps a refused card and its path private until accepted`, async () => {
    const f = await fixture(preparation);
    try {
      f.hold();
      const command = f.workspace.command({
        kind: 'copy',
        to,
        lines: ['private task'],
        goalsContexts: [PATH],
      });
      await waitPending(f.workspace);
      expect(f.workspace.read().cards).toEqual([]);
      f.resume();
      await command.accepted;
      expect(f.workspace.read().cards[0]!.text).toBe('private task');
      expect(f.workspace.read().cards[0]!.goalsContext).toEqual(PATH);
    } finally {
      f.resume();
      await f.workspace.close();
    }
  });
  it(`${preparation} sorted move anchors keep their own heading paths`, async () => {
    const f = await fixture(preparation);
    try {
      await f.workspace.text({ kind: 'master' }).input({ name: 'insert', text: 'one\ntwo' })
        .accepted;
      const home = [{ level: 1, title: 'Home' }];
      expect(
        (
          await f.workspace.command({
            kind: 'move-from-master',
            to,
            lines: [
              { line: 1, text: 'two', goalsContext: home },
              { line: 0, text: 'one', goalsContext: PATH },
            ],
          }).accepted
        ).value,
      ).toBe(2);
      expect(f.workspace.read().master).toBe('');
      const values = f.workspace.read();
      expect(
        values.days[0]!.scheduled.map((id) => values.cards.find((c) => c.id === id)!.goalsContext),
      ).toEqual([PATH, home]);
      await f.workspace.command({ kind: 'undo' }).accepted;
      expect(f.workspace.read().master).toBe('one\ntwo');
      expect(f.workspace.read().cards).toEqual([]);
    } finally {
      await f.workspace.close();
    }
  });
}
