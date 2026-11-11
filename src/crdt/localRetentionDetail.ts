/** Presentation detail for a parked local reduction. No imports: the page bundle shares it. */
/** Which limit or condition parked a `capacity` outcome (phase 543). Sizes and counts only. */
export const LOCAL_RETENTION_CAUSES = [
  // The new smaller-history snapshot is larger than this build writes (bytes).
  'snapshot-size',
  // More unsent source capsules than a snapshot carries (capsules).
  'snapshot-sources',
  // More publishers than a snapshot records (publishers).
  'snapshot-publishers',
  // The resumable preparation progress cannot take another saved slice (bytes).
  'resume-progress',
  // The index of saved preparation slices outgrew its record (bytes).
  'resume-index',
  // The saved-row list a resumable checkpoint binds outgrew its bound; `needed` is a floor (bytes).
  'resume-history',
  // A pass with nothing saved to resume was cut short by routine queued work. Not a size limit.
  'interrupted',
] as const;
export type LocalRetentionCause = (typeof LOCAL_RETENTION_CAUSES)[number];
export interface LocalRetentionDetail {
  readonly cause: LocalRetentionCause;
  /** What the refused work needed, in the cause's unit. */
  readonly needed?: number;
  /** What this build allows, in the same unit. */
  readonly allowed?: number;
}
/** Closed copy of an untrusted detail; anything else is dropped so presentation falls back. */
export function copyRetentionDetail(input: unknown): LocalRetentionDetail | undefined {
  if (!input || typeof input !== 'object' || Object.getPrototypeOf(input) !== Object.prototype)
    return undefined;
  const d = Object.getOwnPropertyDescriptors(input);
  const value = (k: string): unknown => (d[k] && 'value' in d[k] ? d[k].value : undefined);
  const cause = value('cause'),
    needed = value('needed'),
    allowed = value('allowed');
  const size = (v: unknown) => v === undefined || (Number.isSafeInteger(v) && (v as number) >= 0);
  if (
    Reflect.ownKeys(input).some(
      (k) =>
        typeof k !== 'string' || !['cause', 'needed', 'allowed'].includes(k) || !('value' in d[k]!),
    ) ||
    !LOCAL_RETENTION_CAUSES.includes(cause as LocalRetentionCause) ||
    !size(needed) ||
    !size(allowed) ||
    (cause === 'interrupted' && (needed !== undefined || allowed !== undefined))
  )
    return undefined;
  return Object.freeze({
    cause: cause as LocalRetentionCause,
    ...(needed !== undefined ? { needed: needed as number } : {}),
    ...(allowed !== undefined ? { allowed: allowed as number } : {}),
  });
}
