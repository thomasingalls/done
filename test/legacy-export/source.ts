import { Y } from '../../src/crdt/yjs';
import { newCard, ensureDay, SECTIONS, setCardLocation } from '../../src/crdt/days';

export interface SourceDay {
  date: string;
  next: string[];
  scheduled: string[];
  done: string[];
  archive?: string;
  /** Removed day-level prose feature; distinct from the durability journal. */
  obsoleteJournal?: string;
}
export interface SourceInput {
  master: string;
  days: SourceDay[];
  orphan: string;
  suffix: string;
}
export const cardKey = (day: number, section: string, index: number) =>
  `card-${day}-${section}-${index}`;
/** Fixture producer only. The oracle retains input strings outside the browser and never reads this doc. */
export const makeExportSource = (input: SourceInput) => {
  const doc = new Y.Doc({ gc: false });
  doc.clientID = 101;
  doc.transact(() => {
    doc.getMap('meta').set('schemaVersion', 4);
    doc.getMap('meta').set('createdAt', '2026-08-01T00:00:00Z');
    doc.getMap('meta').set('actor:human', { kind: 'human', name: 'Human', color: '#aa0000' });
    doc.getText('master').insert(0, input.master);
    input.days.forEach((day, d) => {
      const target = ensureDay(doc, 'fixture', day.date);
      if (day.obsoleteJournal !== undefined) target.set('journal', new Y.Text(day.obsoleteJournal));
      if (day.archive !== undefined) {
        for (const section of SECTIONS) target.delete(section);
        target.set('archive', new Y.Text(day.archive));
      } else {
        for (const section of SECTIONS)
          day[section].forEach((body, i) => {
            const id = cardKey(d, section, i);
            doc
              .getMap('cards')
              .set(
                id,
                newCard(body, 'human', { id, origin: 'master', createdAt: '2026-08-01T00:00:00Z' }),
              );
            setCardLocation(doc, id, { date: day.date, section });
            (target.get(section) as Y.Array<string>).push([id]);
          });
      }
    });
    doc.getMap('cards').set(
      'orphan',
      newCard(input.orphan, 'human', {
        id: 'orphan',
        origin: 'master',
        createdAt: '2026-08-01T00:00:00Z',
      }),
    );
  });
  const base = Y.encodeStateAsUpdate(doc);
  const second = new Y.Doc({ gc: false });
  second.clientID = 202;
  Y.applyUpdate(second, base);
  let insertion!: Uint8Array;
  second.on('update', (bytes: Uint8Array) => {
    insertion = bytes;
  });
  second.getText('master').insert(second.getText('master').length, input.suffix);
  Y.applyUpdate(doc, insertion);
  const third = new Y.Doc({ gc: false });
  third.clientID = 303;
  Y.applyUpdate(third, base);
  Y.applyUpdate(third, insertion);
  let deletion!: Uint8Array;
  third.on('update', (bytes: Uint8Array) => {
    deletion = bytes;
  });
  // Deletes from the journal-only insertion. The final master requires both updates.
  third.getText('master').delete(input.master.length, 1);
  Y.applyUpdate(doc, deletion);
  second.destroy();
  third.destroy();
  return { doc, updates: [base, insertion, deletion].map((bytes) => [...bytes]) };
};
