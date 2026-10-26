/**
 * Export (TRD §9, PRD principle 4).
 *
 * "Your data outlives the app" is a ranked principle, and until sync exists the
 * export *is* the backup (TRD §10.5). It is a zip of plain markdown built in
 * the page — no server, nothing to be down.
 *
 * ```
 * master.md
 * days/2026-08-05.md
 * ```
 *
 * Documents are dumped verbatim; collections go through the one serializer.
 * A day compacted by a legacy client exports identically to an uncompacted one,
 * because `readDayContent` reads through the archive.
 */

import { toISODate } from '../lib/date';
import { nowLocal, type PlainDateTime } from '../lib/temporal';
import { zip, type ZipEntry } from '../lib/zip';
import {
  cardBody,
  archiveOf,
  cardGoalsContext,
  cardsIn,
  dayAt,
  isDayEmpty,
  listDays,
  unfiledCards,
  SECTIONS,
  type GoalsContext,
  type Section,
} from './days';
import { readDayContent, serializeCardList, serializeDay } from './serialize';
import type { YDoc } from './yjs';

export const exportEntries = (doc: YDoc, master: string): ZipEntry[] => {
  const entries: ZipEntry[] = [{ path: 'master.md', content: master }];
  const contexts: {
    file: string;
    section: Section | null;
    index: number;
    headings: GoalsContext;
  }[] = [];

  for (const date of listDays(doc)) {
    const day = dayAt(doc, date);
    if (isDayEmpty(day)) continue;
    entries.push({ path: `days/${date}.md`, content: serializeDay(readDayContent(doc, date)) });
    // readDayContent gives a retained archive precedence over live collections.
    // Never attach a live card's context to an unrelated archived list position.
    if (!archiveOf(day))
      for (const section of SECTIONS)
        cardsIn(doc, date, section).forEach((card, index) => {
          const headings = cardGoalsContext(card);
          if (headings) contexts.push({ file: `days/${date}.md`, section, index, headings });
        });
  }

  const unfiled = unfiledCards(doc);
  if (unfiled.length > 0) {
    unfiled.forEach(({ card }, index) => {
      const headings = cardGoalsContext(card);
      if (headings) contexts.push({ file: 'unfiled.md', section: null, index, headings });
    });
    const cards = serializeCardList(unfiled.map(({ card }) => cardBody(card)));
    const provenance = unfiled
      .map(({ id, location }, index) => {
        const lastKnown = location ? `${location.date} / ${location.section}` : 'unavailable';
        return `${index + 1}. \`${id}\` — last known: ${lastKnown}`;
      })
      .join('\n');
    entries.push({
      path: 'unfiled.md',
      content: [
        '# Unfiled',
        '',
        'Cards retained because no normal collection can currently display them.',
        '',
        '## Cards',
        '',
        cards,
        '',
        '## Provenance',
        '',
        provenance,
        '',
      ].join('\n'),
    });
  }

  // Preserve the optional snapshots without rewriting the user's Markdown.
  if (contexts.length)
    entries.push({
      path: 'goals-context.json',
      content: JSON.stringify({ v: 1, cards: contexts }, null, 2) + '\n',
    });
  return entries;
};

export const exportArchive = (
  doc: YDoc,
  master: string,
  now: PlainDateTime = nowLocal(),
): Uint8Array => zip(exportEntries(doc, master), now);

/** `done-2026-08-05.zip`. */
export const exportFilename = (now: PlainDateTime = nowLocal()): string =>
  `done-${toISODate(now)}.zip`;

export const downloadExport = (
  doc: YDoc,
  master: string,
  now: PlainDateTime = nowLocal(),
): void => {
  const blob = new Blob([exportArchive(doc, master, now) as BlobPart], {
    type: 'application/zip',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = exportFilename(now);
  link.click();
  URL.revokeObjectURL(url);
};
