// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { fixture, cleanupMirrorFixtures, scope, route } from './fixtures/accountMirror';
import { decodeSourceCapsule, eraseCapsule } from '../src/crdt/sourceCapture';
import { eraseJournalSnapshot } from '../src/crdt/journalStore';
import type { AdmissionFence } from '../src/crdt/admissionQueue';
import type { JournalBinding } from '../src/crdt/journalEra';
afterEach(cleanupMirrorFixtures);
const gate = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
const sel = (at: number) => ({ ranges: [{ anchor: at, head: at }], main: 0 });
const era = (revision = 1): JournalBinding => ({
  identity: { ...scope },
  intent: 'fixture-initialization',
  era: {
    current: String(revision).repeat(64),
    previous: revision === 1 ? null : String(revision - 1).repeat(64),
    revision,
  },
});
async function ready() {
  const f = await fixture(),
    controller = await f.openController(),
    w = controller.workspace;
  await w.whenDurable();
  await new Promise((r) => setTimeout(r, 0));
  return { ...f, controller, w };
}
const insert = async (f: Awaited<ReturnType<typeof ready>>, value: string) => {
  const field = f.w.text({ kind: 'master' });
  await field.input({ name: 'insert', text: value }, sel(field.read().text.length)).accepted;
};
it('refreshes the heading route before input resumes and preserves the actual canonical Undo history', async () => {
  const f = await ready();
  await insert(f, 'original');
  const original = f.w;
  await f.controller.journalFence(async (token) => {
    f.moveWorkerContext(2);
    const incoming = f.opening();
    await f.controller.rebind(token, incoming);
    expect(incoming.key.every((v) => v === 0)).toBe(true);
  });
  expect(f.controller.workspace).toBe(original);
  await f.w.command({ kind: 'undo' }).accepted;
  expect(f.w.text({ kind: 'master' }).read().text).toBe('');
  await f.w.command({ kind: 'redo' }).accepted;
  expect(f.w.text({ kind: 'master' }).read().text).toBe('original');
  await insert(f, ' new epoch');
  const stored = f.workerJournal.snapshot();
  try {
    expect(stored.length).toBeGreaterThan(0);
    for (const entry of stored) {
      const c = decodeSourceCapsule(entry.bytes, { ...route, epoch: 2 });
      expect(c.epoch).toBe(2);
      eraseCapsule(c);
    }
  } finally {
    eraseJournalSnapshot(stored);
  }
});
it('new and advanced journal eras seal readable entries with the refreshed binding', async () => {
  const f = await ready();
  for (const revision of [1, 2]) {
    await f.controller.journalFence(async (token) => {
      f.moveWorkerContext(1, era(revision));
      await f.controller.rebind(token, f.opening());
    });
    await insert(f, ' era' + revision);
    const stored = f.workerJournal.snapshot();
    try {
      expect(stored.length).toBeGreaterThan(0);
      for (const entry of stored) {
        const c = decodeSourceCapsule(entry.bytes, route);
        expect(c.epoch).toBe(1);
        eraseCapsule(c);
      }
    } finally {
      eraseJournalSnapshot(stored);
    }
  }
  expect(f.w.text({ kind: 'master' }).read().text).toBe(' era1 era2');
});
it('forged fences erase incoming material without lending or closing the actual queue', async () => {
  const f = await ready(),
    incoming = f.opening(),
    check = vi.fn();
  await expect(f.controller.rebind({ check }, incoming)).rejects.toThrow('another admission owner');
  expect(check).not.toHaveBeenCalled();
  expect(incoming.key.every((v) => v === 0)).toBe(true);
  expect(f.cohort.state).toBe('active');
  await insert(f, 'still original');
});
it('a settled reservation cannot authorize a later hot rebind', async () => {
  const f = await ready();
  let saved!: AdmissionFence;
  await f.controller.journalFence(async (token) => {
    saved = token;
  });
  const incoming = f.opening();
  await expect(f.controller.rebind(saved, incoming)).rejects.toThrow();
  expect(incoming.key.every((v) => v === 0)).toBe(true);
  expect(f.cohort.state).toBe('active');
});
it('a different root fails closed while the genuine final reservation is held', async () => {
  const f = await ready(),
    incoming = f.opening();
  (incoming.scope as { rootId: string }).rootId = 'ff'.repeat(16);
  await expect(
    f.controller.journalFence((token) => f.controller.rebind(token, incoming)),
  ).rejects.toThrow();
  await f.cohort.close();
  expect(f.cohort.state).toBe('closed');
  expect(incoming.key.every((v) => v === 0)).toBe(true);
});
it('same-generation journal keys cannot silently change during rebinding', async () => {
  const f = await ready(),
    incoming = f.opening();
  incoming.key.fill(9);
  await expect(
    f.controller.journalFence((token) => f.controller.rebind(token, incoming)),
  ).rejects.toThrow();
  await f.cohort.close();
  expect(incoming.key.every((v) => v === 0)).toBe(true);
  expect(f.cohort.state).toBe('closed');
});
it('an authority epoch cannot move backwards in the active mirror', async () => {
  const f = await ready();
  await f.controller.journalFence(async (token) => {
    f.moveWorkerContext(2);
    await f.controller.rebind(token, f.opening());
  });
  const incoming = f.opening();
  incoming.route.epoch = 1;
  await expect(
    f.controller.journalFence((token) => f.controller.rebind(token, incoming)),
  ).rejects.toThrow();
  await f.cohort.close();
  expect(incoming.key.every((v) => v === 0)).toBe(true);
});
it('an established era binding cannot disappear', async () => {
  const f = await ready();
  await f.controller.journalFence(async (token) => {
    f.moveWorkerContext(1, era());
    await f.controller.rebind(token, f.opening());
  });
  const incoming = { ...f.opening() };
  delete (incoming as { binding?: JournalBinding }).binding;
  await expect(
    f.controller.journalFence((token) => f.controller.rebind(token, incoming)),
  ).rejects.toThrow();
  await f.cohort.close();
  expect(incoming.key.every((v) => v === 0)).toBe(true);
});
it('the same era revision cannot be relabeled with another era identity', async () => {
  const f = await ready();
  await f.controller.journalFence(async (token) => {
    f.moveWorkerContext(1, era());
    await f.controller.rebind(token, f.opening());
  });
  const incoming = f.opening();
  incoming.binding!.era.current = 'e'.repeat(64);
  await expect(
    f.controller.journalFence((token) => f.controller.rebind(token, incoming)),
  ).rejects.toThrow();
  await f.cohort.close();
  expect(incoming.key.every((v) => v === 0)).toBe(true);
});
it('unexpected journal entries after the final flush are retained and refuse rebinding', async () => {
  const f = await ready();
  await insert(f, 'retained journal');
  const copies = f.workerJournal.snapshot(),
    saved = copies[0]!.bytes.slice();
  eraseJournalSnapshot(copies);
  await expect(
    f.controller.journalFence(async (token) => {
      expect(f.storage.length).toBe(0);
      f.workerJournal.append(saved);
      await f.controller.rebind(token, f.opening());
    }),
  ).rejects.toThrow();
  await f.cohort.close();
  expect(f.storage.length).toBeGreaterThan(0);
  saved.fill(0);
});
it('captures the replacement route before its first async equality check', async () => {
  const f = await ready(),
    entered = gate(),
    release = gate(),
    original = crypto.subtle.digest.bind(crypto.subtle);
  vi.spyOn(crypto.subtle, 'digest').mockImplementationOnce(async (...args) => {
    entered.resolve();
    await release.promise;
    return original(...args);
  });
  const work = f.controller.journalFence(async (token) => {
    f.moveWorkerContext(2);
    const incoming = f.opening();
    const rebound = f.controller.rebind(token, incoming);
    await entered.promise;
    incoming.route.epoch = 99;
    expect(incoming.key.every((v) => v === 0)).toBe(true);
    release.resolve();
    await rebound;
  });
  await work;
  await insert(f, 'captured');
  const stored = f.workerJournal.snapshot();
  try {
    for (const entry of stored) {
      const c = decodeSourceCapsule(entry.bytes, { ...route, epoch: 2 });
      expect(c.epoch).toBe(2);
      eraseCapsule(c);
    }
  } finally {
    eraseJournalSnapshot(stored);
  }
});
it('close during the async replacement check cannot restore a writer or admit a late input', async () => {
  const f = await ready(),
    entered = gate(),
    release = gate(),
    original = crypto.subtle.digest.bind(crypto.subtle);
  const incoming = f.opening();
  vi.spyOn(crypto.subtle, 'digest').mockImplementationOnce(async (...args) => {
    entered.resolve();
    await release.promise;
    return original(...args);
  });
  const work = f.controller.journalFence((token) => f.controller.rebind(token, incoming)),
    refused = expect(work).rejects.toThrow();
  await entered.promise;
  const closing = f.cohort.close();
  expect(f.cohort.state).toBe('closing');
  release.resolve();
  await refused;
  await closing;
  expect(f.cohort.state).toBe('closed');
  expect(incoming.key.every((v) => v === 0)).toBe(true);
  expect(f.held).toHaveLength(0);
});
it('only the original workspace surface is available to application UI', async () => {
  const f = await ready();
  for (const name of ['rebind', 'enqueue', 'prepare', 'journalFence'])
    expect(name in f.w).toBe(false);
});
