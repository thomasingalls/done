import type { Bytes } from './custodyCrypto';

/** Internal, owner-supplied openers. A legacy scalar opens only generation one. */
export type GenerationKeys = Bytes | ReadonlyMap<number, Bytes>;
export function generationKey(keys: GenerationKeys, generation: number): Bytes {
  const key =
    keys instanceof Uint8Array ? (generation === 1 ? keys : undefined) : keys.get(generation);
  if (
    !Number.isSafeInteger(generation) ||
    generation < 1 ||
    generation > 0xffffffff ||
    !(key instanceof Uint8Array) ||
    key.length !== 32
  )
    throw Error('No retained opener for this generation');
  return key;
}
