/** UTC calendar buckets, keeping the newest snapshot in each; the verified anchor always survives. */
export interface BackupVersion {
  fileId: string;
  fileName: string;
  capturedAt: number;
  sha256: string;
  bytes: number;
}
export function parseBackupName(prefix: string, name: string) {
  if (!name.startsWith(prefix)) return undefined;
  const match = /^(\d{13})-([0-9a-f]{32})-([0-9a-f]{64})\.tar\.gz\.age$/.exec(
    name.slice(prefix.length),
  );
  if (!match) return undefined;
  return { capturedAt: Number(match[1]), sha256: match[3]! };
}
export function retentionDeletes(versions: BackupVersion[], anchorId: string, now: number) {
  if (!Number.isSafeInteger(now) || !versions.some((v) => v.fileId === anchorId))
    throw Error('Retention needs its verified anchor');
  if (new Set(versions.map((v) => v.fileId)).size !== versions.length)
    throw Error('Duplicate backup version');
  const keep = new Set([anchorId]),
    hours = new Set<number>(),
    days = new Set<number>();
  const hour = 3600000,
    day = 24 * hour;
  for (const v of [...versions].sort(
    (a, b) => b.capturedAt - a.capturedAt || b.fileId.localeCompare(a.fileId),
  )) {
    if (v.capturedAt > now) {
      keep.add(v.fileId);
      continue;
    } // Clock rollback must not authorize deletion.
    if (now - v.capturedAt <= 300000) keep.add(v.fileId);
    const h = Math.floor(v.capturedAt / hour),
      d = Math.floor(v.capturedAt / day);
    if (h >= Math.floor(now / hour) - 5 && !hours.has(h)) {
      hours.add(h);
      keep.add(v.fileId);
    }
    if (d >= Math.floor(now / day) - 6 && !days.has(d)) {
      days.add(d);
      keep.add(v.fileId);
    }
  }
  return versions.filter((v) => !keep.has(v.fileId));
}
