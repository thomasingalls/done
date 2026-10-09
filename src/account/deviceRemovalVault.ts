/** Native retained removal. This installs an opener, never advances the active generation. */
import { closed } from '../../account-protocol/preparation';
import { same } from '../../account-protocol/admission';
import { unhex } from '../../account-protocol/recovery';
import { historyAuthority, historyMembership } from '../../account-protocol/admissionHistory';
import {
  parseMembershipChain,
  verifyMembershipChain,
} from '../../account-protocol/membershipLocator';
import {
  membershipState,
  parseMembershipRotation,
  verifyMembershipRotation,
} from '../../account-protocol/membership';
import { generationInfo } from '../../account-protocol/genesis';
import {
  rotationRecipients,
  verifyRemovalPreparationRequest,
  verifyRemovalPreparation,
  removalPreparationMatchesRequest,
  verifyRotationRequest,
  resolveRotationOutcome,
} from '../../account-protocol/rotation';
import {
  continueDeviceRemoval,
  parseDeviceRemovalProgress,
  type DeviceRemovalProgress,
} from './deviceRemoval';
import { createDeviceRemovalTransport } from './deviceRemovalHttp';
import type { ScopedAccess } from './scopedTransport';
import type { MembershipVault } from './membershipVault';
import type { InstalledContentKey } from './approvalVault';

export interface RotationOpener {
  generation: number;
  head: string;
  key: InstalledContentKey;
}
const parseOpener = (input: unknown): InstalledContentKey => {
  const k = closed(input, ['sequence', 'ct']);
  if (!Number.isSafeInteger(k['sequence']) || (k['sequence'] as number) < 1)
    throw Error('Invalid rotation key');
  unhex(k['ct'], 48);
  return { sequence: k['sequence'] as number, ct: k['ct'] as string };
};
export interface NativeRemoval {
  v: 1 | 2;
  previous?: RotationOpener[];
  observed?: ReturnType<typeof parseMembershipChain> | null;
  kind: 'native-device-removal';
  parent: ReturnType<typeof parseMembershipChain>;
  target: string;
  recipient: string;
  progress: DeviceRemovalProgress | null;
  successor: ReturnType<typeof parseMembershipRotation> | null;
  key: InstalledContentKey | null;
}
export function parseNativeRemoval(input: unknown): NativeRemoval {
  const version = (input as { v?: unknown } | null)?.v;
  const r = closed(input, [
    ...(version === 2 ? ['previous', 'observed'] : []),
    'v',
    'kind',
    'parent',
    'target',
    'recipient',
    'progress',
    'successor',
    'key',
  ]);
  if ((version !== 1 && version !== 2) || r['kind'] !== 'native-device-removal')
    throw Error('Invalid native removal');
  unhex(r['target'], 16);
  unhex(r['recipient'], 16);
  const parent = parseMembershipChain(r['parent']);
  let previous: RotationOpener[] = [];
  if (version === 2) {
    if (!Array.isArray(r['previous']) || r['previous'].length > 64)
      throw Error('Invalid retained generation history');
    previous = r['previous'].map((input) => {
      const item = closed(input, ['generation', 'head', 'key']);
      unhex(item['head'], 32);
      const proof = parent.continuations.find((p) => p.head === item['head']);
      if (
        !proof ||
        proof.kind !== 'membership-rotation' ||
        proof.epoch.generation !== item['generation'] ||
        !proof.epoch.rotation.payload.wraps.some((w) => w.credentialId === r['recipient'])
      )
        throw Error('Historical opener differs from rotation history');
      return {
        generation: proof.epoch.generation,
        head: proof.head,
        key: parseOpener(item['key']),
      };
    });
    for (let i = 1; i < previous.length; i++)
      if (previous[i]!.generation !== previous[i - 1]!.generation + 1)
        throw Error('Retained generations are not consecutive');
  }
  return {
    v: version,
    ...(version === 2
      ? { previous, observed: r['observed'] === null ? null : parseMembershipChain(r['observed']) }
      : {}),
    kind: 'native-device-removal',
    parent,
    target: r['target'] as string,
    recipient: r['recipient'] as string,
    progress: r['progress'] === null ? null : parseDeviceRemovalProgress(r['progress']),
    successor: r['successor'] === null ? null : parseMembershipRotation(r['successor']),
    key: r['key'] === null ? null : parseOpener(r['key']),
  };
}

/** Only a completed, locally selected opener may become history for a new intent. */
export function archiveNativeRotation(
  input: unknown,
  activeHead: string | undefined,
): RotationOpener[] {
  const value = parseNativeRemoval(input);
  if (
    !activeHead ||
    !value.successor ||
    !value.key ||
    value.successor.head !== activeHead ||
    !value.successor.epoch.rotation.payload.wraps.some((w) => w.credentialId === value.recipient)
  )
    throw Error('Finish the retained rotation before starting another');
  const previous = value.previous ?? [];
  const generation = value.successor.epoch.generation;
  if (previous.length && previous.at(-1)!.generation + 1 !== generation)
    throw Error('Active generation does not follow retained openers');
  return [...previous, { generation, head: activeHead, key: value.key }];
}

/** Caller holds the actual slot-wide permit via withMembershipVault throughout this operation. */
export async function openDeviceRemovalVault(
  owner: Pick<MembershipVault, 'source' | 'participant' | 'rotation'>,
  target: string,
  signal: AbortSignal,
) {
  if (owner.source.kind === 'pending') throw Error('An installed account is required');
  const source = owner.source;
  const base = source.kind === 'original' ? source.base : source.authority.base;
  if (!source.proofs) throw Error('Certified membership is required');
  const current = await verifyMembershipChain(source.proofs, base);
  const vault = owner.rotation;
  let retained: NativeRemoval | null = null;
  const read = async () => {
    signal.throwIfAborted();
    const value = await vault.load();
    signal.throwIfAborted();
    return value === null ? null : parseNativeRemoval(value);
  };
  const save = async (next: NativeRemoval) => {
    if (!same(await read(), retained)) throw Error('Removal custody changed');
    await vault.save(parseNativeRemoval(next), () => signal.throwIfAborted());
    const cold = await read();
    if (!same(cold, next)) throw Error('Removal custody did not persist');
    retained = cold;
  };
  retained = await read();
  if (
    !retained ||
    (retained.successor &&
      retained.successor.head === vault.activeRotation &&
      retained.target !== target)
  ) {
    const previous = retained ? archiveNativeRotation(retained, vault.activeRotation) : [];
    if (retained) {
      const installed = await verifyMembershipChain(
        {
          ...retained.parent,
          continuations: [...retained.parent.continuations, retained.successor!],
        },
        base,
      );
      historyAuthority(current.history, installed.history.current);
      await vault.checkInstalled(retained.key!, retained.successor!.head);
    }
    unhex(target, 16);
    // Validate the actor/target before placing even a pending marker in custody.
    const state = membershipState(historyMembership(current.history));
    if (
      target === owner.participant.id ||
      !state.roster.some((m) => m.id === target) ||
      !state.certificate.members.some((m) => same(m, owner.participant))
    )
      throw Error('Removal requires another device and a certified owner');
    if (
      state.generation !==
      (previous.at(-1)?.generation ??
        (source.kind === 'joined' ? (source.initialGeneration ?? 1) : 1))
    )
      throw Error('Activate the current generation before removal');
    await rotationRecipients(historyMembership(current.history), target, base.request.recovery);
    await save({
      v: 2,
      previous,
      observed: null,
      kind: 'native-device-removal',
      parent: current.proofs,
      target,
      recipient: owner.participant.id,
      progress: null,
      successor: null,
      key: null,
    });
  }
  if (retained!.target !== target || retained!.recipient !== owner.participant.id)
    throw Error('Resume the saved removal first');
  const held = await verifyMembershipChain(retained!.parent, base);
  // The immutable installation can precede the retained parent; a later installation must extend it.
  if (held.history.current.tip >= current.history.current.tip)
    historyAuthority(held.history, current.history.current);
  else historyAuthority(current.history, held.history.current);
  const parent = historyMembership(held.history),
    state = membershipState(parent);
  const verify = async () => {
    const p = retained!.progress;
    if (p) {
      await verifyRemovalPreparationRequest(p.request, parent);
      if (p.request.actorId !== owner.participant.id || p.request.targetId !== target)
        throw Error('Removal owner changed');
      if (p.preparation) {
        await verifyRemovalPreparation(p.preparation, parent);
        if (!removalPreparationMatchesRequest(p.request, p.preparation))
          throw Error('Preparation changed');
      }
      if (p.rotation) {
        if (
          !same(p.rotation.preparation, p.preparation) ||
          p.rotation.actorId !== owner.participant.id
        )
          throw Error('Rotation progress changed');
        const verified = await verifyRotationRequest(p.rotation, parent, base.request.recovery);
        if (p.outcome && (await resolveRotationOutcome(p.outcome, verified)).kind === 'pending')
          throw Error('Invalid retained outcome');
      } else if (p.outcome) throw Error('Outcome without an intent');
    }
    const successor = retained!.successor;
    if (successor) {
      await verifyMembershipRotation(successor, parent);
      if (
        !p?.rotation ||
        !same(successor.epoch.rotation.payload.excluded, [target]) ||
        (p.outcome && !same(successor.epoch.outcome, p.outcome))
      )
        throw Error('Retained successor changed');
    } else if (retained!.key) throw Error('Opener without a verified successor');
    if (retained!.key) await vault.checkInstalled(retained!.key, successor!.head);
    signal.throwIfAborted();
  };
  await verify();
  const retainSuccessor = async (successor: NonNullable<NativeRemoval['successor']>) => {
    await verifyMembershipRotation(successor, parent);
    if (retained!.successor && !same(retained!.successor, successor))
      throw Error('Successor changed');
    if (!same(successor.epoch.rotation.payload.excluded, [target]))
      throw Error('Removal target changed');
    if (!retained!.successor) await save({ ...retained!, successor });
  };
  return {
    parent,
    base,
    snapshot: () => structuredClone(retained!),
    async advance(access: ScopedAccess) {
      const transport = createDeviceRemovalTransport(parent, access, signal, retainSuccessor);
      const outcome = await continueDeviceRemoval(parent, base.request.recovery, target, vault, {
        signal,
        load: async () => structuredClone(retained!.progress),
        replace: async (expected, progress) => {
          if (!same(expected, retained!.progress)) throw Error('Removal intent changed');
          await save({ ...retained!, progress });
        },
        prepare: transport.prepare,
        submit: async (request) => retained!.successor?.epoch.outcome ?? transport.submit(request),
      });
      await verify();
      if (outcome === 'pending') return 'pending' as const;
      const successor = retained!.successor;
      if (!successor) throw Error('Winning rotation proof is missing');
      if (!retained!.key) {
        const self = successor.epoch.rotation.payload.wraps.find(
          (w) => w.credentialId === owner.participant.id,
        );
        if (!self) throw Error('Successor excludes this owner');
        const key = await vault.sealIncoming(
          self,
          generationInfo({
            workspaceId: state.workspaceId,
            lineageId: state.lineageId,
            authRoot: state.pin.authRoot,
            generation: successor.epoch.generation,
          }),
          successor.head,
        );
        await save({ ...retained!, key });
      }
      await verify();
      return 'applying' as const;
    },
  };
}
