import {
  beginLocalGenesis,
  resumeLocalGenesis,
  inspectLocalStartup,
} from '../../src/crdt/localGenesis';
import { withExclusiveSlot } from '../../src/crdt/writeSession';
import { readLocalClaim, verifyLocalClaim, claimScope } from '../../src/crdt/localGenesisRecord';
import {
  openCreationSeed,
  eraseCreationSeed,
  type CreationSeed,
} from '../../src/crdt/creationSeed';
import { withCeremonyVault } from '../../src/account/ceremonyVault';
import { utf8, normalizeDeviceCode, hex } from '../../src/crdt/custodyCrypto';
const slot = 'recovery-seed-native';
let enrollment: ReturnType<typeof beginLocalGenesis> | undefined;
export async function prepare() {
  const credentials = [];
  for (const role of ['wrapping', 'signing'] as const) {
    const keys = (await crypto.subtle.generateKey(
      role === 'wrapping' ? 'X25519' : 'Ed25519',
      true,
      role === 'wrapping' ? ['deriveBits'] : ['sign', 'verify'],
    )) as CryptoKeyPair;
    credentials.push({
      role,
      id: (role === 'wrapping' ? 'c1' : 'c2').repeat(16),
      publicKey: new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey)),
      privateBytes: new Uint8Array(await crypto.subtle.exportKey('pkcs8', keys.privateKey)),
    });
  }
  const seed: CreationSeed = {
    credentials: credentials as CreationSeed['credentials'],
    progress: { v: 1, kind: 'retained-recovery-probe', exactRequest: 'resume these exact bytes' },
  };
  enrollment = beginLocalGenesis(slot, { seed });
  const publicKeys = seed.credentials.map((c) => hex(c.publicKey));
  eraseCreationSeed(seed);
  return { code: enrollment.displayCode, publicKeys };
}
export async function confirm(code: string, crash = false) {
  if (crash) {
    const encrypt = crypto.subtle.encrypt.bind(crypto.subtle);
    crypto.subtle.encrypt = async (algorithm, key, data) => {
      if (
        typeof algorithm === 'object' &&
        'additionalData' in algorithm &&
        new TextDecoder()
          .decode((algorithm as AesGcmParams).additionalData)
          .includes('done/custody-credential/v2')
      ) {
        (window as unknown as { seedBoundary: boolean }).seedBoundary = true;
        return new Promise<ArrayBuffer>(() => {});
      }
      return encrypt(algorithm, key, data);
    };
  }
  await enrollment!.confirm(code);
  enrollment = undefined;
}
export async function reopen(code: string) {
  await resumeLocalGenesis(slot, code);
  const progress = await withExclusiveSlot(slot, async (task) => {
    const claim = (await readLocalClaim(task, slot))!;
    await verifyLocalClaim(task, claim, code);
    const factor = utf8(normalizeDeviceCode(code));
    try {
      const seed = await openCreationSeed(
        claim.initial.creation_seed!,
        claimScope(claim),
        claim.initial.creation_intent!.id,
        factor,
        crypto.subtle,
      );
      try {
        return seed.progress;
      } finally {
        eraseCreationSeed(seed);
      }
    } finally {
      factor.fill(0);
    }
  });
  const participant = await withCeremonyVault(
    slot,
    code,
    new AbortController().signal,
    async (owner) => {
      const signature = await owner.sign(utf8('retained recovery key'));
      return { ...owner.participant, signature };
    },
  );
  return { progress, participant, startup: await inspectLocalStartup(slot) };
}
