/** Ephemeral transport ownership only. No summary grants verification or effect permission. */
import { MAX_PENDING_BYTES } from './admissionQueue';
export const RECEIVE_ORIGINALS_MAX_ENTRIES = 8;
export const RECEIVE_ORIGINALS_MAX_POSITIONS = 32;
export interface ReceiveOriginalsUsage {
  readonly bytes: number;
  readonly entries: number;
  readonly positions: number;
}
/** Include still-owned originals and a proposed copy before allocating that copy. */
export function receiveOriginalsFit(...parts: readonly ReceiveOriginalsUsage[]): boolean {
  let bytes = 0,
    entries = 0,
    positions = 0;
  for (const part of parts) {
    if (
      !part ||
      ![part.bytes, part.entries, part.positions].every((n) => Number.isSafeInteger(n) && n >= 0)
    )
      return false;
    bytes += part.bytes;
    entries += part.entries;
    positions += part.positions;
    if (
      bytes > MAX_PENDING_BYTES ||
      entries > RECEIVE_ORIGINALS_MAX_ENTRIES ||
      positions > RECEIVE_ORIGINALS_MAX_POSITIONS
    )
      return false;
  }
  return true;
}
