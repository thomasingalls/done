// @vitest-environment node
import { afterEach, expect, it } from 'vitest';
import { replacementPageFixture } from './inbound-page/replacement-fixtures';
import { replacementCapacityModule } from './inbound-page/replacement-capacity-module';
import { openReplacementSource } from '../src/crdt/replacementSource';
import { openReplacementCheckpoint } from '../src/crdt/replacementCheckpoint';
import { decodeInboundPageRecord } from '../src/crdt/inboundRecord';
import { StorageCompatibilityError } from '../src/crdt/storageCompatibility';
import { Y, sameDocState } from '../src/crdt/yjs';
import type { Bytes } from '../src/crdt/custodyCrypto';
import { referenceBytes } from './inbound-page/fixtures';
let fixture: Awaited<ReturnType<typeof replacementPageFixture>> | undefined;
afterEach(() => {
  fixture?.cleanup();
  fixture = undefined;
});
const setup = async (cutAt = 8) => (fixture = await replacementPageFixture(cutAt));
const aged = { assertCurrent() {}, now: () => 60000 };
async function checkSnapshot(
  f: Awaited<ReturnType<typeof setup>>,
  source: Awaited<ReturnType<typeof openReplacementSource>>,
) {
  const expected = new Y.Doc({ gc: false });
  Y.applyUpdate(expected, Y.encodeStateAsUpdate(f.f.root));
  for (const stream of f.streams)
    for (const e of stream.entries.slice(0, f.cutAt)) Y.applyUpdate(expected, e.update);
  try {
    const checkpoint = await source.checkpoint(f.f.root, f.f.sign);
    const opened = await openReplacementCheckpoint(checkpoint, f.f.key2, f.parent);
    try {
      expect(sameDocState(expected, opened)).toBe(true);
      return opened.getText('master').toString();
    } finally {
      opened.destroy();
    }
  } finally {
    expected.destroy();
  }
}
it('replays both accepted publishers including the removed one and reopens aged exact saved pages', async () => {
  const f = await setup();
  let source = await openReplacementSource({ ...f.input, lifetime: aged });
  const saved: Bytes[] = [];
  try {
    for (const [i, stream] of f.streams.entries()) {
      saved.push(await source.appendStored(stream.publisher, f.raws[i]!));
      expect(saved[i]).toEqual(f.raws[i]);
    }
    expect(source.pending()).toEqual([]);
    await checkSnapshot(f, source);
    source.dispose();
    source = await openReplacementSource({ ...f.input, lifetime: { ...aged, now: () => 120000 } });
    for (const [i, stream] of f.streams.entries())
      await source.appendStored(stream.publisher, saved[i]!);
    await checkSnapshot(f, source);
    for (const raw of f.raws) expect(raw.some((b: number) => b !== 0)).toBe(true);
  } finally {
    source.dispose();
    for (const raw of saved) raw.fill(0);
  }
});
it('resumes legacy originals then an interior extent with the actual original page index', async () => {
  const f = await setup(),
    saved: { publisher: string; record: Bytes }[] = [];
  let source = await openReplacementSource(f.input);
  try {
    for (const [i, stream] of f.streams.entries()) {
      for (const e of stream.entries.slice(0, 2)) {
        const p = f.packet(stream, [e]);
        saved.push({
          publisher: stream.publisher,
          record: await source.appendPage(stream.publisher, p.request, p.page),
        });
      }
      const page = decodeInboundPageRecord(f.raws[i]!);
      const raw = referenceBytes({
        ...page,
        firstPosition: 3,
        previous: stream.entries[1]!.link,
        firstEntry: 2,
        entryCount: 6,
      });
      saved.push({
        publisher: stream.publisher,
        record: await source.appendStored(stream.publisher, raw),
      });
    }
    await checkSnapshot(f, source);
    source.dispose();
    source = await openReplacementSource({ ...f.input, lifetime: aged });
    for (const e of saved) await source.appendStored(e.publisher, e.record);
    await checkSnapshot(f, source);
  } finally {
    source.dispose();
    for (const e of saved) e.record.fill(0);
  }
});
it('an admitted extent can end inside its original signed page without including later writing', async () => {
  const f = await setup(6),
    source = await openReplacementSource({ ...f.input, lifetime: aged });
  try {
    for (const [i, stream] of f.streams.entries())
      (await source.appendStored(stream.publisher, f.raws[i]!)).fill(0);
    const text = await checkSnapshot(f, source);
    expect(text).toContain('0:6');
    expect(text).not.toContain('0:7');
    expect(text).not.toContain('1:7');
  } finally {
    source.dispose();
  }
});
it('a committed extent cannot go beyond the authenticated accepted cut, and failure closes the source', async () => {
  const f = await setup(6),
    source = await openReplacementSource(f.input),
    p = decodeInboundPageRecord(f.raws[0]!);
  const raw = referenceBytes({ ...p, entryCount: 8, lastLink: f.streams[0]!.entries[7]!.link });
  try {
    await expect(source.appendStored(f.streams[0]!.publisher, raw)).rejects.toThrow();
    expect(() => source.pending()).toThrow('closed');
  } finally {
    source.dispose();
  }
});
it('saved pages require their own source floor and preserve caller-owned keys and bytes on refusal', async () => {
  const f = await setup(),
    input = { ...f.input, inboundReceiptVersion: undefined },
    keys = [...f.input.keys.values()].map((k: Uint8Array) => k.slice());
  delete input.inboundReceiptVersion;
  const source = await openReplacementSource(input);
  try {
    await expect(source.appendStored(f.streams[0]!.publisher, f.raws[0]!)).rejects.toThrow(
      StorageCompatibilityError,
    );
    expect([...f.input.keys.values()]).toEqual(keys);
    expect(f.raws[0]!.some((b: number) => b !== 0)).toBe(true);
    expect(() => source.pending()).toThrow('closed');
  } finally {
    source.dispose();
  }
});
it('changed service signatures and substituted publisher routes refuse before a checkpoint can be signed', async () => {
  const f = await setup();
  const p = decodeInboundPageRecord(f.raws[0]!),
    page = JSON.parse(Buffer.from(p.page).toString());
  page[6] = 'ff'.repeat(64);
  const corrupt = referenceBytes({ ...p, page: new Uint8Array(Buffer.from(JSON.stringify(page))) });
  for (const [publisher, raw] of [
    [f.streams[0]!.publisher, corrupt],
    [f.streams[1]!.publisher, f.raws[0]!],
  ] as const) {
    const source = await openReplacementSource(f.input);
    try {
      await expect(source.appendStored(publisher, raw)).rejects.toThrow();
      expect(() => source.pending()).toThrow('closed');
    } finally {
      source.dispose();
    }
  }
});
it('missing accepted publisher writing and a current-owner interruption still refuse and close', async () => {
  const f = await setup();
  let source = await openReplacementSource(f.input);
  try {
    (await source.appendStored(f.streams[0]!.publisher, f.raws[0]!)).fill(0);
    let signs = 0;
    await expect(
      source.checkpoint(f.f.root, async () => {
        signs++;
        throw Error('must not sign');
      }),
    ).rejects.toThrow('missing accepted');
    expect(signs).toBe(0);
    expect(() => source.pending()).toThrow('closed');
    source.dispose();
    let cancelled = false;
    source = await openReplacementSource({
      ...f.input,
      lifetime: {
        now: () => 1000,
        assertCurrent() {
          if (cancelled) throw Error('cancelled');
        },
      },
    });
    const pending = source.appendStored(f.streams[0]!.publisher, f.raws[0]!);
    cancelled = true;
    await expect(pending).rejects.toThrow('cancelled');
    cancelled = false;
    expect(() => source.pending()).toThrow('closed');
  } finally {
    source.dispose();
  }
});

it('bounds logical work at4096 before verification: one remaining entry fits and a two-entry extent refuses', async () => {
  const built = await replacementCapacityModule();
  try {
    const f = await replacementPageFixture(8, built.api);
    try {
      const page = decodeInboundPageRecord(f.raws[0]!),
        publisher = f.streams[0]!.publisher;
      let source = await built.api.openReplacementSource(f.input);
      try {
        const one = referenceBytes({
          ...page,
          entryCount: 1,
          lastLink: f.streams[0]!.entries[0]!.link,
        });
        (await source.appendStored(publisher, one)).fill(0);
        expect(source.pending().find((p) => p.credentialId === publisher)!.after).toBe(1);
        const next = referenceBytes({
          ...page,
          firstEntry: 1,
          entryCount: 1,
          firstPosition: 2,
          previous: f.streams[0]!.entries[0]!.link,
          lastLink: f.streams[0]!.entries[1]!.link,
        });
        await expect(source.appendStored(publisher, next)).rejects.toThrow(
          'outside its accepted cut',
        );
        source.dispose();
        source = await built.api.openReplacementSource(f.input);
        const two = referenceBytes({
          ...page,
          entryCount: 2,
          lastLink: f.streams[0]!.entries[1]!.link,
        });
        await expect(source.appendStored(publisher, two)).rejects.toThrow(
          'outside its accepted cut',
        );
        expect(() => source.pending()).toThrow('closed');
      } finally {
        source.dispose();
      }
    } finally {
      f.cleanup();
    }
  } finally {
    await built.dispose();
  }
});
it('the isolated omission control exposes over-limit acceptance when the logical preflight is removed', async () => {
  const built = await replacementCapacityModule(true);
  try {
    const f = await replacementPageFixture(8, built.api);
    try {
      const page = decodeInboundPageRecord(f.raws[0]!),
        publisher = f.streams[0]!.publisher;
      const two = referenceBytes({
        ...page,
        entryCount: 2,
        lastLink: f.streams[0]!.entries[1]!.link,
      });
      const source = await built.api.openReplacementSource(f.input);
      try {
        // An assertion expecting the real ceiling now fails: the injected counter reaches4097.
        const accepted = await source.appendStored(publisher, two);
        expect(source.pending().find((p) => p.credentialId === publisher)!.after).toBe(2);
        expect(accepted).toEqual(two);
        accepted.fill(0);
      } finally {
        source.dispose();
      }
    } finally {
      f.cleanup();
    }
  } finally {
    await built.dispose();
  }
});
