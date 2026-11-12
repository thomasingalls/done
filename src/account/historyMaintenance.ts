/** Retained checkpoint attempts. Publication/admission are distinct from installation and pruning. */
import { closed } from '../../account-protocol/preparation';
import { same } from '../../account-protocol/admission';
import { unhex } from '../../account-protocol/recovery';
import { membershipState, type VerifiedMembership } from '../../account-protocol/membership';
import {
  EMPTY_HISTORY_CHECKPOINT,
  HISTORY_CHECKPOINT_LIMIT,
  HISTORY_ADMISSION_LIMIT,
  HISTORY_INSTALL_LIMIT,
  historyInstallBytes,
  parseHistoryCheckpoint,
  parseHistoryCheckpointAdmission,
  historyCheckpointHash,
  verifyHistoryCheckpoint,
  verifyHistoryCheckpointParent,
  verifyHistoryCheckpointAdmission,
  verifyHistoryHeads,
  type HistoryCheckpoint,
  type HistoryCheckpointAdmission,
} from '../../account-protocol/historyCheckpoint';
import {
  parseHistoryCatalog,
  verifyHistoryCatalog,
  parseHistoryExchange,
  historyExchangeMessage,
  verifyHistoryCheckpointPage,
  HISTORY_EXCHANGE_REQUEST_LIFETIME_MS,
  type HistoryCatalog,
  type HistoryExchange,
  type HistoryCheckpointPage,
} from '../../account-protocol/historyExchange';
import { hex, random, type Bytes } from '../crdt/custodyCrypto';
import {
  HISTORY_REPLAY_EVENTS,
  HistoryReplayLimit,
  historyReplayPositions,
} from './historyReplayBound';

export interface HistoryMaintenanceProgress {
  v: 1;
  kind: 'history-maintenance-progress';
  workspaceId: string;
  lineageId: string;
  credentialId: string;
  catalog: HistoryCatalog | null;
  discard: string | null;
  attempt: {
    checkpoint: HistoryCheckpoint;
    admission: HistoryCheckpointAdmission | null;
  } | null;
}
export const HISTORY_PROGRESS_LIMIT = HISTORY_CHECKPOINT_LIMIT + HISTORY_ADMISSION_LIMIT + 8192;
export function parseHistoryMaintenanceProgress(input: unknown): HistoryMaintenanceProgress {
  if (JSON.stringify(input).length > HISTORY_PROGRESS_LIMIT)
    throw Error('History progress too large');
  const r = closed(input, [
    'v',
    'kind',
    'workspaceId',
    'lineageId',
    'credentialId',
    'catalog',
    'attempt',
    'discard',
  ]);
  if (r['v'] !== 1 || r['kind'] !== 'history-maintenance-progress')
    throw Error('Invalid history progress');
  unhex(r['workspaceId'], 16);
  unhex(r['lineageId'], 32);
  unhex(r['credentialId'], 16);
  if (r['discard'] !== null) unhex(r['discard'], 32);
  let attempt: HistoryMaintenanceProgress['attempt'] = null;
  if (r['attempt'] !== null) {
    const a = closed(r['attempt'], ['checkpoint', 'admission']);
    attempt = {
      checkpoint: parseHistoryCheckpoint(a['checkpoint']),
      admission: a['admission'] === null ? null : parseHistoryCheckpointAdmission(a['admission']),
    };
  }
  return {
    v: 1,
    kind: 'history-maintenance-progress',
    workspaceId: r['workspaceId'] as string,
    lineageId: r['lineageId'] as string,
    credentialId: r['credentialId'] as string,
    discard: r['discard'] as string | null,
    catalog: r['catalog'] === null ? null : parseHistoryCatalog(r['catalog']),
    attempt,
  };
}
export interface HistoryMaintenanceOwner {
  authority: VerifiedMembership;
  credentialId: string;
  /** Resolve only from the actual slot's verified membership chain. */
  authorityAt(epoch: number, head: string): Promise<VerifiedMembership>;
  sign(message: Bytes): Promise<string>;
  /** Native owner cold-replays admitted sources and exact accepted cuts, then adds local originals. */
  prepare(
    previous: HistoryCheckpoint | null,
    heads: HistoryCheckpoint['heads'],
    sources: HistoryCheckpoint['sources'],
  ): Promise<HistoryCheckpoint>;
  /** Independent cold replay; never sign merely because the producer or service signed. */
  admit(checkpoint: HistoryCheckpoint): Promise<HistoryCheckpointAdmission>;
  /** The cuts this device's replay would start from after `previous`, only to count positions
   * against the replay bound before any replay (phase 547). Defaults to `previous`'s cuts, or
   * genesis, which is where an original device starts. */
  replayStart?(
    previous: HistoryCheckpoint | null,
  ): HistoryCheckpoint['heads'] | Promise<HistoryCheckpoint['heads']>;
}
export interface HistoryMaintenanceIO {
  signal: AbortSignal;
  now?(): number;
  load(): Promise<unknown>;
  /** Authenticated atomic compare-and-replace under the actual slot permit. */
  replace(
    before: HistoryMaintenanceProgress | null,
    next: HistoryMaintenanceProgress,
  ): Promise<void>;
  exchange(request: HistoryExchange): Promise<unknown>;
}
export type HistoryMaintenanceCommand =
  | 'inspect'
  | 'create'
  | 'resume'
  | 'verify'
  | 'discard'
  | 'prune';
/** Which snapshot is larger than devices running this build can install (phase 544). */
export type HistorySnapshotRole = 'new' | 'saved' | 'pending' | 'latest';
export interface HistorySnapshotTooLarge {
  snapshot: HistorySnapshotRole;
  /** Bytes a device's installation needs, per `historyInstallBytes`. */
  needed: number;
  /** HISTORY_INSTALL_LIMIT. */
  allowed: number;
}
/** This device's own saved snapshot that no device has admitted, or its unfinished cancellation
 * (phase 547). `sendable`: nothing on the service stands in its way. `waiting`: it is the snapshot
 * waiting for verification. `blocked`: another device's snapshot is waiting for verification, so
 * this one cannot be sent now. `superseded`: the service has admitted another snapshot since it was
 * made, so it can never be sent. `stale`: the account's membership or carried sources changed, so it
 * can never be sent. `cancelling`: it was discarded here and the service has not recorded that yet. */
export type HistorySavedSnapshot =
  | 'sendable'
  | 'waiting'
  | 'blocked'
  | 'superseded'
  | 'stale'
  | 'cancelling';
/** Accepted positions since the latest admitted snapshot (from genesis before the first), and the
 * replay bound they are measured against (phase 547). Reported when history is checked. */
export interface HistoryPositions {
  since: number;
  allowed: number;
}
/** Preparing (`new`) or verifying (`pending`) a snapshot here would read more positions than one
 * replay may. Found before any position was read; nothing was saved, published or admitted. */
export interface HistoryReplayRefused {
  snapshot: 'new' | 'pending';
  needed: number;
  allowed: number;
}
export interface HistoryMaintenanceStatus {
  sequence: number;
  pending: 'none' | 'resume' | 'verify' | 'waiting' | 'stale';
  canDiscard: boolean;
  pruned?: true;
  /** Present when a snapshot this command met could not be installed by devices running this
   * build. Because of it, nothing was saved, published, admitted or pruned for that snapshot. */
  tooLarge?: HistorySnapshotTooLarge;
  saved?: HistorySavedSnapshot;
  positions?: HistoryPositions;
  replay?: HistoryReplayRefused;
  /** Creating found another device's snapshot after preparing this one: nothing was saved or sent. */
  raced?: true;
}
/** Null when every device running this build can install the checkpoint. */
export function historySnapshotTooLarge(
  snapshot: HistorySnapshotRole,
  checkpoint: HistoryCheckpoint,
): HistorySnapshotTooLarge | null {
  const needed = historyInstallBytes(checkpoint);
  return needed > HISTORY_INSTALL_LIMIT
    ? { snapshot, needed, allowed: HISTORY_INSTALL_LIMIT }
    : null;
}
/** One serial owner operation. An unavailable/untrusted reply never erases the retained attempt. */
export async function runHistoryMaintenance(
  input: HistoryMaintenanceOwner,
  command: HistoryMaintenanceCommand,
  io: HistoryMaintenanceIO,
): Promise<HistoryMaintenanceStatus> {
  const authority = input.authority,
    p = membershipState(authority),
    credentialId = input.credentialId,
    owner = {
      authorityAt: input.authorityAt.bind(input),
      sign: input.sign.bind(input),
      prepare: input.prepare.bind(input),
      admit: input.admit.bind(input),
      replayStart: async (previous: HistoryCheckpoint | null) =>
        input.replayStart
          ? structuredClone(await input.replayStart(structuredClone(previous)))
          : structuredClone(previous?.heads ?? []),
    },
    guard = () => io.signal.throwIfAborted();
  guard();
  if (!p.certificate.members.some((m) => m.id === credentialId))
    throw Error('History maintenance requires a certified owner');
  const read = async () => {
    guard();
    const raw = await io.load();
    guard();
    return raw === null ? null : parseHistoryMaintenanceProgress(raw);
  };
  let retained = await read();
  const scope = { workspaceId: p.workspaceId, lineageId: p.lineageId, credentialId };
  if (retained && Object.entries(scope).some(([k, v]) => retained![k as keyof typeof scope] !== v))
    throw Error('History progress belongs to another owner');
  const current = () =>
    retained ?? {
      v: 1 as const,
      kind: 'history-maintenance-progress' as const,
      ...scope,
      catalog: null,
      attempt: null,
      discard: null,
    };
  const durable = async () => {
    if (!same(await read(), retained)) throw Error('History progress changed');
    guard();
  };
  const save = async (next: HistoryMaintenanceProgress) => {
    const captured = parseHistoryMaintenanceProgress(next);
    await durable();
    await io.replace(structuredClone(retained), structuredClone(captured));
    const cold = await read();
    if (!same(cold, captured)) throw Error('History progress did not persist');
    retained = cold;
  };
  const verify = async (
    checkpoint: HistoryCheckpoint,
    admission: HistoryCheckpointAdmission | null,
  ) => {
    const at = await owner.authorityAt(checkpoint.manifest.epoch, checkpoint.manifest.epochHead);
    const c = await verifyHistoryCheckpoint(checkpoint, at);
    if (c.manifest.workspaceId !== p.workspaceId || c.manifest.lineageId !== p.lineageId)
      throw Error('History checkpoint account changed');
    if (admission) await verifyHistoryCheckpointAdmission(admission, c, at);
    guard();
  };
  if (retained?.catalog)
    await verifyHistoryCatalog(retained.catalog, p.pin, p.workspaceId, p.lineageId);
  if (retained?.attempt) {
    const a = retained.attempt;
    await verify(a.checkpoint, a.admission);
    if (
      a.admission
        ? a.admission.admittingCredential !== credentialId
        : a.checkpoint.manifest.producer !== credentialId
    )
      throw Error('Retained history attempt belongs to another actor');
  }
  const acceptCatalog = async (catalog: HistoryCatalog) => {
    const held = retained?.catalog;
    if (
      held &&
      (catalog.sequence < held.sequence ||
        (catalog.sequence === held.sequence &&
          (catalog.latest !== held.latest || catalog.previous !== held.previous)))
    )
      throw Error('History catalog regressed or forked');
    if (!same(held, catalog)) await save({ ...current(), catalog });
  };
  const exchange = async (action: HistoryExchange['action'], payload: unknown) => {
    const request = parseHistoryExchange({
      v: 1,
      kind: 'history-checkpoint-request',
      ...scope,
      epoch: p.epoch,
      head: p.head,
      nonce: hex(random(32)),
      expiresAt: (io.now?.() ?? Date.now()) + HISTORY_EXCHANGE_REQUEST_LIFETIME_MS,
      action,
      payload,
      signature: '00'.repeat(64),
    });
    request.signature = await owner.sign(await historyExchangeMessage(request));
    await durable();
    const raw = await io.exchange(structuredClone(request));
    guard();
    const page = await verifyHistoryCheckpointPage(raw, request, p.pin);
    verifyHistoryHeads(page.heads, authority);
    if (page.checkpoint) await verify(page.checkpoint, page.admission);
    else if (page.admission) {
      const attempt = retained?.attempt;
      if (
        action !== 'admit' ||
        !attempt ||
        (await historyCheckpointHash(attempt.checkpoint)) !== page.admission.checkpointHash
      )
        throw Error('Unexpected history completion receipt');
      await verify(attempt.checkpoint, page.admission);
    }
    if (
      action === 'read' &&
      page.checkpoint &&
      ((payload === 'latest' && page.checkpoint.manifest.sequence !== page.catalog.sequence) ||
        (payload === 'previous' &&
          page.checkpoint.manifest.sequence !== page.catalog.sequence - 1) ||
        (payload === 'pending' &&
          (page.checkpoint.manifest.sequence !== page.catalog.sequence + 1 ||
            page.checkpoint.manifest.parent !== page.catalog.latest)))
    )
      throw Error('History catalog sequence changed');
    await acceptCatalog(page.catalog);
    return page;
  };
  /** This device's own saved snapshot that no device has admitted. */
  const own = () => (retained?.attempt && !retained.attempt.admission ? retained.attempt : null);
  /** Where this device's own saved snapshot stands against an authenticated catalog (phase 547). */
  const savedState = async (
    page: HistoryCheckpointPage,
  ): Promise<HistorySavedSnapshot | undefined> => {
    const c = page.catalog,
      mine = own();
    if (!mine) return retained?.discard ? 'cancelling' : undefined;
    const hash = await historyCheckpointHash(mine.checkpoint);
    if (retained?.discard === hash) return 'cancelling';
    if (hash === c.pending) return 'waiting';
    // Already admitted, its reply lost: resuming reconciles it, and it is never discarded here.
    if (hash === c.latest || hash === c.previous) return undefined;
    const m = mine.checkpoint.manifest;
    if (m.epochHead !== p.head || !same(mine.checkpoint.sources, page.sources)) return 'stale';
    if (m.parent !== c.latest) return 'superseded';
    return c.pending === EMPTY_HISTORY_CHECKPOINT ? 'sendable' : 'blocked';
  };
  /** Another device's snapshot is pending, so the service would refuse a saved cancellation. */
  const deferred = (page: { catalog: HistoryCatalog }) =>
    !!retained?.discard &&
    page.catalog.pending !== EMPTY_HISTORY_CHECKPOINT &&
    page.catalog.pending !== retained.discard;
  const describe = async (
    page: HistoryCheckpointPage,
    latest?: HistoryCheckpoint | null,
  ): Promise<HistoryMaintenanceStatus> => {
    const cp = page.checkpoint;
    const tooLarge =
      (cp && historySnapshotTooLarge('pending', cp)) ||
      (latest && historySnapshotTooLarge('latest', latest));
    const saved = await savedState(page);
    return {
      ...(tooLarge ? { tooLarge } : {}),
      ...(saved ? { saved } : {}),
      ...(latest !== undefined
        ? {
            positions: {
              since: historyReplayPositions(page.heads, latest?.heads ?? []),
              allowed: HISTORY_REPLAY_EVENTS,
            },
          }
        : {}),
      sequence: page.catalog.sequence,
      pending: !cp
        ? retained?.attempt || retained?.discard
          ? 'resume'
          : 'none'
        : cp.manifest.epochHead !== p.head || !same(cp.sources, page.sources)
          ? 'stale'
          : retained?.attempt
            ? 'resume'
            : cp.manifest.producer !== credentialId || p.certificate.members.length === 1
              ? 'verify'
              : 'waiting',
      canDiscard:
        (!!cp && (cp.manifest.epochHead !== p.head || cp.manifest.producer === credentialId)) ||
        (saved !== undefined && saved !== 'cancelling') ||
        (saved === 'cancelling' && !deferred(page)),
    };
  };
  const refused = async (
    page: HistoryCheckpointPage,
    snapshot: HistoryReplayRefused['snapshot'],
    needed: number,
    allowed = HISTORY_REPLAY_EVENTS,
  ): Promise<HistoryMaintenanceStatus> => ({
    ...(await describe(page)),
    replay: { snapshot, needed, allowed },
  });
  const finish = async (
    page: HistoryCheckpointPage,
    parent?: HistoryCheckpoint | null,
  ): Promise<HistoryMaintenanceStatus> => {
    if (page.admission) {
      await save({ ...current(), attempt: null });
      return { sequence: page.catalog.sequence, pending: 'none', canDiscard: false } as const;
    }
    const cp = page.checkpoint!;
    if (cp.manifest.epochHead !== p.head || !same(cp.sources, page.sources))
      return { ...(await describe(page)), pending: 'stale' as const };
    if (cp.manifest.producer === credentialId && p.certificate.members.length > 1)
      return { ...(await describe(page)), pending: 'waiting', canDiscard: true } as const;
    // Admission makes it the snapshot every device installs and pruning relies on.
    if (historySnapshotTooLarge('pending', cp)) return describe(page);
    let admission = retained?.attempt?.admission;
    if (!admission) {
      // Count this device's replay against the bound before any replay starts (phase 547).
      if (parent !== undefined) {
        const needed = historyReplayPositions(cp.heads, await owner.replayStart(parent));
        if (needed > HISTORY_REPLAY_EVENTS) return refused(page, 'pending', needed);
      }
      try {
        admission = await owner.admit(structuredClone(cp));
      } catch (cause) {
        if (!(cause instanceof HistoryReplayLimit)) throw cause;
        return refused(page, 'pending', cause.needed, cause.allowed);
      }
      await verify(cp, admission);
      if (admission.admittingCredential !== credentialId)
        throw Error('History admitting actor changed');
      await save({ ...current(), attempt: { checkpoint: cp, admission } });
    }
    const admitted = await exchange('admit', admission);
    // A cancellation kept while this snapshot was pending named a proposal at or below its
    // sequence. With this snapshot latest, that proposal can never be published (phase 547).
    const hash = await historyCheckpointHash(cp);
    const fenced =
      !!retained?.discard && retained.discard !== hash && admitted.catalog.latest === hash;
    await save({ ...current(), attempt: null, ...(fenced ? { discard: null } : {}) });
    return { sequence: admitted.catalog.sequence, pending: 'none', canDiscard: false } as const;
  };
  const cancel = async (hash: string) => {
    // A saved admission of another snapshot is kept so that resuming can reconcile it, and a
    // cancellation kept for later is restored once this one is recorded (phase 547).
    const held = retained?.attempt,
      later = retained?.discard && retained.discard !== hash ? retained.discard : null;
    const keep =
      held?.admission && (await historyCheckpointHash(held.checkpoint)) !== hash ? held : null;
    await save({ ...current(), discard: hash });
    const page = await exchange('discard', hash);
    await save({ ...current(), attempt: keep, discard: later });
    return { sequence: page.catalog.sequence, pending: 'none', canDiscard: false } as const;
  };
  if (retained?.discard && command !== 'inspect') {
    // The service refuses a cancellation while another device's snapshot is pending, and the
    // saved catalog says when one was. Then confirm on a fresh catalog before keeping it.
    const known = retained.catalog;
    if (!known || !deferred({ catalog: known }) || !deferred(await exchange('read', 'catalog')))
      return cancel(retained.discard);
    // Kept until that snapshot is admitted or discarded; it never blocks verifying it. A saved
    // attempt of the proposal being cancelled cannot be published meanwhile (phase 547).
    const mine = own();
    if (mine && (await historyCheckpointHash(mine.checkpoint)) === retained.discard)
      await save({ ...current(), attempt: null });
  }
  if (command === 'resume' && retained?.attempt) {
    const { checkpoint, admission } = retained.attempt;
    // An earlier build may have saved it. Admitting someone else's snapshot is checked in finish.
    const tooLarge = admission ? null : historySnapshotTooLarge('saved', checkpoint);
    if (tooLarge)
      return {
        sequence: retained.catalog?.sequence ?? 0,
        pending: 'resume',
        canDiscard: true,
        tooLarge,
      };
    // Fresh request identity, exact saved semantic bytes; the service also resolves historical retries.
    return finish(await exchange('publish', checkpoint));
  }
  const latest = await exchange('read', 'latest');
  const pending = await exchange('read', 'pending');
  if (
    pending.catalog.latest !== latest.catalog.latest ||
    pending.catalog.sequence !== latest.catalog.sequence
  )
    throw Error('History advanced while reading; retry against its new baseline');
  if (pending.checkpoint)
    await verifyHistoryCheckpointParent(pending.checkpoint, latest.checkpoint);
  if (command === 'inspect') return describe(pending, latest.checkpoint);
  if (command === 'prune') {
    if (retained?.attempt || retained?.discard)
      throw Error('Finish saved history maintenance before pruning');
    const latest = await exchange('read', 'latest'),
      previous = await exchange('read', 'previous');
    if (
      !latest.checkpoint ||
      !latest.admission ||
      !previous.checkpoint ||
      !previous.admission ||
      latest.catalog.latest !== previous.catalog.latest ||
      latest.catalog.previous !== previous.catalog.previous
    )
      throw Error('Pruning requires two unchanged admitted snapshots');
    await verifyHistoryCheckpointParent(latest.checkpoint, previous.checkpoint);
    // A device behind the pruned floor can only continue by installing the latest snapshot.
    const tooLarge = historySnapshotTooLarge('latest', latest.checkpoint);
    if (tooLarge)
      return { sequence: latest.catalog.sequence, pending: 'none', canDiscard: false, tooLarge };
    const page = await exchange('prune', {
      latest: latest.catalog.latest,
      previous: latest.catalog.previous,
    });
    return { sequence: page.catalog.sequence, pending: 'none', canDiscard: false, pruned: true };
  }
  if (command === 'discard') {
    const mine = own();
    if (mine) {
      const state = await savedState(pending),
        hash = await historyCheckpointHash(mine.checkpoint);
      // An admitted snapshot is never discarded here: resending its exact bytes reconciles it.
      if (state === undefined) return finish(await exchange('publish', mine.checkpoint));
      if (state === 'waiting' || pending.catalog.pending === EMPTY_HISTORY_CHECKPOINT)
        return cancel(hash);
      if (state === 'blocked') {
        // The service refuses a cancellation while another device's snapshot is pending. Keep it
        // to send later, and drop the attempt so that snapshot can be verified here (phase 547).
        await save({ ...current(), attempt: null, discard: hash });
      } else {
        // Superseded or stale: the service can never accept it, so there is nothing to cancel.
        await save({ ...current(), attempt: null });
      }
      return describe(pending, latest.checkpoint);
    }
    if (pending.checkpoint) {
      const cp = pending.checkpoint;
      if (cp.manifest.epochHead === p.head && cp.manifest.producer !== credentialId)
        throw Error('Only the producer can cancel this checkpoint');
      const held = retained?.attempt;
      if (held && (await historyCheckpointHash(held.checkpoint)) !== pending.catalog.pending)
        throw Error('A different checkpoint is pending; retained progress was not cleared');
      return cancel(pending.catalog.pending);
    } else if (retained?.attempt?.admission) {
      // A lost admission reply could already have committed. Reconcile it instead of forgetting it.
      return finish(await exchange('admit', retained.attempt.admission));
    }
    if (retained?.attempt) return cancel(await historyCheckpointHash(retained.attempt.checkpoint));
    return { sequence: current().catalog!.sequence, pending: 'none', canDiscard: false };
  }
  if (retained?.attempt) throw Error('Resume or cancel the retained checkpoint first');
  if (pending.checkpoint) {
    if (command === 'create') return describe(pending);
    return finish(pending, latest.checkpoint);
  }
  if (command !== 'create') return describe(pending);
  // Count this device's replay against the bound before any replay starts (phase 547).
  const needed = historyReplayPositions(pending.heads, await owner.replayStart(latest.checkpoint));
  if (needed > HISTORY_REPLAY_EVENTS) return refused(pending, 'new', needed);
  let checkpoint: HistoryCheckpoint;
  try {
    checkpoint = await owner.prepare(
      structuredClone(latest.checkpoint),
      structuredClone(pending.heads),
      structuredClone(pending.sources),
    );
  } catch (cause) {
    if (!(cause instanceof HistoryReplayLimit)) throw cause;
    return refused(pending, 'new', cause.needed, cause.allowed);
  }
  await verifyHistoryCheckpoint(checkpoint, authority);
  await verifyHistoryCheckpointParent(checkpoint, latest.checkpoint);
  if (
    checkpoint.manifest.producer !== credentialId ||
    !same(checkpoint.heads, pending.heads) ||
    !same(checkpoint.sources, pending.sources)
  )
    throw Error('Prepared history source changed');
  // Refuse before anything is saved or sent: no progress, proposal or fence is left behind.
  const tooLarge = historySnapshotTooLarge('new', checkpoint);
  if (tooLarge) return { ...(await describe(pending)), tooLarge };
  // Another device may have published or admitted a snapshot while this one was prepared. Then
  // this one could only become a proposal nobody can publish: save and send nothing (phase 547).
  const now = await exchange('read', 'pending');
  if (
    now.catalog.sequence !== pending.catalog.sequence ||
    now.catalog.latest !== pending.catalog.latest ||
    now.catalog.pending !== pending.catalog.pending
  )
    return { ...(await describe(now)), raced: true };
  await save({ ...current(), attempt: { checkpoint, admission: null } });
  return finish(await exchange('publish', checkpoint));
}
