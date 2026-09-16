/** Small exclusive operation on the existing mandatory-factor lifecycle, for the private preview. */
import { withPromotionSlot } from '../crdt/writeSession';
import {
  readPromotion,
  withPromotionRoot,
  writePromotion,
  signPromotion,
  signRecord,
} from '../crdt/promotionRecord';
import { claimScope } from '../crdt/localGenesisRecord';
import { openCredential, hkdf, fields, utf8, hex } from '../crdt/custodyCrypto';
import { SEAL_LIMIT } from '../crdt/custodyRecord';
export async function withCeremonyVault<T>(
  slotId: string,
  code: string,
  signal: AbortSignal,
  work: (owner: {
    load(): Promise<unknown>;
    save(value: unknown, check?: () => void): Promise<void>;
    sign(message: Uint8Array<ArrayBuffer>): Promise<string>;
    participant: { id: string; wPub: string; sPub: string };
    marker: Awaited<ReturnType<typeof readPromotion>>['marker'];
  }) => Promise<T>,
) {
  return withPromotionSlot(
    slotId,
    code,
    async (task) => {
      let { claim, record, marker } = await readPromotion(task, slotId, code);
      return withPromotionRoot(task, claim, record, code, async (root, subtle) => {
        const scope = claimScope(claim),
          credentials = marker?.credentials ?? record.credentials!;
        const participant = {
          id: credentials[1].id,
          wPub: hex(credentials[0].publicKey),
          sPub: hex(credentials[1].publicKey),
        };
        const key = await hkdf(
          root,
          new Uint8Array(),
          fields('done/content-approval-state/v1', slotId, record.root_id),
          { name: 'AES-GCM', length: 256 },
          ['encrypt', 'decrypt'],
          subtle,
        );
        const aad = (sequence: number) =>
          fields('done/content-approval-state/v1', slotId, record.root_id, String(sequence));
        const iv = (sequence: number) => {
          const b = new Uint8Array(12);
          new DataView(b.buffer).setBigUint64(4, BigInt(sequence));
          return b;
        };
        const commit = async (next: typeof record, check?: () => void) => {
          next = await signRecord(root, next, subtle);
          const nextMarker = marker
            ? await signPromotion(
                root,
                { ...marker, custodyMac: hex(next.mac), sealReserved: next.seal_reserved },
                subtle,
              )
            : null;
          await writePromotion(task, claim, record, next, marker, nextMarker, check);
          record = next;
          marker = nextMarker;
        };
        return work({
          participant,
          marker,
          load: async () => {
            if (!record.approval) return null;
            const { sequence, ct } = record.approval;
            const plain = new Uint8Array(
              await subtle.decrypt(
                { name: 'AES-GCM', iv: iv(sequence), additionalData: aad(sequence) },
                key,
                ct,
              ),
            );
            try {
              return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plain));
            } finally {
              plain.fill(0);
            }
          },
          save: async (value, check) => {
            const plain = utf8(JSON.stringify(value));
            try {
              if (plain.length > 80 * 1024 * 1024 - 16 || record.seal_reserved + 1 >= SEAL_LIMIT)
                throw Error('Approval storage limit');
              // Reservation commits before encryption. A failed save burns this counter; old state survives.
              await commit({ ...record, seal_reserved: record.seal_reserved + 1 }, check);
              const sequence = record.seal_reserved;
              const ct = new Uint8Array(
                await subtle.encrypt(
                  { name: 'AES-GCM', iv: iv(sequence), additionalData: aad(sequence) },
                  key,
                  plain,
                ),
              );
              await commit({ ...record, approval: { v: 1, sequence, ct } }, check);
            } finally {
              plain.fill(0);
            }
          },
          sign: async (message) => {
            const signing = await openCredential(scope, root, credentials[1], subtle);
            return hex(new Uint8Array(await subtle.sign('Ed25519', signing, message)));
          },
        });
      });
    },
    signal,
  );
}
