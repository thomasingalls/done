// @vitest-environment node
import { it, expect } from 'vitest';
import fc from 'fast-check';
import {
  createAdmissionOwner,
  AdmissionError,
  MAX_PENDING_BYTES,
  type OwnedReceiveQueue,
} from '../src/crdt/admissionQueue';
import type { JournalSession } from '../src/crdt/custody';
import { Y, applyUpdate, createDoc } from '../src/crdt/yjs';
import type { Bytes } from '../src/crdt/custodyCrypto';
import { prepareIntent } from '../src/crdt/admissionDocument';
const utf8 = (s: string) => new TextEncoder().encode(s);
const gate = () => {
  let release!: () => void;
  const promise = new Promise<void>((r) => {
    release = r;
  });
  return { promise, release };
};
async function fixture() {
  const signal = new AbortController(),
    rows: Bytes[] = [],
    local: Bytes[] = [];
  let receive!: OwnedReceiveQueue;
  const carrier = {
    state: 'active',
    signal: signal.signal,
    close: async () => {
      signal.abort();
    },
    loadRecovery: async () => ({ records: [], journal: [] }),
    appendBatch: async () => {
      throw Error('Raw receive must not reach content');
    },
    appendLocal: (bytes: Bytes) => {
      local.push(bytes.slice());
      rows.push(bytes.slice());
      return { status: 'journalled', key: 'x', generation: 1 };
    },
    flushJournal: async () => ({ retained: 0, removed: 0, contentReceipts: [] }),
  } as unknown as JournalSession;
  const owner = await createAdmissionOwner(
    carrier,
    {
      prepare: (doc, input) => {
        const t = doc.getText('text');
        t.insert(t.length, new TextDecoder().decode(input));
      },
      validateReceive: () => {
        throw Error('Raw input refused');
      },
    },
    (enqueue) => {
      receive = enqueue;
    },
  );
  return { owner, receive, rows, local };
}
const update = (text: string) => {
  const doc = createDoc();
  doc.getText('text').insert(0, text);
  const b = new Uint8Array(Y.encodeStateAsUpdate(doc));
  doc.destroy();
  return b;
};
const view = (bytes: Bytes) => {
  const doc = createDoc();
  try {
    applyUpdate(doc, bytes);
    return doc.getText('text').toString();
  } finally {
    doc.destroy();
  }
};
it('holds local preparation behind owned commit and publishes originals without a local append', async () => {
  const f = await fixture(),
    held = gate(),
    remote = update('R'),
    page = utf8('signed page');
  const received = f.receive(page, async (input, promote) => {
    expect(new TextDecoder().decode(input)).toBe('signed page');
    await held.promise;
    f.rows.push(remote.slice());
    promote([remote]);
    return 'receipt';
  });
  page.fill(0);
  const later = f.owner.submit(utf8('L'));
  expect(view(f.owner.snapshot())).toBe('');
  expect(f.local).toHaveLength(0);
  held.release();
  expect(await received).toBe('receipt');
  await later.accepted;
  expect(view(f.owner.snapshot())).toBe('RL');
  expect(f.local).toHaveLength(1);
  const cold = createDoc();
  for (const b of f.rows) applyUpdate(cold, b);
  expect(cold.getText('text').toString()).toBe('RL');
  cold.destroy();
  await f.owner.close();
});
it('refuses invalid pages without blocking later edits and never accepts raw updates through the seam', async () => {
  const f = await fixture();
  await expect(
    f.receive(utf8('bad'), async () => {
      throw new AdmissionError('receive-refused', 'bad signature');
    }),
  ).rejects.toThrow('bad signature');
  await expect(f.owner.receive(update('raw')).accepted).rejects.toThrow('validation');
  await f.owner.submit(utf8('L')).accepted;
  expect(view(f.owner.snapshot())).toBe('L');
  await f.owner.close();
});
it('close while commit is pending prevents promotion and late acknowledgement', async () => {
  const f = await fixture(),
    held = gate();
  let reached = false;
  const received = f.receive(utf8('wire'), async (_, promote) => {
    await held.promise;
    f.rows.push(update('R'));
    promote(f.rows);
    reached = true;
  });
  const local = f.owner.submit(utf8('L'));
  const closed = f.owner.close();
  held.release();
  await expect(received).rejects.toThrow('closed');
  await expect(local.accepted).rejects.toThrow('closed');
  await closed;
  expect(reached).toBe(false);
  expect(f.local).toHaveLength(0);
});
it('capacity refusal happens before dispatch and capture owns all queued wire bytes', async () => {
  const f = await fixture();
  let dispatched = false;
  expect(() =>
    f.receive(new Uint8Array(MAX_PENDING_BYTES + 1), async () => {
      dispatched = true;
    }),
  ).toThrow('full');
  expect(dispatched).toBe(false);
  await f.owner.close();
});
it('200 generated interleavings recover authored text and preserve source counts', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.array(
        fc.record({
          remote: fc.boolean(),
          text: fc.constantFrom('a', 'é', '🙂'),
          rejected: fc.boolean(),
        }),
        { minLength: 1, maxLength: 15 },
      ),
      async (history) => {
        const f = await fixture(),
          sender = createDoc();
        let expected = '',
          count = 0;
        try {
          for (const item of history) {
            if (!item.remote) {
              await f.owner.submit(utf8(item.text)).accepted;
              expected += item.text;
              count++;
              continue;
            }
            if (item.rejected) {
              await expect(
                f.receive(utf8('bad'), async () => {
                  throw new AdmissionError('receive-refused', 'bad');
                }),
              ).rejects.toThrow('bad');
              continue;
            }
            applyUpdate(sender, f.owner.snapshot());
            sender.clientID = 7654321;
            let original!: Bytes;
            const capture = (b: Uint8Array) => {
              original = new Uint8Array(b);
            };
            sender.on('update', capture);
            sender.getText('text').insert(sender.getText('text').length, item.text);
            sender.off('update', capture);
            const held = gate(),
              pending = f.receive(utf8('wire'), async (_, promote) => {
                await held.promise;
                f.rows.push(original.slice());
                promote([original]);
              });
            expect(view(f.owner.snapshot())).toBe(expected);
            held.release();
            await pending;
            expected += item.text;
            expect(f.local.length).toBe(count);
          }
          const cold = createDoc();
          for (const b of f.rows) applyUpdate(cold, b);
          expect(cold.getText('text').toString()).toBe(expected);
          expect(view(f.owner.snapshot())).toBe(expected);
          cold.destroy();
        } finally {
          sender.destroy();
          await f.owner.close();
        }
      },
    ),
    { seed: 9192026, numRuns: 200 },
  );
}, 15000);

it('empty source lists cannot conceal a deletion with an unchanged state vector', () => {
  const canonical = createDoc();
  canonical.getText('text').insert(0, 'visible');
  const author = createDoc();
  applyUpdate(author, Y.encodeStateAsUpdate(canonical));
  const sv = Y.encodeStateVector(author);
  let deletion!: Bytes;
  author.on('update', (b: Uint8Array) => {
    deletion = new Uint8Array(b);
  });
  author.getText('text').delete(0, 7);
  expect(Y.encodeStateVector(author)).toEqual(sv);
  expect(() =>
    prepareIntent(canonical, 777, utf8('delete'), 16384, (draft) => {
      applyUpdate(draft, deletion);
      return { sources: [] };
    }),
  ).toThrow('do not cover');
  const real = prepareIntent(canonical, 777, utf8('delete'), 16384, (draft) => {
    applyUpdate(draft, deletion);
    return { sources: [{ actor: 'person', kind: 'human', bytes: deletion.slice() }] };
  });
  expect(real.update).not.toEqual(new Uint8Array([0, 0]));
  expect(real.sources).toHaveLength(1);
  const empty = prepareIntent(canonical, 777, utf8('noop'), 16384, () => ({ sources: [] }));
  expect(empty.update).toEqual(new Uint8Array([0, 0]));
  author.destroy();
  canonical.destroy();
});
