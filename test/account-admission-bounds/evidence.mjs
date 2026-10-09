import { createHash } from 'node:crypto';
export const byteHash = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const objectHash = (value) => byteHash(JSON.stringify(value));
export const publicKey = (key) =>
  key.export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex');
export function compactCompletion(c) {
  const { sv, ds, ...manifest } = c.manifest;
  const { derivedSv, derivedDs, ...admission } = c.admission;
  if (sv !== derivedSv || ds !== derivedDs) throw Error('Evidence coverage differs');
  return {
    manifest,
    admission,
    coverage: Object.fromEntries(
      Object.entries({ sv, ds }).map(([name, value]) => [
        name,
        { bytes: value.length / 2, sha256: byteHash(Buffer.from(value, 'hex')) },
      ]),
    ),
  };
}
