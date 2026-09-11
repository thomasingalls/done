export * from '../account-editing/browser';
import { hex } from '../../src/crdt/custodyCrypto';
import { deriveStoreName } from '../../src/crdt/storeName';
import { journalPrefix } from '../../src/crdt/journalCodec';
import { withPromotionSlot } from '../../src/crdt/writeSession';
import { readPromotion, withPromotionRoot, signPromotion } from '../../src/crdt/promotionRecord';
import { put } from '../account-promotion/browser';
let traces: unknown[] = [];
let temporary: Uint8Array[] = [];
export function observe() {
  traces = [];
  temporary = [];
  const p = SubtleCrypto.prototype,
    derive = p.deriveKey,
    encrypt = p.encrypt,
    decrypt = p.decrypt;
  const keys = new WeakSet<CryptoKey>();
  const b = (v: BufferSource) =>
    v instanceof ArrayBuffer
      ? new Uint8Array(v)
      : new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
  p.deriveKey = async function (...args: Parameters<SubtleCrypto['deriveKey']>) {
    const result = await derive.apply(this, args),
      input = args[0] as HkdfParams;
    if (input.info && new TextDecoder().decode(b(input.info)).includes('done/checkpoint/v1')) {
      keys.add(result);
      traces.push({
        kind: 'key',
        info: hex(b(input.info)),
        salt: hex(b(input.salt)),
        hash: input.hash,
        algorithm: result.algorithm,
        extractable: result.extractable,
        usages: result.usages,
      });
    }
    return result;
  };
  p.encrypt = async function (...args: Parameters<SubtleCrypto['encrypt']>) {
    const result = await encrypt.apply(this, args);
    if (keys.has(args[1])) {
      const a = args[0] as AesGcmParams;
      temporary.push(b(args[2]));
      traces.push({
        kind: 'seal',
        nonce: hex(b(a.iv)),
        aad: hex(b(a.additionalData!)),
        plaintext: hex(b(args[2])),
        ct: hex(new Uint8Array(result)),
        tagLength: a.tagLength ?? 128,
      });
    }
    return result;
  };
  p.decrypt = async function (...args: Parameters<SubtleCrypto['decrypt']>) {
    const result = await decrypt.apply(this, args);
    if (keys.has(args[1])) {
      const a = args[0] as AesGcmParams;
      temporary.push(new Uint8Array(result));
      traces.push({
        kind: 'open',
        nonce: hex(b(a.iv)),
        aad: hex(b(a.additionalData!)),
        ct: hex(b(args[2])),
        tagLength: a.tagLength ?? 128,
      });
    }
    return result;
  };
}
export const observations = () => ({
  traces,
  temporary: temporary.map((x) => ({ length: x.length, zero: x.every((b) => b === 0) })),
});
export const wire = (v: unknown): unknown =>
  v instanceof Uint8Array
    ? hex(v)
    : Array.isArray(v)
      ? v.map(wire)
      : v && typeof v === 'object'
        ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, wire(x)]))
        : v;
export async function journalRows(scope: { principalId: string; workspaceId: string }) {
  const prefix = journalPrefix(await deriveStoreName(scope.principalId, scope.workspaceId));
  return Object.keys(localStorage)
    .filter((k) => k.startsWith(prefix))
    .sort()
    .map((k) => [k, localStorage.getItem(k)!]);
}
export async function tamper(slotId: string, code: string, field: string) {
  // Test-only malformed retained state: authenticate the local carrier, leaving service proofs intact.
  await withPromotionSlot(slotId, code, async (task) => {
    const { claim, record, marker } = await readPromotion(task, slotId, code);
    await withPromotionRoot(task, claim, record, code, async (root, subtle) => {
      const next = structuredClone(marker!);
      if (field === 'receipt') next.admission!.receipt!.signature = '00'.repeat(64);
      else {
        const cp = next.genesis!.checkpoint;
        if (field === 'candidate') next.genesis!.signature = '00'.repeat(64);
        else {
          const k = field as 'salt' | 'nonce' | 'ct';
          cp[k] = (cp[k][0] === '0' ? '1' : '0') + cp[k].slice(1);
        }
        next.admission!.request.candidate = structuredClone(next.genesis!);
      }
      await put([slotId, 'application-upgrade'], await signPromotion(root, next, subtle));
    });
  });
}
