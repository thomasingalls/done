/** Cleanup-only MAC messages. Never widen custody's shared v1 field encoding. */
import { fields, utf8, type Bytes } from './custodyCrypto';
export type CleanupVersion = 1 | 2;
export const cleanupFields = (
  version: CleanupVersion,
  domain: 'done/legacy-cleanup-entry' | 'done/local-import-cleanup',
  ...values: string[]
): Bytes => {
  // Existing, already-authenticated v1 intents must retain their exact MAC bytes.
  if (version === 1) return fields(`${domain}/v1`, ...values);
  // JSON array framing binds every field, including escaped UTF-16 code units. The
  // reader/manifest bounds still apply; no 16-bit field length wraps or truncates.
  return utf8(JSON.stringify([`${domain}/v2`, ...values]));
};
