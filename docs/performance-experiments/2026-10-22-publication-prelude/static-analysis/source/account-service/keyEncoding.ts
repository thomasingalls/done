import type { KeyObject } from 'node:crypto';

const seedPrefix = Buffer.from('302e020100300506032b657004220420', 'hex');
const publicPrefix = Buffer.from('302a300506032b6570032100', 'hex');

/** Assert the provider format before extracting the 32-byte Ed25519 seed. */
export function assertEd25519SeedExport(bytes: Buffer): void {
  if (bytes.length !== 48 || !bytes.subarray(0, 16).equals(seedPrefix))
    throw Error('Unexpected Ed25519 PKCS#8 export');
}

export function ed25519PublicHex(key: KeyObject): string {
  const bytes = key.export({ format: 'der', type: 'spki' });
  if (bytes.length !== 44 || !bytes.subarray(0, 12).equals(publicPrefix))
    throw Error('Unexpected Ed25519 SPKI export');
  return bytes.subarray(-32).toString('hex');
}
