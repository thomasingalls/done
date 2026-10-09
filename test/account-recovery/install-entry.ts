import { withMembershipVault } from '../../src/account/membershipVault';
import { beginLocalGenesis } from '../../src/crdt/localGenesis';
import { eraseCreationSeed, type CreationSeed } from '../../src/crdt/creationSeed';
import { withCeremonyVault } from '../../src/account/ceremonyVault';
import { captureRecoveryReading, type RecoveryReading } from '../../src/crdt/recoveryReading';
import type { JoinedAuthority } from '../../src/crdt/joinedAccount';
import { generationInfo } from '../../account-protocol/genesis';
import { unhex } from '../../account-protocol/recovery';
import type { AuthorityPin } from '../../account-protocol/authority';
import { openOwnedSyncingAccountWorkspace } from '../../src/crdt/accountReceive';
export {
  activate,
  state,
  installation,
  oldOwnerRefuses,
} from '../account-membership/activation-entry';
export async function seed(input: {
  id: string;
  wPub: string;
  sPub: string;
  wrapping: string;
  signing: string;
}) {
  const slotId = 'recovery-install-native';
  const seed: CreationSeed = {
    credentials: [
      {
        role: 'wrapping',
        id: 'c1'.repeat(16),
        publicKey: unhex(input.wPub, 32),
        privateBytes: unhex(input.wrapping, 48),
      },
      {
        role: 'signing',
        id: input.id,
        publicKey: unhex(input.sPub, 32),
        privateBytes: unhex(input.signing, 48),
      },
    ],
    progress: { kind: 'install-test' },
  };
  const enrollment = beginLocalGenesis(slotId, { seed }),
    code = enrollment.displayCode!;
  eraseCreationSeed(seed);
  await enrollment.confirm(code);
  return { slotId, code };
}
export async function install(
  slotId: string,
  code: string,
  authority: JoinedAuthority,
  input: RecoveryReading,
) {
  const reading = captureRecoveryReading(input),
    s = reading.successor;
  await withCeremonyVault(slotId, code, new AbortController().signal, async (vault) => {
    const key = await vault.sealIncoming(
      s.epoch.intent.deviceWrap,
      generationInfo({ ...authority.base.request.candidate, generation: s.epoch.generation }),
      s.head,
    );
    await vault.save({ kind: 'retained-recovery-install', authority, reading, key });
    await vault.installRecoveryWriting(authority, reading, key);
  });
}
let editor: Awaited<ReturnType<typeof openOwnedSyncingAccountWorkspace>> | undefined;
export async function openEditor(
  slotId: string,
  code: string,
  pin: AuthorityPin,
  principal: string,
) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
  editor = await openOwnedSyncingAccountWorkspace(
    {
      slotId,
      code,
      pin,
      membershipContinuation: true,
      identity: {
        id: principal,
        actor: { kind: 'human', name: 'Recovered writer', color: '#334455' },
        device: { id: 'recovery-native', name: 'Recovery probe' },
      },
      assertPasskey: async (r) => {
        const a = await window.fixturePasskey([...r.challenge]);
        return {
          ...a,
          authenticatorData: new Uint8Array(a.authenticatorData),
          clientDataJSON: new Uint8Array(a.clientDataJSON),
          signature: new Uint8Array(a.signature),
        };
      },
    },
    'a'.repeat(43),
    true,
  );
  return editor.workspace.read().master;
}
export async function edit(text: string) {
  const w = editor!.workspace,
    n = w.read().master.length;
  await w
    .text({ kind: 'master' })
    .input({ name: 'insert', text }, { ranges: [{ anchor: n, head: n }], main: 0 }).accepted;
  await w.whenDurable();
  return w.read().master;
}
export async function closeEditor() {
  await editor?.workspace.close();
  editor = undefined;
}

export async function adopt(proofs: unknown) {
  return editor!.adoptMembership(proofs);
}
export async function prepareReplacement(
  slotId: string,
  code: string,
  authority: JoinedAuthority,
  candidate: string,
) {
  return withMembershipVault('joined', slotId, code, new AbortController().signal, (v) =>
    v.prepareReplacement(
      {
        base: authority.base,
        proofs: {
          successor: authority.successor,
          certification: authority.certification,
          continuations: authority.continuations,
        },
      },
      candidate,
      async () => {
        throw Error('Unexpected historical read');
      },
      (request) =>
        (
          window as unknown as { fixtureHistory(request: unknown): Promise<unknown> }
        ).fixtureHistory(request),
    ),
  );
}
