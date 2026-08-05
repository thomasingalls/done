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
 * Documents are dumped verbatim; collections go through the one serializer,
 * which is the same transformation compaction performs. A compacted day
 * exports identically to an uncompacted one, because `readDayContent` reads
 * through the archive — compaction is invisible here too.
 */

import { zip, type ZipEntry } from '../lib/zip';
import { dayAt, isDayEmpty, listDays } from './days';
import { readDayContent, serializeDay } from './serialize';
import type { YDoc } from './yjs';

export const exportEntries = (doc: YDoc, master: string): ZipEntry[] => {
  const entries: ZipEntry[] = [{ path: 'master.md', content: master }];

  for (const date of listDays(doc)) {
    const day = dayAt(doc, date);
    if (isDayEmpty(day)) continue;
    entries.push({ path: `days/${date}.md`, content: serializeDay(readDayContent(day)) });
  }

  return entries;
};

export const exportArchive = (doc: YDoc, master: string, now = new Date()): Uint8Array =>
  zip(exportEntries(doc, master), now);

/** `done-2026-08-05.zip`. */
export const exportFilename = (now = new Date()): string =>
  `done-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}.zip`;

export const downloadExport = (doc: YDoc, master: string, now = new Date()): void => {
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
