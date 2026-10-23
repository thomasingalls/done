import { requireFullSpool } from './retainedHistory';
import { withAccountProgressCustody } from './accountProgressCustody';
import {
  isRecoveryDetachment,
  parseRecoveryDetachment,
  verifyRecoveryDetachment,
} from '../account/recoveryDetachment';
import type { NetworkLogin } from '../account/networkLogin';
import { ScopedTransport } from '../account/scopedTransport';
import { RemovalPending } from '../account/accountTransitionNotice';
import { archiveNativeRotation, openDeviceRemovalVault } from '../account/deviceRemovalVault';
/** Retain a verified successor under the actual account permit before releasing the old writer. */
import { readPromotion } from './promotionRecord';
import { readJoinedAccount } from './joinedAccount';
import { parseNativeRemoval, type NativeRemoval } from '../account/deviceRemovalVault';
import {
  verifyMembershipChain,
  parseMembershipChain,
} from '../../account-protocol/membershipLocator';
import {
  historyAuthority,
  historyGeneration,
  historyMembership,
  historyPublisher,
  verifyEarlyHistory,
} from '../../account-protocol/admissionHistory';
import { membershipState } from '../../account-protocol/membership';
import { generationInfo } from '../../account-protocol/genesis';
import { same } from '../../account-protocol/admission';
import type { SessionTask } from './writeSession';
type Kind = 'promotion' | 'joined';

export async function withRotationCustody<T>(
  task: SessionTask,
  kind: Kind,
  slotId: string,
  code: string,
  work: Parameters<typeof withAccountProgressCustody<T>>[5],
) {
  return withAccountProgressCustody(task, kind, slotId, code, 'rotation', work);
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
    async ({ vault, base, credential, proofs: installed, state }) => {
      const verified = await verifyMembershipChain(proofs, base),
        held = installed
          ? await verifyMembershipChain(installed, base)
          : {
              history: await verifyEarlyHistory(
                base,
                'admission' in (state.marker ?? {})
                  ? (
                      state.marker as NonNullable<
                        Awaited<ReturnType<typeof readPromotion>>['marker']
                      >
                    ).successor?.artifact
                  : null,
              ),
            };
      historyAuthority(verified.history, held.history.current);
      const terminal = proofs.continuations.findIndex(
        (p) =>
          p.kind === 'recovery-successor' &&
          p.epoch.finalizations.some((f) => f.credential === credential),
      );
      if (terminal !== -1) {
        const terminalProofs = {
          ...proofs,
          continuations: proofs.continuations.slice(0, terminal + 1),
        };
        const saved = await vault.load();
        const prior = isRecoveryDetachment(saved)
          ? parseRecoveryDetachment(saved).prior
          : saved === null
            ? null
            : parseNativeRemoval(saved);
        const next = parseRecoveryDetachment({
          v: 1,
          kind: 'native-recovery-detachment',
          credential,
          proofs: terminalProofs,
          prior,
        });
        const checked = await verifyRecoveryDetachment(next, base, credential);
        historyAuthority(checked.history, held.history.current);
        if (isRecoveryDetachment(saved)) {
          const old = await verifyRecoveryDetachment(saved, base, credential);
          if (!same(old.value, next)) throw Error('Recovery detachment changed');
        } else {
          if (!same(saved, await vault.load())) throw Error('Rotation custody changed');
          await vault.save(next);
          if (!same(next, await vault.load())) throw Error('Recovery detachment did not persist');
        }
        return 'removed' as const;
      }
      const generation = historyGeneration(held.history) + 1;
      const index = proofs.continuations.findIndex(
        (proof) => proof.kind === 'membership-rotation' && proof.epoch.generation === generation,
      );
      const successor = proofs.continuations[index];
      if (!successor || successor.kind !== 'membership-rotation')
        throw Error('Observation has no next rotation');
      const parent = { ...proofs, continuations: proofs.continuations.slice(0, index) };
      const before = await verifyMembershipChain(parent, base);
      historyAuthority(before.history, held.history.current);
      if (historyGeneration(before.history) + 1 !== generation)
        throw Error('Observed rotation skips a generation');
      const target = successor.epoch.rotation.payload.excluded[0]!;
      if (successor.epoch.rotation.payload.excluded.length !== 1)
        throw Error('Unsupported exclusion set');
      let saved = await vault.load(),
        value: NativeRemoval;
      const old = saved === null ? null : parseNativeRemoval(saved);
      if (old && (!old.successor || old.successor.head !== vault.activeRotation)) {
        value = old;
        if (
          !same(value.parent, parent) ||
          value.target !== target ||
          value.recipient !== credential ||
          (value.successor && !same(value.successor, successor))
        )
          throw Error('Retained rotation conflicts with observation');
      } else {
        const previous = old ? archiveNativeRotation(old, vault.activeRotation) : [];
        if (old) {
          const completed = await verifyMembershipChain(
            { ...old.parent, continuations: [...old.parent.continuations, old.successor!] },
            base,
          );
          historyAuthority(before.history, completed.history.current);
          await vault.checkInstalled(old.key!, old.successor!.head);
        }
        value = {
          v: 2,
          previous,
          observed: null,
          kind: 'native-device-removal',
          parent,
          target,
          recipient: credential,
          progress: null,
          successor: null,
          key: null,
        };
      }
      const save = async (next: NativeRemoval) => {
        if (!same(await vault.load(), saved)) throw Error('Rotation custody changed');
        await vault.save(next);
        saved = await vault.load();
        if (!same(saved, next)) throw Error('Rotation observation did not persist');
        value = next;
      };
      let observed = proofs;
      if (value.observed) {
        const retained = await verifyMembershipChain(value.observed, base);
        if (retained.history.current.tip > verified.history.current.tip) {
          historyAuthority(retained.history, verified.history.current);
          observed = value.observed;
        } else historyAuthority(verified.history, retained.history.current);
      }
      const next = { ...value, v: 2 as const, previous: value.previous ?? [], observed, successor };
      if (!same(saved, next)) await save(next);
      if (credential === target) {
        if (value.key) throw Error('Removed device has a successor opener');
        return 'removed' as const;
      }
      const member = membershipState(historyMembership(before.history)).certificate.members.find(
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
            generation,
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
  // The bounded proof chain limits how many interrupted generation transitions can be resumed.
  for (let step = 0; step < 65; step++) {
    const state =
      kind === 'promotion'
        ? await readPromotion(task, slotId, code)
        : await readJoinedAccount(task, slotId, code);
    if (!state.record.rotation) return null;
    const loaded = await withRotationCustody(
      task,
      kind,
      slotId,
      code,
      async ({ vault, base, credential, proofs }) => {
        const value = await vault.load();
        if (!isRecoveryDetachment(value)) return { pending: parseNativeRemoval(value) };
        const checked = await verifyRecoveryDetachment(value, base, credential);
        const held = proofs
          ? (await verifyMembershipChain(proofs, base)).history
          : await verifyEarlyHistory(
              base,
              kind === 'promotion'
                ? (state as Awaited<ReturnType<typeof readPromotion>>).marker!.successor?.artifact
                : null,
            );
        historyAuthority(checked.history, held.current);
        return { detached: checked.publisher };
      },
    );
    if (loaded.detached) return loaded.detached;
    const pending = loaded.pending!;
    if (pending.successor && pending.successor.head === state.record.active_rotation) {
      if (
        !pending.observed ||
        !pending.observed.continuations.some(
          (proof) =>
            (proof.kind === 'membership-rotation' || proof.kind === 'recovery-successor') &&
            proof.epoch.generation > pending.successor!.epoch.generation,
        )
      )
        return null;
      await retainObservedRotation(task, kind, slotId, code, pending.observed);
      continue;
    }
    if (!pending.successor) {
      if (!login || globalThis.navigator?.onLine === false) throw new RemovalPending();
      await withRotationCustody(
        task,
        kind,
        slotId,
        code,
        async ({ vault, base, source, withLogin }) => {
          const native = await openDeviceRemovalVault(
            {
              source,
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
      continue;
    }
    const outcome = await retainObservedRotation(
      task,
      kind,
      slotId,
      code,
      pending.observed ?? {
        ...pending.parent,
        continuations: [...pending.parent.continuations, pending.successor],
      },
    );
    if (outcome === 'removed')
      return withRotationCustody(task, kind, slotId, code, async ({ base, credential }) => {
        const verified = await verifyMembershipChain(
          {
            ...pending.parent,
            continuations: [...pending.parent.continuations, pending.successor!],
          },
          base,
        );
        const history = historyPublisher(verified.history, credential);
        if (!history.finalization || pending.target !== credential)
          throw Error('Missing self finalization');
        return history;
      });
    await (await import('./accountRotation')).activateAccountRotation(task, kind, slotId, code);
  }
  throw Error('Rotation resume exceeds retained history bound');
}

/** A service signature is not replay evidence: verify the local ciphertext prefix through its cutoff. */
export async function verifyDetachedPrefix(
  history: import('../../account-protocol/admissionHistory').AdmissionHistory,
  spool: import('./spoolRecord').SpoolState,
  subtle: SubtleCrypto,
) {
  requireFullSpool(spool);
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

/** Authenticated local-baseline origin, never a cursor from the network. The full verifier above
 * remains fenced. A removed device can retain unaccepted local edits beyond its signed cutoff. */
export async function verifyRetainedDetachedPrefix(
  history: import('../../account-protocol/admissionHistory').AdmissionHistory,
  baseline: import('./localBaselineShadow').AccountBaselineRead,
  subtle: SubtleCrypto,
) {
  const spool = baseline.ledger.census.delivery.spool,
    origin = spool.origin;
  if (
    !origin ||
    !history.finalization ||
    history.boundary.position < origin.position ||
    history.boundary.position > origin.position + spool.positions.length
  )
    throw Error('Detached retained prefix is incomplete');
  const verifier = (
    await import('../../account-protocol/admissionHistory')
  ).createAdmissionPrefixVerifier(history, subtle, {
    position: origin.position,
    link: origin.link,
    verifiedThroughEpoch: baseline.authorityEpoch,
  });
  for (const p of spool.positions) {
    if (p.position > history.boundary.position) break;
    if (!p.wire) throw Error('Missing detached accepted ciphertext');
    await verifier.append(p.wire);
  }
  verifier.finish();
}
