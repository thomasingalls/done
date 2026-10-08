import type { NetworkLogin } from '../account/networkLogin';
import { ScopedTransport } from '../account/scopedTransport';
import { RemovalPending } from '../account/accountTransitionNotice';
import { openDeviceRemovalVault } from '../account/deviceRemovalVault';
/** Retain a verified successor under the actual account permit before releasing the old writer. */
import {
  readPromotion,
  withPromotionRoot,
  signRecord,
  signPromotion,
  writePromotion,
} from './promotionRecord';
import { readJoinedAccount, writeJoinedApproval } from './joinedAccount';
import { claimScope } from './localGenesisRecord';
import { createApprovalVault } from '../account/approvalVault';
import { parseNativeRemoval, type NativeRemoval } from '../account/deviceRemovalVault';
import {
  parseMembershipChain,
  verifyMembershipChain,
} from '../../account-protocol/membershipLocator';
import {
  historyAuthority,
  historyGeneration,
  historyMembership,
  historyPublisher,
} from '../../account-protocol/admissionHistory';
import { membershipState } from '../../account-protocol/membership';
import { generationInfo } from '../../account-protocol/genesis';
import { same } from '../../account-protocol/admission';
import { hex } from './custodyCrypto';
import type { SessionTask } from './writeSession';
type Kind = 'promotion' | 'joined';

export async function withRotationCustody<T>(
  task: SessionTask,
  kind: Kind,
  slotId: string,
  code: string,
  work: (v: {
    vault: Awaited<ReturnType<typeof createApprovalVault>>;
    state:
      | Awaited<ReturnType<typeof readPromotion>>
      | Awaited<ReturnType<typeof readJoinedAccount>>;
    base: Parameters<typeof verifyMembershipChain>[1];
    credential: string;
    withLogin<T>(login: NetworkLogin, work: () => Promise<T>): Promise<T>;
    proofs: ReturnType<typeof parseMembershipChain>;
  }) => Promise<T>,
) {
  const original = kind === 'promotion' ? await readPromotion(task, slotId, code) : null;
  const joined = kind === 'joined' ? await readJoinedAccount(task, slotId, code) : null;
  const state = (original ?? joined)!;
  let record = state.record,
    marker = original?.marker;
  if ((original && marker?.v !== 9) || (joined && joined.marker?.phase !== 'active'))
    throw Error('Installed account required');
  const base = original
    ? {
        pin: marker!.pin,
        request: marker!.admission!.request,
        receipt: marker!.admission!.receipt!,
      }
    : joined!.marker!.authority.base;
  const proofs = original
    ? (marker!.membership?.proofs ?? {
        successor: marker!.successor!.artifact,
        certification: marker!.successor!.certification!,
        continuations: [],
      })
    : (joined!.marker!.membership?.proofs ?? {
        successor: joined!.marker!.authority.successor,
        certification: joined!.marker!.authority.certification,
        continuations: joined!.marker!.v === 2 ? joined!.marker!.authority.continuations : [],
      });
  const credentials = original ? marker!.credentials! : record.credentials!;
  return withPromotionRoot(task, state.claim, record, code, async (root, subtle) => {
    const vault = await createApprovalVault({
      channel: 'rotation',
      slotId,
      scope: claimScope(state.claim),
      root,
      subtle,
      credentials,
      record: () => record,
      commit: async (next, check) => {
        if (original) {
          next = await signRecord(root, next, subtle);
          const nextMarker = await signPromotion(
            root,
            { ...marker!, custodyMac: hex(next.mac), sealReserved: next.seal_reserved },
            subtle,
          );
          await writePromotion(task, state.claim, record, next, marker!, nextMarker, check);
          record = next;
          marker = nextMarker;
        } else {
          await writeJoinedApproval(task, joined!, code, next, check, 'rotation');
          record = joined!.record;
        }
      },
    });
    return work({
      vault,
      state,
      base,
      credential: credentials[1].id,
      proofs,
      withLogin: (login, run) =>
        login.withEnrollmentOwner(
          task,
          root,
          record.root_id,
          {
            accountId: base.receipt.offer.epoch.accountId,
            credentialId: base.receipt.activation.context.credentialId,
          },
          run,
        ),
    });
  });
}

export async function retainObservedRotation(
  task: SessionTask,
  kind: Kind,
  slotId: string,
  code: string,
  input: unknown,
) {
  const proofs = parseMembershipChain(input);
  return withRotationCustody(
    task,
    kind,
    slotId,
    code,
    async ({ vault, base, credential, proofs: installed }) => {
      const verified = await verifyMembershipChain(proofs, base),
        held = await verifyMembershipChain(installed, base);
      historyAuthority(verified.history, held.history.current);
      const successor = proofs.continuations.at(-1);
      if (
        !successor ||
        successor.kind !== 'membership-rotation' ||
        historyGeneration(verified.history) !== 2
      )
        throw Error('Unsupported observed rotation');
      const parent = { ...proofs, continuations: proofs.continuations.slice(0, -1) };
      const before = await verifyMembershipChain(parent, base);
      if (historyGeneration(before.history) !== 1)
        throw Error('Unsupported predecessor generation');
      const target = successor.epoch.rotation.payload.excluded[0]!;
      if (successor.epoch.rotation.payload.excluded.length !== 1)
        throw Error('Unsupported exclusion set');
      let saved = await vault.load(),
        value: NativeRemoval;
      if (saved !== null) {
        value = parseNativeRemoval(saved);
        if (
          !same(value.parent, parent) ||
          value.target !== target ||
          value.recipient !== credential ||
          (value.successor && !same(value.successor, successor))
        )
          throw Error('Retained rotation conflicts with observation');
      } else
        value = {
          v: 1,
          kind: 'native-device-removal',
          parent,
          target,
          recipient: credential,
          progress: null,
          successor: null,
          key: null,
        };
      const save = async (next: NativeRemoval) => {
        if (!same(await vault.load(), saved)) throw Error('Rotation custody changed');
        await vault.save(next);
        saved = await vault.load();
        if (!same(saved, next)) throw Error('Rotation observation did not persist');
        value = next;
      };
      if (!value.successor) await save({ ...value, successor });
      if (credential === target) {
        if (value.key) throw Error('Removed device has a successor opener');
        return 'removed' as const;
      }
      const member = membershipState(historyMembership(verified.history)).certificate.members.find(
        (m) => m.id === credential,
      );
      const wrap = successor.epoch.rotation.payload.wraps.find(
        (w) => w.credentialId === credential,
      );
      if (!member || !wrap) throw Error('No certified successor recipient');
      if (!value.key) {
        const key = await vault.sealIncoming(
          wrap,
          generationInfo({
            workspaceId: verified.history.current.workspace,
            lineageId: verified.history.current.lineage,
            authRoot: base.pin.authRoot,
            generation: 2,
          }),
          successor.head,
        );
        await save({ ...value, key });
      }
      await vault.checkInstalled(value.key!, successor.head);
      return 'survivor' as const;
    },
  );
}

/** Called during opening, before constructing any journal or content writer. */
export async function resumeAccountRotation(
  task: SessionTask,
  kind: Kind,
  slotId: string,
  code: string,
  login?: NetworkLogin,
): Promise<import('../../account-protocol/admissionHistory').AdmissionHistory | null> {
  const state =
    kind === 'promotion'
      ? await readPromotion(task, slotId, code)
      : await readJoinedAccount(task, slotId, code);
  if (!state.record.rotation || state.record.active_rotation) return null;
  const pending = await withRotationCustody(task, kind, slotId, code, async ({ vault }) =>
    parseNativeRemoval(await vault.load()),
  );
  if (!pending.successor) {
    if (!login || globalThis.navigator?.onLine === false) throw new RemovalPending();
    await withRotationCustody(
      task,
      kind,
      slotId,
      code,
      async ({ vault, base, proofs, withLogin }) => {
        const native = await openDeviceRemovalVault(
          {
            source: { kind: 'original', base, proofs },
            participant: vault.participant,
            rotation: vault,
          },
          pending.target,
          task.signal,
        );
        const transport = new ScopedTransport(base.pin, task.signal);
        try {
          const access = transport.bind({
            login,
            sign: vault.sign,
            scope: {
              kind: 'workspace',
              workspaceId: base.request.candidate.workspaceId,
              credentialId: vault.participant.id,
            },
          });
          await withLogin(login, async () => {
            // This is the user's explicit unlock/resume action; renew a retained login first.
            await login.access();
            if (['connect', 'reconnect', 'signed-out'].includes(login.getSnapshot()))
              await login.connect();
            if ((await native.advance(access)) === 'pending') throw new RemovalPending();
          });
        } finally {
          transport.close();
        }
      },
    );
    return resumeAccountRotation(task, kind, slotId, code, login);
  }
  const outcome = await retainObservedRotation(task, kind, slotId, code, {
    ...pending.parent,
    continuations: [...pending.parent.continuations, pending.successor],
  });
  if (outcome === 'removed')
    return withRotationCustody(task, kind, slotId, code, async ({ base, credential }) => {
      const verified = await verifyMembershipChain(
        { ...pending.parent, continuations: [...pending.parent.continuations, pending.successor!] },
        base,
      );
      const history = historyPublisher(verified.history, credential);
      if (!history.finalization || pending.target !== credential)
        throw Error('Missing self finalization');
      return history;
    });
  await (await import('./accountRotation')).activateAccountRotation(task, kind, slotId, code);
  return null;
}

/** A service signature is not replay evidence: verify the local ciphertext prefix through its cutoff. */
export async function verifyDetachedPrefix(
  history: import('../../account-protocol/admissionHistory').AdmissionHistory,
  spool: import('./spoolRecord').SpoolState,
  subtle: SubtleCrypto,
) {
  const verifier = (
    await import('../../account-protocol/admissionHistory')
  ).createAdmissionPrefixVerifier(history, subtle);
  if (!history.finalization || history.boundary.position > spool.positions.length)
    throw Error('Detached accepted prefix is incomplete');
  for (const position of spool.positions.slice(0, history.boundary.position)) {
    if (!position.wire) throw Error('Missing detached accepted ciphertext');
    await verifier.append(position.wire);
  }
  verifier.finish();
}
