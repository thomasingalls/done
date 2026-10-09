/** Retained checkpoint attempts. Publication/admission are distinct from installation and pruning. */
import { closed } from '../../account-protocol/preparation';
import { same } from '../../account-protocol/admission';
import { unhex } from '../../account-protocol/recovery';
import { membershipState, type VerifiedMembership } from '../../account-protocol/membership';
import {
  HISTORY_CHECKPOINT_LIMIT,
  HISTORY_ADMISSION_LIMIT,
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
  HISTORY_EXCHANGE_LIFETIME_MS,
  type HistoryCatalog,
  type HistoryExchange,
  type HistoryCheckpointPage,
} from '../../account-protocol/historyExchange';
import { hex, random, type Bytes } from '../crdt/custodyCrypto';

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
export type HistoryMaintenanceCommand = 'inspect' | 'create' | 'resume' | 'verify' | 'discard';
export interface HistoryMaintenanceStatus {
  sequence: number;
  pending: 'none' | 'resume' | 'verify' | 'waiting' | 'stale';
  canDiscard: boolean;
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
      expiresAt: (io.now?.() ?? Date.now()) + HISTORY_EXCHANGE_LIFETIME_MS,
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
  const describe = (page: HistoryCheckpointPage): HistoryMaintenanceStatus => {
    const cp = page.checkpoint;
    return {
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
        !!cp && (cp.manifest.epochHead !== p.head || cp.manifest.producer === credentialId),
    };
  };
  const finish = async (page: HistoryCheckpointPage) => {
    if (page.admission) {
      await save({ ...current(), attempt: null });
      return { sequence: page.catalog.sequence, pending: 'none', canDiscard: false } as const;
    }
    const cp = page.checkpoint!;
    if (cp.manifest.epochHead !== p.head || !same(cp.sources, page.sources))
      return { ...describe(page), pending: 'stale' as const };
    if (cp.manifest.producer === credentialId && p.certificate.members.length > 1)
      return { sequence: page.catalog.sequence, pending: 'waiting', canDiscard: true } as const;
    let admission = retained?.attempt?.admission;
    if (!admission) {
      admission = await owner.admit(structuredClone(cp));
      await verify(cp, admission);
      if (admission.admittingCredential !== credentialId)
        throw Error('History admitting actor changed');
      await save({ ...current(), attempt: { checkpoint: cp, admission } });
    }
    const admitted = await exchange('admit', admission);
    await save({ ...current(), attempt: null });
    return { sequence: admitted.catalog.sequence, pending: 'none', canDiscard: false } as const;
  };
  const cancel = async (hash: string) => {
    await save({ ...current(), discard: hash });
    const page = await exchange('discard', hash);
    await save({ ...current(), attempt: null, discard: null });
    return { sequence: page.catalog.sequence, pending: 'none', canDiscard: false } as const;
  };
  if (retained?.discard && command !== 'inspect') return cancel(retained.discard);
  if (command === 'resume' && retained?.attempt) {
    const { checkpoint } = retained.attempt;
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
  if (command === 'inspect') return describe(pending);
  if (command === 'discard') {
    if (pending.checkpoint) {
      if (!describe(pending).canDiscard)
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
    return finish(pending);
  }
  if (command !== 'create') return describe(pending);
  const checkpoint = await owner.prepare(
    structuredClone(latest.checkpoint),
    structuredClone(pending.heads),
    structuredClone(pending.sources),
  );
  await verifyHistoryCheckpoint(checkpoint, authority);
  await verifyHistoryCheckpointParent(checkpoint, latest.checkpoint);
  if (
    checkpoint.manifest.producer !== credentialId ||
    !same(checkpoint.heads, pending.heads) ||
    !same(checkpoint.sources, pending.sources)
  )
    throw Error('Prepared history source changed');
  await save({ ...current(), attempt: { checkpoint, admission: null } });
  return finish(await exchange('publish', checkpoint));
}
