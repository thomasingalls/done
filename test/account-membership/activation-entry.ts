/** Disposable native integration probe. Fixture keys never enter the application bundle. */
import { beginLocalGenesis } from '../../src/crdt/localGenesis';
import { withMembershipVault } from '../../src/account/membershipVault';
import {
  loadMembershipWriting,
  type MembershipReadingProgress,
} from '../../src/account/membershipReader';
import { withJoinedSlot } from '../../src/crdt/writeSession';
import { readJoinedAccount, verifyJoinedAccount } from '../../src/crdt/joinedAccount';
import { sealGeneration } from '../../src/account/generationWrap';
import { ceremonyWrapInfo } from '../../account-protocol/ceremony';
import { membershipDeliveryHash } from '../../account-protocol/membershipDelivery';
import { unhex } from '../../account-protocol/recovery';
import type { AuthorityPin } from '../../account-protocol/authority';
import type { MembershipHandoffState } from '../../src/account/membershipHandoff';
import type { JoinedAuthority } from '../../src/crdt/joinedAccount';
declare global {
  interface Window {
    fixtureCheckpoint(body: unknown): Promise<unknown>;
    fixtureRead(bytes: number[]): Promise<number[]>;
    fixturePasskey(challenge: number[]): Promise<{
      credentialId: string;
      authenticatorData: number[];
      clientDataJSON: number[];
      signature: number[];
    }>;
  }
}
const signal = () => new AbortController().signal;
export async function seed(keys: {
  signing: { private: string; public: string };
  wrapping: { private: string; public: string };
}) {
  const real = crypto.subtle.generateKey.bind(crypto.subtle);
  // Deterministic key generation only; the real Local owner still creates and seals its credentials.
  crypto.subtle.generateKey = (async (
    algorithm: AlgorithmIdentifier,
    extractable: boolean,
    usages: KeyUsage[],
  ) => {
    const name = typeof algorithm === 'string' ? algorithm : algorithm.name;
    const material = name === 'Ed25519' ? keys.signing : name === 'X25519' ? keys.wrapping : null;
    if (!material) return real(algorithm, extractable, usages);
    return {
      privateKey: await crypto.subtle.importKey(
        'pkcs8',
        unhex(material.private, 48),
        name,
        true,
        usages,
      ),
      publicKey: await crypto.subtle.importKey(
        'raw',
        unhex(material.public, 32),
        name,
        true,
        name === 'Ed25519' ? ['verify'] : [],
      ),
    };
  }) as typeof crypto.subtle.generateKey;
  const slotId = 'later-native-device';
  try {
    const setup = beginLocalGenesis(slotId),
      code = setup.displayCode!;
    await setup.confirm(code);
    const participant = await withMembershipVault(
      'promotion',
      slotId,
      code,
      signal(),
      async (owner) => owner.participant,
    );
    return { slotId, code, participant };
  } finally {
    crypto.subtle.generateKey = real;
  }
}
export async function wrap(key: string, recipient: string, transcript: string) {
  const raw = unhex(key, 32);
  try {
    return await sealGeneration(
      unhex(recipient, 32),
      ceremonyWrapInfo(transcript),
      raw,
      crypto.subtle,
    );
  } finally {
    raw.fill(0);
  }
}
export async function retain(slotId: string, code: string, content: MembershipHandoffState) {
  await withMembershipVault('promotion', slotId, code, signal(), async (owner) => {
    content.key = await owner.sealIncoming(
      content.delivery.wrap,
      ceremonyWrapInfo(content.delivery.transcriptHash),
      await membershipDeliveryHash(content.delivery),
    );
    await owner.save({ role: 'new', content });
  });
}
export async function install(slotId: string, code: string, authority: JoinedAuthority) {
  return withMembershipVault('promotion', slotId, code, signal(), async (owner) => {
    const p = (await owner.load()) as MembershipReadingProgress;
    const result = await loadMembershipWriting(
      p,
      owner,
      {
        base: authority.base,
        proofs: {
          successor: authority.successor,
          certification: authority.certification,
          continuations: authority.continuations,
        },
      },
      {
        signal: signal(),
        save: () => owner.save(p),
        request: (_path, body) => window.fixtureCheckpoint(body),
        read: async (bytes) => new Uint8Array(await window.fixtureRead([...bytes])),
      },
    );
    if (result.kind !== 'reading') throw Error('Native reader is incomplete');
    await owner.installMembershipWriting(authority, p.reading!, p.content!.key!);
    return result.entries;
  });
}
export async function state(slotId: string, code: string) {
  return withJoinedSlot(
    slotId,
    code,
    async (task) => {
      const value = await readJoinedAccount(task, slotId, code);
      return { v: value.marker?.v, phase: value.marker?.phase };
    },
    signal(),
  );
}
export async function oldOwnerRefuses(slotId: string, code: string) {
  let reached = false;
  try {
    await withMembershipVault('promotion', slotId, code, signal(), async () => {
      reached = true;
    });
  } catch {
    return !reached;
  }
  return false;
}
export async function saveJoinedProgress(slotId: string, code: string) {
  await withMembershipVault('joined', slotId, code, signal(), async (owner) => {
    const value = await owner.load();
    await owner.save(value);
  });
}
export async function activate(
  slotId: string,
  code: string,
  pin: AuthorityPin,
  interruptIndex = false,
) {
  const put = IDBObjectStore.prototype.put;
  let interrupted = false;
  IDBObjectStore.prototype.put = function (value, ...args) {
    if (interruptIndex && this.name === 'slots' && value?.account) {
      interrupted = true;
      throw Error('Interrupted before account index selection');
    }
    return put.call(this, value, ...args);
  };
  try {
    return await withJoinedSlot(
      slotId,
      code,
      async (task) => {
        const verified = await verifyJoinedAccount(task, {
          slotId,
          code,
          pin,
          assertPasskey: async (r) => {
            const a = await window.fixturePasskey([...r.challenge]);
            return {
              credentialId: a.credentialId,
              authenticatorData: new Uint8Array(a.authenticatorData),
              clientDataJSON: new Uint8Array(a.clientDataJSON),
              signature: new Uint8Array(a.signature),
            };
          },
        });
        return {
          epoch: verified.route.epoch,
          credential: verified.route.credential,
          phase: verified.marker!.phase,
          v: verified.marker!.v,
          head: verified.account.epochHead,
        };
      },
      signal(),
    );
  } catch (cause) {
    if (interruptIndex && interrupted) return { interrupted: true };
    throw cause;
  } finally {
    IDBObjectStore.prototype.put = put;
  }
}
