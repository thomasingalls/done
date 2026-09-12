/** WebAuthn ES256 uses DER Ecdsa-Sig-Value; WebCrypto expects fixed-width r || s.
 * https://www.w3.org/TR/webauthn-3/#sctn-signature-attestation-types
 * Accept only canonical positive DER INTEGERs fitting P-256; crypto verifies scalar validity. */
export function es256Signature(der: Uint8Array): Uint8Array | null {
  if (der.length < 8 || der.length > 72 || der[0] !== 0x30 || der[1] !== der.length - 2)
    return null;
  const raw = new Uint8Array(64);
  let offset = 2;
  for (let i = 0; i < 2; i++) {
    if (der[offset++] !== 0x02) return null;
    const length = der[offset++];
    if (!length || length > 33 || offset + length > der.length) return null;
    let integer = der.subarray(offset, offset + length);
    offset += length;
    if ((integer[0]! & 0x80) !== 0) return null;
    if (integer[0] === 0 && length > 1) {
      if ((integer[1]! & 0x80) === 0) return null;
      integer = integer.subarray(1);
    }
    if (integer.length > 32) return null;
    raw.set(integer, i * 32 + 32 - integer.length);
  }
  return offset === der.length ? raw : null;
}
