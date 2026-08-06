/**
 * TRD §9: export.
 *
 * "Your data outlives the app" is a ranked principle (PRD principle 4), and
 * until sync exists this is the whole of the backup story (TRD §10.5). So what
 * matters is that the bytes are a zip anyone can open and that the markdown in
 * it is the markdown the app holds.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { compactDay, compose, exportEntries, exportFilename, transact } from '../src/crdt';
import { crc32, zip } from '../src/lib/zip';
import { Temporal } from '../src/lib/temporal';
import { addDays } from '../src/lib/date';
import { harness, TODAY, type Harness } from './workspace';

let context: Harness;
afterEach(() => context?.destroy());

const read32 = (bytes: Uint8Array, at: number): number =>
  new DataView(bytes.buffer, bytes.byteOffset).getUint32(at, true);

describe('the zip container', () => {
  it('starts with a local file header and ends with the central directory', () => {
    const bytes = zip(
      [{ path: 'a.md', content: 'hello' }],
      Temporal.PlainDateTime.from('2026-08-05T12:00'),
    );
    expect(read32(bytes, 0)).toBe(0x04034b50);

    const eocdAt = bytes.length - 22;
    expect(read32(bytes, eocdAt)).toBe(0x06054b50);
    expect(new DataView(bytes.buffer, bytes.byteOffset).getUint16(eocdAt + 10, true)).toBe(1);
  });

  it('stores the bytes uncompressed, so the content is readable in place', () => {
    const bytes = zip([{ path: 'a.md', content: 'hello' }]);
    expect(new TextDecoder().decode(bytes).includes('hello')).toBe(true);
  });

  it('records a CRC an unzipper will check', () => {
    // The standard check value for "123456789" under CRC-32/ISO-HDLC.
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf4_3926);
  });

  it('names the file after the day it was taken', () => {
    expect(exportFilename(Temporal.PlainDateTime.from('2026-08-05T09:00'))).toBe(
      'done-2026-08-05.zip',
    );
  });
});

describe('what goes in it', () => {
  it('is master.md plus a file per day that has anything in it', async () => {
    context = await harness();
    transact(context.store.doc, context.me.origin, () =>
      context.store.master.insert(0, '# Master\n\n- one\n'),
    );
    compose(context.me, { date: TODAY, section: 'done' }, 'called the dentist');

    const entries = exportEntries(context.store.doc, context.store.master.toString());
    expect(entries.map((entry) => entry.path)).toEqual(['master.md', `days/${TODAY}.md`]);
    expect(entries[0]?.content).toBe('# Master\n\n- one\n');
    expect(entries[1]?.content).toContain('- called the dentist');
  });

  it('dumps the master list verbatim, because it is already markdown', async () => {
    context = await harness();
    const source = 'a \\* b _c_ ~d~ [e](f)\n\n\n  trailing   \n';
    transact(context.store.doc, context.me.origin, () => context.store.master.insert(0, source));
    expect(exportEntries(context.store.doc, context.store.master.toString())[0]?.content).toBe(
      source,
    );
  });

  it('exports a compacted day identically to an uncompacted one', async () => {
    context = await harness();
    const old = addDays(TODAY, -7);
    const past = { ...context.me, today: old };
    compose(past, { date: old, section: 'done' }, 'finished\n\nwith a gap');

    const before = exportEntries(context.store.doc, '')[1]?.content;
    compactDay(context.store.doc, context.store.actor.systemOrigin, old, TODAY);
    const after = exportEntries(context.store.doc, '')[1]?.content;

    expect(after).toBe(before);
  });
});
