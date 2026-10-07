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
import { openCredential, openEnvelope, hkdf, fields, utf8, hex } from '../crdt/custodyCrypto';
import { sealGeneration, openGeneration, type GenerationWrap } from './generationWrap';
import { unhex } from '../../account-protocol/recovery';
import { SEAL_LIMIT } from '../crdt/custodyRecord';
import { prepareAccountCatchup } from '../crdt/accountCatchup';
import { requireAccountAccess, type LocalPasskey } from '../crdt/accountAccess';
import type { BindingProof } from '../../account-protocol/slot';
import type {
  CheckpointAuthority,
  ContentCheckpoint,
} from '../../account-protocol/contentCheckpoint';
export interface InstalledContentKey {
  sequence: number;
  ct: string;
}
export interface CeremonyVault {
  load(): Promise<unknown>;
  save(value: unknown, check?: () => void): Promise<void>;
  sign(message: Uint8Array<ArrayBuffer>): Promise<string>;
  wrapContent(
    recipient: string,
    info: Uint8Array<ArrayBuffer>,
    workspace: string,
  ): Promise<GenerationWrap>;
  sealIncoming(
    wrap: GenerationWrap,
    info: Uint8Array<ArrayBuffer>,
    deliveryHash: string,
  ): Promise<InstalledContentKey>;
  checkInstalled(seal: InstalledContentKey, deliveryHash: string): Promise<void>;
  withInstalledKey<T>(
    seal: InstalledContentKey,
    deliveryHash: string,
    work: (key: Uint8Array<ArrayBuffer>) => Promise<T>,
  ): Promise<T>;
  authorize(
    binding: BindingProof,
    authority: CheckpointAuthority,
    assert: LocalPasskey,
  ): Promise<void>;
  prepareCheckpoint(
    authority: CheckpointAuthority,
    assert: LocalPasskey,
  ): Promise<ContentCheckpoint>;
  participant: { id: string; wPub: string; sPub: string };
  marker: Awaited<ReturnType<typeof readPromotion>>['marker'];
}
export async function withCeremonyVault<T>(
  slotId: string,
  code: string,
  signal: AbortSignal,
  work: (owner: CeremonyVault) => Promise<T>,
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
        const incomingKey = () =>
          hkdf(
            root,
            new Uint8Array(),
            fields('done/installed-content-key/v1', slotId, record.root_id),
            { name: 'AES-GCM', length: 256 },
            ['encrypt', 'decrypt'],
            subtle,
          );
        const incomingAad = (deliveryHash: string) => {
          unhex(deliveryHash, 32);
          return fields('done/installed-content-key/v1', slotId, record.root_id, deliveryHash);
        };
        const withInstalledKey = async <T>(
          seal: InstalledContentKey,
          deliveryHash: string,
          work: (key: Uint8Array<ArrayBuffer>) => Promise<T>,
        ) => {
          if (
            !Number.isSafeInteger(seal.sequence) ||
            seal.sequence < 1 ||
            seal.sequence > record.seal_reserved
          )
            throw Error('Invalid content key reservation');
          const content = new Uint8Array(
            await subtle.decrypt(
              { name: 'AES-GCM', iv: iv(seal.sequence), additionalData: incomingAad(deliveryHash) },
              await incomingKey(),
              unhex(seal.ct, 48),
            ),
          );
          try {
            if (content.length !== 32) throw Error('Invalid installed key');
            return await work(content);
          } finally {
            content.fill(0);
          }
        };
        return work({
          participant,
          get marker() {
            return marker;
          },
          withInstalledKey,
          authorize: (binding, a, assert) =>
            requireAccountAccess(task, binding, a.base.pin, assert),
          prepareCheckpoint: async (a, assert) => {
            const checkpoint = await prepareAccountCatchup(
              task,
              { slotId, code, pin: a.base.pin, assertPasskey: assert, signal },
              a,
            );
            ({ claim, record, marker } = await readPromotion(task, slotId, code));
            return checkpoint;
          },
          wrapContent: async (recipient, info, workspace) => {
            if (
              !marker?.admission?.receipt ||
              marker.source.workspaceId !== workspace ||
              !record.envelope ||
              record.envelope.gen !== 1
            )
              throw Error('Content source changed');
            const key = await openEnvelope(scope, root, record.envelope, subtle);
            try {
              return await sealGeneration(unhex(recipient, 32), info, key, subtle);
            } finally {
              key.fill(0);
            }
          },
          sealIncoming: async (wrap, info, deliveryHash) => {
            const wrapping = await openCredential(scope, root, credentials[0], subtle);
            const content = await openGeneration(
              wrap,
              wrapping,
              credentials[0].publicKey,
              info,
              subtle,
            );
            try {
              if (content.length !== 32 || record.seal_reserved + 1 >= SEAL_LIMIT)
                throw Error('Content key storage limit');
              await commit({ ...record, seal_reserved: record.seal_reserved + 1 });
              const sequence = record.seal_reserved;
              const ct = hex(
                new Uint8Array(
                  await subtle.encrypt(
                    {
                      name: 'AES-GCM',
                      iv: iv(sequence),
                      additionalData: incomingAad(deliveryHash),
                    },
                    await incomingKey(),
                    content,
                  ),
                ),
              );
              return { sequence, ct };
            } finally {
              content.fill(0);
            }
          },
          checkInstalled: async (seal, deliveryHash) => {
            if (
              !Number.isSafeInteger(seal.sequence) ||
              seal.sequence < 1 ||
              seal.sequence > record.seal_reserved
            )
              throw Error('Invalid content key reservation');
            const key = new Uint8Array(
              await subtle.decrypt(
                {
                  name: 'AES-GCM',
                  iv: iv(seal.sequence),
                  additionalData: incomingAad(deliveryHash),
                },
                await incomingKey(),
                unhex(seal.ct, 48),
              ),
            );
            try {
              if (key.length !== 32) throw Error('Invalid installed key');
            } finally {
              key.fill(0);
            }
          },
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
