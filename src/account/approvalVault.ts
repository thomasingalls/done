/** Shared encrypted approval primitives; the slot owner supplies authenticated records and atomic commits. */
import {
  openCredential,
  hkdf,
  fields,
  utf8,
  hex,
  type Bytes,
  type SealedCredential,
} from '../crdt/custodyCrypto';
import {
  SEAL_LIMIT,
  CUSTODY_PROGRESS_LIMITS,
  type CustodyRecord,
  type CustodyScope,
} from '../crdt/custodyRecord';
import { openGeneration, type GenerationWrap } from './generationWrap';
import { unhex } from '../../account-protocol/recovery';
export interface InstalledContentKey {
  sequence: number;
  ct: string;
}
export async function createApprovalVault(options: {
  channel?: 'approval' | 'rotation' | 'history';
  slotId: string;
  scope: CustodyScope;
  root: Bytes;
  subtle: SubtleCrypto;
  credentials: [SealedCredential, SealedCredential];
  record(): CustodyRecord;
  commit(next: CustodyRecord, check?: () => void): Promise<void>;
}) {
  const { slotId, scope, root, subtle, credentials, record, commit } = options;
  const rootId = record().root_id;
  const channel = options.channel ?? 'approval';
  const purpose =
    channel === 'approval'
      ? 'done/content-approval-state/v1'
      : channel === 'rotation'
        ? 'done/content-rotation-state/v1'
        : 'done/history-maintenance-state/v1';
  const installedPurpose =
    channel === 'approval' ? 'done/installed-content-key/v1' : 'done/installed-rotation-key/v1';
  const key = await hkdf(
    root,
    new Uint8Array(),
    fields(purpose, slotId, rootId),
    { name: 'AES-GCM', length: 256 },
    ['encrypt', 'decrypt'],
    subtle,
  );
  const aad = (sequence: number) => fields(purpose, slotId, rootId, String(sequence));
  const iv = (sequence: number) => {
    const b = new Uint8Array(12);
    new DataView(b.buffer).setBigUint64(4, BigInt(sequence));
    return b;
  };
  const requireContentChannel = () => {
    if (channel === 'history')
      throw Error('History progress cannot install or release content keys');
  };
  const incomingKey = () => {
    requireContentChannel();
    return hkdf(
      root,
      new Uint8Array(),
      fields(installedPurpose, slotId, rootId),
      { name: 'AES-GCM', length: 256 },
      ['encrypt', 'decrypt'],
      subtle,
    );
  };
  const incomingAad = (deliveryHash: string) => {
    unhex(deliveryHash, 32);
    return fields(installedPurpose, slotId, rootId, deliveryHash);
  };
  const withInstalledKey = async <T>(
    seal: InstalledContentKey,
    deliveryHash: string,
    work: (key: Bytes) => Promise<T>,
  ): Promise<T> => {
    if (
      !Number.isSafeInteger(seal.sequence) ||
      seal.sequence < 1 ||
      seal.sequence > record().seal_reserved
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
  return {
    get activeRotation() {
      return record().active_rotation;
    },
    participant: {
      id: credentials[1].id,
      wPub: hex(credentials[0].publicKey),
      sPub: hex(credentials[1].publicKey),
    },
    openWrap: async (wrap: GenerationWrap, info: Bytes): Promise<Bytes> => {
      requireContentChannel();
      const wrapping = await openCredential(scope, root, credentials[0], subtle);
      return openGeneration(wrap, wrapping, credentials[0].publicKey, info, subtle);
    },
    reserveSeals: async (count: number) => {
      requireContentChannel();
      if (!Number.isSafeInteger(count) || count < 0 || record().seal_reserved + count >= SEAL_LIMIT)
        throw Error('Content key storage limit');
      if (count) await commit({ ...record(), seal_reserved: record().seal_reserved + count });
      return record().seal_reserved;
    },
    withInstalledKey,
    checkInstalled: (seal: InstalledContentKey, deliveryHash: string) =>
      withInstalledKey(seal, deliveryHash, async () => {}),
    sealIncoming: async (
      wrap: GenerationWrap,
      info: Bytes,
      deliveryHash: string,
    ): Promise<InstalledContentKey> => {
      requireContentChannel();
      const wrapping = await openCredential(scope, root, credentials[0], subtle);
      const content = await openGeneration(wrap, wrapping, credentials[0].publicKey, info, subtle);
      try {
        if (content.length !== 32 || record().seal_reserved + 1 >= SEAL_LIMIT)
          throw Error('Content key storage limit');
        await commit({ ...record(), seal_reserved: record().seal_reserved + 1 });
        const sequence = record().seal_reserved;
        const ct = hex(
          new Uint8Array(
            await subtle.encrypt(
              { name: 'AES-GCM', iv: iv(sequence), additionalData: incomingAad(deliveryHash) },
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
    load: async (): Promise<unknown> => {
      const approval = record()[channel];
      if (!approval) return null;
      const { sequence, ct } = approval;
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
    save: async (value: unknown, check?: () => void) => {
      const plain = utf8(JSON.stringify(value));
      try {
        if (
          plain.length > CUSTODY_PROGRESS_LIMITS[channel] - 16 ||
          record().seal_reserved + 1 >= SEAL_LIMIT
        )
          throw Error('Approval storage limit');
        await commit({ ...record(), seal_reserved: record().seal_reserved + 1 }, check);
        const sequence = record().seal_reserved;
        const ct = new Uint8Array(
          await subtle.encrypt(
            { name: 'AES-GCM', iv: iv(sequence), additionalData: aad(sequence) },
            key,
            plain,
          ),
        );
        await commit({ ...record(), [channel]: { v: 1, sequence, ct } }, check);
      } finally {
        plain.fill(0);
      }
    },
    sign: async (message: Bytes) => {
      const signing = await openCredential(scope, root, credentials[1], subtle);
      return hex(new Uint8Array(await subtle.sign('Ed25519', signing, message)));
    },
  };
}
