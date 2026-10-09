/**
 * The store-name derivation's domain tag.
 *
 * **Unsalted, deliberately, and this is the augmentation point.** §6.5 requires
 * only that a name not be guessable *from a workspace identifier alone*, which
 * binding the principal satisfies; it does not require that a holder of both
 * ids be unable to compute the name. Deriving rather than minting keeps a store
 * re-discoverable when the index is lost, which an opaque name would forfeit.
 * If the principal id ever becomes guessable, the repair is one more `lp()` of
 * device-local salt in this input — the derivation is the only thing that would
 * change, and existing stores would need re-naming under it.
 */
const NAME_LABEL = 'done/store-name/v1';

const utf8 = (value: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(value);

const concat = (...parts: Uint8Array[]): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
};

/** Length-prefixed field: `uint16be(byteLength) || utf8`. Row 3's convention. */
const lp = (value: string): Uint8Array<ArrayBuffer> => {
  const bytes = utf8(value);
  if (bytes.length > 0xffff) throw new Error(`Field too long to length-prefix: ${bytes.length}`);
  return concat(new Uint8Array([bytes.length >> 8, bytes.length & 0xff]), bytes);
};

const hex = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

/**
 * `SHA-256( LP(label) || LP(principal) || LP(workspace) )`, truncated to 128
 * bits. Length-prefixing is what stops `("ab", "c")` and `("a", "bc")` naming
 * one store; 128 bits is a name rather than a key, and collision here is a
 * local-store overlap rather than a cryptographic failure.
 */
export const deriveStoreName = async (principal: string, workspace: string): Promise<string> => {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    concat(lp(NAME_LABEL), lp(principal), lp(workspace)),
  );
  return `done.${hex(new Uint8Array(digest).subarray(0, 16))}`;
};
