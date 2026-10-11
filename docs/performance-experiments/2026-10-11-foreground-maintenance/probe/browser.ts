import {
  beginCustodyEnrollment,
  initializeContentStore,
  openJournalSession,
} from '@subject/crdt/custody';
import { createAdmissionOwner } from '@subject/crdt/admissionQueue';
import { Y } from '@subject/crdt/yjs';

const scope = { slotId: 'maintenance', principalId: 'fixture', workspaceId: 'fixture' };
const authority = { ...scope, resolvePrincipal: () => scope.principalId };
const bytes = (s: string) => new TextEncoder().encode(s);
const text = (b: Uint8Array) => new TextDecoder().decode(b);
const readText = (b: Uint8Array) => {
  const doc = new Y.Doc();
  try {
    Y.applyUpdate(doc, b);
    return doc.getText('text').toString();
  } finally {
    doc.destroy();
  }
};
(window as any).run = async (collision: boolean) => {
  const enrollment = beginCustodyEnrollment(authority, { checkCreation() {} });
  const code = enrollment.displayCode!;
  await enrollment.confirm(code);
  await initializeContentStore(authority, code, { checkCreation() {} });
  const carrier = await openJournalSession(authority, code);
  const doc = new Y.Doc(),
    updates: Uint8Array[] = [];
  doc.on('update', (b: Uint8Array) => updates.push(b.slice()));
  doc.getText('text').insert(0, 'Synthetic writing. '.repeat(3200));
  for (let i = 1; i < 128; i++) doc.getText('text').insert(doc.getText('text').length, 'x');
  const expected = doc.getText('text').toString() + (collision ? '!' : '');
  doc.destroy();
  await carrier.appendBatch(updates.map((b) => ({ kind: 'update', bytes: b })));
  for (let i = 0; i < 6; i++)
    await carrier.appendBatch(
      Array.from({ length: 200 }, (_, n) => ({
        kind: n % 2 ? 'heads' : 'outbound',
        bytes: new Uint8Array(256).fill(n % 251),
      })),
    );
  const events: any[] = [],
    tasks: number[] = [],
    requests = { cursor: 0, all: 0, keys: 0 };
  let measured = false;
  for (const [method, key] of [
    ['openCursor', 'cursor'],
    ['getAll', 'all'],
    ['getAllKeys', 'keys'],
  ] as const) {
    const original = IDBObjectStore.prototype[method];
    (IDBObjectStore.prototype as any)[method] = function (...args: any[]) {
      if (measured) requests[key]++;
      return (original as any).apply(this, args);
    };
  }
  const observer = new PerformanceObserver((list) => {
    if (measured) for (const e of list.getEntries()) tasks.push(e.duration);
  });
  observer.observe({ type: 'longtask', buffered: false });
  let owner: Awaited<ReturnType<typeof createAdmissionOwner>>;
  let attempted = false,
    input: Promise<void> | undefined;
  const wrapped = {
    ...carrier,
    compactContent: async (...args: any[]) => {
      const start = performance.now();
      const event: any = { start };
      events.push(event);
      if (collision && !attempted) {
        attempted = true;
        input = new Promise<void>((resolve, reject) =>
          setTimeout(() => {
            event.dispatchDelay = performance.now() - start - 25;
            const at = performance.now();
            owner.submit(bytes('!')).accepted.then(() => {
              event.inputMs = performance.now() - at;
              resolve();
            }, reject);
          }, 25),
        );
      }
      try {
        const receipt = await (carrier.compactContent as any)(...args);
        event.receipt = { status: receipt.status, removed: receipt.removed.length };
        return receipt;
      } catch (e) {
        event.error = (e as Error).name;
        throw e;
      } finally {
        event.ms = performance.now() - start;
      }
    },
  };
  owner = await createAdmissionOwner(wrapped, {
    prepare(d, b) {
      d.getText('text').insert(d.getText('text').length, text(b));
    },
    validateReceive() {},
  });
  measured = true;
  const deadline = performance.now() + 30000;
  while (
    !events.length ||
    events.at(-1).ms === undefined ||
    (collision && (!events[0].inputMs || !events.some((e) => e.receipt?.status === 'compacted')))
  ) {
    if (performance.now() > deadline) throw Error('Maintenance did not finish');
    await new Promise((r) => setTimeout(r, 20));
  }
  await input;
  await owner.whenDurable();
  const matches = readText(owner.snapshot()) === expected;
  await owner.close();
  measured = false;
  observer.disconnect();
  const cold = await openJournalSession(authority, code),
    recovered = new Y.Doc();
  const recovery = await cold.loadRecovery();
  try {
    for (const r of recovery.records)
      if (r.kind === 'state' || r.kind === 'update') Y.applyUpdate(recovered, r.bytes);
    for (const r of recovery.journal) Y.applyUpdate(recovered, r.bytes);
    return {
      collision,
      events,
      requests,
      longTasks: tasks,
      matches,
      reopenedMatches: recovered.getText('text').toString() === expected,
      retainedRows: recovery.records.filter((r) => r.kind === 'heads' || r.kind === 'outbound')
        .length,
    };
  } finally {
    recovered.destroy();
    for (const r of [...recovery.records, ...recovery.journal]) r.bytes.fill(0);
    await cold.close();
  }
};
