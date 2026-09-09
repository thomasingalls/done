/** Private migration preparation; no import, exclusion, selection or deletion authority. */
import { fromBase64, toBase64 } from 'lib0/buffer';
import { inspectLegacySource, LegacySourceError } from './legacySource';
import type { SessionTask } from './writeSession';
import { Y, hasPendingUpdates, hasSequenceContent, hasNonTextContent, type YDoc } from './yjs';
import { exportEntries } from './export';
import { SECTIONS, cardsIn, unfiledCards } from './days';
import { parseDay, serializeDay } from './serialize';
import { Temporal } from '../lib/temporal';
import { zip, type ZipEntry } from '../lib/zip';

const KIND = 'done-legacy-source-recovery';
const MAX_PACKET = 64 * 1024 * 1024;
const MAX_UPDATES = 8192;
const MAX_UPDATE_BYTES = 32 * 1024 * 1024;
const DIGEST = /^[0-9a-f]{64}$/u;
const ROOTS = ['meta', 'master', 'days', 'cards', 'cardLocations'];
function refuse(reason: string): never {
  throw new LegacySourceError(reason);
}
const sha256 = async (bytes: Uint8Array<ArrayBuffer>): Promise<string> =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');

interface RecoveryRecord {
  carrier: 'disk' | 'journal';
  id: number | string;
  update: string;
}
interface RecoveryPacket {
  kind: typeof KIND;
  v: 1;
  origin: string;
  sourceDigest: string;
  records: RecoveryRecord[];
}
export interface LegacyExportCapture {
  readonly kind: 'legacy-export-candidate';
  readonly preview: 'markdown-v1';
  readonly sourceDigest: string;
  readonly recovery: Uint8Array<ArrayBuffer>;
  readonly recoveryDigest: string;
  readonly markdown: Uint8Array<ArrayBuffer>;
  readonly markdownDigest: string;
}
const plain = (text: unknown): string => {
  if (
    !(text instanceof Y.Text) ||
    hasNonTextContent(text) ||
    Object.keys(text.getAttributes()).length ||
    text
      .toDelta()
      .some(
        (d: { insert: unknown; attributes?: Record<string, unknown> }) =>
          typeof d.insert !== 'string' || (d.attributes && Object.keys(d.attributes).length),
      )
  )
    refuse('unsupported-legacy-text');
  return text.toString();
};
const mapOnly = (value: unknown): value is Y.Map<unknown> =>
  value instanceof Y.Map && !hasSequenceContent(value);
const date = (value: string) => {
  try {
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(value) || Temporal.PlainDate.from(value).toString() !== value)
      refuse('unsupported-legacy-date');
  } catch {
    refuse('unsupported-legacy-date');
  }
};
const fields = (value: object, allowed: string[]) => {
  if (Object.keys(value).sort().join(',') !== [...allowed].sort().join(','))
    refuse('unsupported-recovery-packet');
};

/** Strict schema-4 projection. Never initialize actors/schema or run membership repair. */
const previewEntries = (doc: YDoc): ZipEntry[] => {
  if ([...doc.share.keys()].some((name) => !ROOTS.includes(name)))
    refuse('unsupported-legacy-root');
  if (doc.getMap('meta').get('schemaVersion') !== 4) refuse('unsupported-legacy-schema');
  const master = plain(doc.getText('master')),
    days = doc.getMap('days'),
    cards = doc.getMap('cards'),
    locations = doc.getMap('cardLocations');
  if (![doc.getMap('meta'), days, cards, locations].every(mapOnly))
    refuse('unsupported-legacy-root-type');
  for (const [id, card] of cards) {
    if (
      !mapOnly(card) ||
      card.get('id') !== id ||
      !id ||
      typeof card.get('author') !== 'string' ||
      typeof card.get('createdAt') !== 'string' ||
      (card.get('origin') !== null && typeof card.get('origin') !== 'string') ||
      [...card.keys()].some((k) => !['id', 'text', 'author', 'origin', 'createdAt'].includes(k))
    )
      refuse('unsupported-legacy-card');
    plain(card.get('text'));
  }
  for (const [id, location] of locations) {
    if (!cards.has(id) || typeof location !== 'string') refuse('unsupported-legacy-location');
    const match = /^(\d{4}-\d{2}-\d{2}):(next|scheduled|done)$/u.exec(location);
    if (!match) refuse('unsupported-legacy-location');
    date(match[1]!);
  }
  const represented = new Set<string>();
  for (const [iso, day] of days) {
    date(iso);
    if (!mapOnly(day) || [...day.keys()].some((k) => ![...SECTIONS, 'archive'].includes(k)))
      refuse('unsupported-legacy-day');
    const archive = day.get('archive');
    if (archive !== undefined) {
      const body = plain(archive);
      if (serializeDay(parseDay(body)) !== body) refuse('noncanonical-legacy-archive');
      if (SECTIONS.some((section) => day.has(section))) refuse('mixed-legacy-archive');
    }
    for (const section of SECTIONS) {
      const collection = day.get(section);
      if (
        collection !== undefined &&
        (!(collection instanceof Y.Array) ||
          collection.toArray().some((id) => typeof id !== 'string' || !cards.has(id)))
      )
        refuse('unsupported-legacy-collection');
      for (const card of cardsIn(doc, iso, section)) represented.add(card.get('id') as string);
    }
  }
  for (const { id } of unfiledCards(doc)) represented.add(id);
  // A location pointing at an extant collection which omits its card otherwise
  // vanishes from both ordinary day files and unfiled.md. Refuse; do not repair.
  if (represented.size !== cards.size) refuse('legacy-membership-needs-repair');
  return exportEntries(doc, master);
};

const readPacket = (bytes: Uint8Array<ArrayBuffer>): RecoveryPacket => {
  if (bytes.length > MAX_PACKET) refuse('recovery-packet-limit');
  let packet: RecoveryPacket;
  try {
    packet = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return refuse('unreadable-recovery-packet');
  }
  if (!packet || typeof packet !== 'object') refuse('unsupported-recovery-packet');
  fields(packet, ['kind', 'v', 'origin', 'sourceDigest', 'records']);
  if (
    packet.kind !== KIND ||
    packet.v !== 1 ||
    typeof packet.origin !== 'string' ||
    typeof packet.sourceDigest !== 'string' ||
    !DIGEST.test(packet.sourceDigest) ||
    !Array.isArray(packet.records) ||
    packet.records.length > MAX_UPDATES
  )
    refuse('unsupported-recovery-packet');
  try {
    const url = new URL(packet.origin);
    if (!['https:', 'http:'].includes(url.protocol) || url.origin !== packet.origin)
      refuse('unsupported-recovery-origin');
  } catch {
    refuse('unsupported-recovery-origin');
  }
  return packet;
};

const project = (packet: RecoveryPacket): ZipEntry[] => {
  const doc = new Y.Doc({ gc: false }),
    ids = new Set<string>();
  let total = 0;
  try {
    for (const record of packet.records) {
      if (!record || typeof record !== 'object') refuse('unsupported-recovery-record');
      fields(record, ['carrier', 'id', 'update']);
      if (
        (record.carrier !== 'disk' && record.carrier !== 'journal') ||
        (record.carrier === 'disk'
          ? !Number.isSafeInteger(record.id) || (record.id as number) < 1
          : typeof record.id !== 'string' ||
            !/^done\.pending-update\.done\.[A-Za-z0-9_-]+\.(0|[1-9][0-9]*)$/u.test(record.id)) ||
        typeof record.update !== 'string'
      )
        refuse('unsupported-recovery-record');
      const identity = JSON.stringify([record.carrier, record.id]);
      if (ids.has(identity)) refuse('duplicate-recovery-record');
      ids.add(identity);
      let update: Uint8Array;
      try {
        update = fromBase64(record.update);
        if (toBase64(update) !== record.update) refuse('unreadable-recovery-update');
        total += update.length;
        if (total > MAX_UPDATE_BYTES) refuse('recovery-packet-limit');
        Y.decodeUpdate(update);
        Y.applyUpdate(doc, update);
      } catch (error) {
        if (error instanceof LegacySourceError) throw error;
        return refuse('unreadable-recovery-update');
      }
    }
    if (hasPendingUpdates(doc)) refuse('legacy-dependencies-missing');
    let changed = false;
    doc.on('update', () => {
      changed = true;
    });
    const entries = previewEntries(doc);
    if (changed) refuse('legacy-projection-mutated');
    return entries;
  } finally {
    doc.destroy();
  }
};

/** File-only replay. Expected digest must come from the separate capture record, not the file itself.
 * It checks integrity relative to that digest, not authenticity of source, attribution or exclusion. */
export const replayLegacyExport = async (raw: Uint8Array<ArrayBuffer>, expectedDigest: string) => {
  if (raw.length > MAX_PACKET) refuse('recovery-packet-limit');
  const bytes = raw.slice(); // Caller mutation during digest cannot substitute different replay bytes.
  if (!DIGEST.test(expectedDigest) || (await sha256(bytes)) !== expectedDigest)
    refuse('recovery-digest-mismatch');
  const packet = readPacket(bytes);
  return { origin: packet.origin, sourceDigest: packet.sourceDigest, entries: project(packet) };
};

/** Explicit Markdown preview adapter, not the selection of a migration carrier. All output is private
 * plaintext in memory. The controlled fixture alone persists synthetic examples outside the origin. */
export const captureLegacyExport = async (
  task: SessionTask,
  options: { preview: 'markdown-v1' },
): Promise<LegacyExportCapture> => {
  if (options?.preview !== 'markdown-v1') refuse('explicit-preview-required');
  const source = await inspectLegacySource(task);
  if (source.dependencies !== 'complete') refuse('legacy-dependencies-missing');
  const packet: RecoveryPacket = {
    kind: KIND,
    v: 1,
    origin: globalThis.location.origin,
    sourceDigest: source.digest,
    // Journal first, preserving the source-reader replay order and original framing.
    records: [
      ...source.journal.map(
        (row): RecoveryRecord => ({ carrier: 'journal', id: row.key, update: toBase64(row.bytes) }),
      ),
      ...source.updates.map(
        (row): RecoveryRecord => ({ carrier: 'disk', id: row.key, update: toBase64(row.bytes) }),
      ),
    ],
  };
  const recovery = task.step(() => new TextEncoder().encode(JSON.stringify(packet)));
  const entries = task.step(() => project(readPacket(recovery)));
  const markdown = task.step(
    () => new Uint8Array(zip(entries, Temporal.PlainDateTime.from('1980-01-01T00:00'))),
  );
  const recoveryDigest = await task.wait(() => sha256(recovery)),
    markdownDigest = await task.wait(() => sha256(markdown));
  const after = await inspectLegacySource(task);
  if (after.digest !== source.digest) refuse('source-changed');
  return {
    kind: 'legacy-export-candidate',
    preview: options.preview,
    sourceDigest: source.digest,
    recovery,
    recoveryDigest,
    markdown,
    markdownDigest,
  };
};
