/**
 * Short ids. Six lowercase alphanumeric characters is the format the block
 * marker syntax uses (TRD §4.6); the same generator serves anything else that
 * needs an opaque handle.
 */

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

export const newId = (length = 6): string => {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const byte of bytes) out += ALPHABET[byte % ALPHABET.length];
  return out;
};

/** Matches a trailing block marker, e.g. `- [ ] Draft the plan ^k3f9x2`. */
export const BLOCK_MARKER = /\s\^([a-z0-9]{6})\s*$/;
