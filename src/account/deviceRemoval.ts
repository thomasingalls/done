/** Retained client proposal for other-device removal. Does not activate or retire a content key. */
import { same } from '../../account-protocol/admission';
import { closed } from '../../account-protocol/preparation';
import { parseDraft, unhex } from '../../account-protocol/recovery';
import { membershipState, type VerifiedMembership } from '../../account-protocol/membership';
import { generationInfo } from '../../account-protocol/genesis';
import {
  ROTATION_LIMIT,
  removalPreparationMatchesRequest,
  parseRemovalPreparationRequest,
  removalPreparationRequestMessage,
  verifyRemovalPreparationRequest,
  parseRemovalPreparation,
  verifyRemovalPreparation,
  parseRotationRequest,
  rotationIntentMessage,
  verifyRotationRequest,
  rotationRecipients,
  parseRotationOutcome,
  resolveRotationOutcome,
  type RemovalPreparationRequest,
  type RemovalPreparation,
  type RotationRequest,
  type RotationOutcome,
  type GenerationWrap,
} from '../../account-protocol/rotation';
import { sealGeneration } from './generationWrap';
import { hex, random, type Bytes } from '../crdt/custodyCrypto';

export interface DeviceRemovalProgress {
  v: 1;
  kind: 'device-removal-progress';
  request: RemovalPreparationRequest;
  preparation: RemovalPreparation | null;
  rotation: RotationRequest | null;
  outcome: RotationOutcome | null;
}
export function parseDeviceRemovalProgress(input: unknown): DeviceRemovalProgress {
  if (JSON.stringify(input).length > 3 * ROTATION_LIMIT) throw Error('Oversized removal progress');
  const p = closed(input, ['v', 'kind', 'request', 'preparation', 'rotation', 'outcome']);
  if (p['v'] !== 1 || p['kind'] !== 'device-removal-progress')
    throw Error('Invalid removal progress');
  return {
    v: 1,
    kind: 'device-removal-progress',
    request: parseRemovalPreparationRequest(p['request']),
    preparation: p['preparation'] === null ? null : parseRemovalPreparation(p['preparation']),
    rotation: p['rotation'] === null ? null : parseRotationRequest(p['rotation']),
    outcome: p['outcome'] === null ? null : parseRotationOutcome(p['outcome']),
  };
}
export interface DeviceRemovalOwner {
  participant: { id: string; wPub: string; sPub: string };
  sign(message: Bytes): Promise<string>;
  /** Open only with this authenticated owner's wrapping credential. Caller wipes returned bytes. */
  openWrap(wrap: GenerationWrap, info: Bytes): Promise<Bytes>;
}
export interface DeviceRemovalIO {
  signal: AbortSignal;
  /** Must be the authenticated slot record, read under the actual owner lifetime. */
  load(): Promise<unknown>;
  /** Atomic compare-and-replace; a failed/stale owner cannot overwrite another attempt. */
  replace(expected: DeviceRemovalProgress | null, next: DeviceRemovalProgress): Promise<void>;
  prepare(request: RemovalPreparationRequest): Promise<unknown>;
  submit(request: RotationRequest): Promise<unknown>;
}
/** Serial owner task. A saved self-recipient HPKE wrap is the pending key's durable opener; raw key
 * bytes never enter the progress record. No network rotation is sent until its exact record reopens. */
export async function continueDeviceRemoval(
  parent: VerifiedMembership,
  recoveryInput: unknown,
  targetId: string,
  ownerInput: DeviceRemovalOwner,
  io: DeviceRemovalIO,
): Promise<'pending' | 'committed' | 'superseded'> {
  const state = membershipState(parent),
    recovery = parseDraft(recoveryInput);
  const participant = { ...ownerInput.participant },
    owner = {
      sign: ownerInput.sign.bind(ownerInput),
      openWrap: ownerInput.openWrap.bind(ownerInput),
    };
  const guard = () => io.signal.throwIfAborted();
  guard();
  const { members, recovery: checkedRecovery } = await rotationRecipients(
    parent,
    targetId,
    recovery,
  );
  if (
    !same(
      members.find((m) => m.id === participant.id),
      participant,
    )
  )
    throw Error('Removal belongs to another owner');
  guard();
  const read = async () => {
    guard();
    const raw = await io.load();
    guard();
    return raw === null ? null : parseDeviceRemovalProgress(raw);
  };
  const persist = async (before: DeviceRemovalProgress | null, next: DeviceRemovalProgress) => {
    guard();
    await io.replace(structuredClone(before), structuredClone(next));
    const retained = await read();
    if (!same(retained, next)) throw Error('Removal progress did not persist');
    return retained!;
  };
  const durable = async (expected: DeviceRemovalProgress) => {
    if (!same(await read(), expected)) throw Error('Removal progress changed');
    guard();
  };
  const network = async (run: () => Promise<unknown>) => {
    guard();
    try {
      const result = await run();
      guard();
      return result;
    } catch {
      guard();
      return null;
    } // Unauthenticated refusal or lost reply never clears an intent.
  };
  let progress = await read();
  if (!progress) {
    const request: RemovalPreparationRequest = {
      v: 1,
      kind: 'removal-preparation-request',
      workspaceId: state.workspaceId,
      lineageId: state.lineageId,
      parent: state.head,
      epoch: state.epoch,
      actorId: participant.id,
      targetId,
      nonce: hex(random(32)),
      signature: '00'.repeat(64),
    };
    request.signature = await owner.sign(await removalPreparationRequestMessage(request));
    await verifyRemovalPreparationRequest(request, parent);
    progress = await persist(null, {
      v: 1,
      kind: 'device-removal-progress',
      request,
      preparation: null,
      rotation: null,
      outcome: null,
    });
  }
  if (progress.request.actorId !== participant.id || progress.request.targetId !== targetId)
    throw Error('Retained removal belongs to another request');
  await verifyRemovalPreparationRequest(progress.request, parent);
  if ((!progress.preparation && progress.rotation) || (!progress.rotation && progress.outcome))
    throw Error('Incomplete retained removal');
  if (progress.preparation) {
    await verifyRemovalPreparation(progress.preparation, parent);
    if (!removalPreparationMatchesRequest(progress.request, progress.preparation))
      throw Error('Retained preparation changed');
  } else {
    await durable(progress);
    const response = await network(() => io.prepare(structuredClone(progress!.request)));
    let preparation;
    try {
      preparation = await verifyRemovalPreparation(response, parent);
      if (!removalPreparationMatchesRequest(progress.request, preparation)) return 'pending';
    } catch {
      return 'pending';
    }
    progress = await persist(progress, { ...progress, preparation });
  }
  const info = generationInfo({
    workspaceId: state.workspaceId,
    lineageId: state.lineageId,
    authRoot: state.pin.authRoot,
    generation: state.generation + 1,
  });
  if (!progress.rotation) {
    const key = random(32);
    try {
      const wraps: RotationRequest['payload']['wraps'] = [];
      for (const member of members) {
        guard();
        wraps.push({
          credentialId: member.id,
          ...(await sealGeneration(unhex(member.wPub, 32), info, key)),
        });
      }
      guard();
      const recoveryWrap = await sealGeneration(unhex(checkedRecovery.rPub, 32), info, key);
      const self = wraps.find((w) => w.credentialId === participant.id)!;
      const opened = await owner.openWrap(self, info);
      try {
        if (opened.length !== 32 || !opened.every((b, i) => b === key[i]))
          throw Error('Pending key cannot reopen');
      } finally {
        opened.fill(0);
      }
      guard();
      const rotation: RotationRequest = {
        v: 1,
        kind: 'rotation-request',
        preparation: progress.preparation!,
        actorId: participant.id,
        target: state.generation + 1,
        payload: {
          cutoff: progress.preparation!.cutoff,
          excluded: [targetId],
          recoveryWrap,
          wraps,
        },
        signature: '00'.repeat(64),
      };
      rotation.signature = await owner.sign(await rotationIntentMessage(rotation));
      await verifyRotationRequest(rotation, parent, recovery);
      progress = await persist(progress, { ...progress, rotation });
    } finally {
      key.fill(0);
    }
  }
  if (!progress.rotation) throw Error('Rotation request is missing');
  if (
    progress.rotation.actorId !== participant.id ||
    !same(progress.rotation.preparation, progress.preparation)
  )
    throw Error('Retained rotation changed');
  const verified = await verifyRotationRequest(progress.rotation, parent, recovery);
  if (progress.outcome) {
    const result = await resolveRotationOutcome(progress.outcome, verified);
    if (result.kind === 'pending') throw Error('Retained rotation outcome is invalid');
    await durable(progress);
    return result.kind;
  }
  // Reopen only from the cold retained request. No transient generated key licenses the send.
  await durable(progress);
  const self = progress.rotation.payload.wraps.find((w) => w.credentialId === participant.id)!;
  const opened = await owner.openWrap(self, info);
  try {
    if (opened.length !== 32) throw Error('Pending key cannot reopen');
  } finally {
    opened.fill(0);
  }
  await durable(progress);
  const response = await network(() => io.submit(structuredClone(progress!.rotation!)));
  const result = await resolveRotationOutcome(response, verified);
  guard();
  if (result.kind === 'pending') return 'pending';
  await persist(progress, { ...progress, outcome: result.outcome });
  return result.kind;
}
