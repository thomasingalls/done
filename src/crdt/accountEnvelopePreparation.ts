/** Internal original-source envelope preparation. The caller owns the sole carrier and authority. */
import { guardedSubtle, hex, random, type Bytes } from './custodyCrypto';
import {
  decodeSourceCapsule,
  eraseCapsule,
  captureError,
  type CaptureRoute,
} from './sourceCapture';
import {
  encodeSpoolEntry,
  extendSpoolWitness,
  networkRoute,
  NET_SEAL_LIMIT,
  type SpoolEntry,
  type SpoolState,
  type SourceRef,
  positionSources,
  MAX_POSITION_SOURCES,
  MAX_POSITION_BYTES,
} from './spoolRecord';
import { sealNetworkEnvelope } from '../../account-protocol/envelope';
import { ContentError } from './contentRecord';
import type { SessionTask } from './writeSession';
import type { prepareAccountCustody } from './custody';
export interface PersistedEnvelope {
  position: number;
  bytes: Bytes;
}
type Owner = ReturnType<typeof prepareAccountCustody>;
export interface EnvelopePreparationContext {
  batchSources?: true;
  key(): Bytes;
  signer(): CryptoKey;
  whenDurable(): Promise<unknown>;
  checkPublication(
    task: SessionTask,
    owner: Owner,
    route: CaptureRoute,
    currentRecords?: readonly import('./contentRecord').OpenedRecord[],
  ): Promise<void>;
  inspect(records: Awaited<ReturnType<Owner['carrier']['load']>>, route: CaptureRoute): SpoolState;
  run<T>(
    operation: (task: SessionTask, owner: Owner, route: CaptureRoute) => Promise<T>,
  ): Promise<T>;
}
/** Select a bounded contiguous run of still-unallocated originals; never merge their bytes. */
export async function selectEnvelopeSources(
  state: SpoolState,
  route: CaptureRoute,
  batch: boolean,
  subtle: SubtleCrypto,
): Promise<SourceRef[]> {
  const used = new Set(
    state.positions.flatMap((p) => positionSources(p).map((s) => s.id + ':' + s.index)),
  );
  const selected: SourceRef[] = [];
  let actor = '',
    kind = '',
    total = 0;
  for (const [id, bytes] of state.sources) {
    const c = decodeSourceCapsule(bytes, route);
    let hash: string | undefined;
    try {
      for (const [index, source] of c.sources.entries()) {
        if (used.has(id + ':' + index)) continue;
        if (
          selected.length &&
          (!batch ||
            selected.length >= MAX_POSITION_SOURCES ||
            source.actor !== actor ||
            source.kind !== kind ||
            total + source.bytes.length > MAX_POSITION_BYTES)
        )
          return selected;
        hash ??= hex(new Uint8Array(await subtle.digest('SHA-256', bytes)));
        selected.push({ id, index, hash });
        actor = source.actor;
        kind = source.kind;
        total += source.bytes.length;
      }
    } finally {
      eraseCapsule(c);
    }
  }
  return selected;
}
export function createEnvelopePreparation(context: EnvelopePreparationContext) {
  const runCaptureTask = context.run;
  const subtleFor = (task: SessionTask) => guardedSubtle(() => task.step(() => {}));
  const verified = async (task: SessionTask, owner: Owner, route: CaptureRoute) => {
    const records = await owner.carrier.load(task);
    try {
      return { records, state: context.inspect(records, route) };
    } catch (cause) {
      for (const r of records) r.bytes.fill(0);
      throw cause;
    }
  };
  const append = async (
    task: SessionTask,
    owner: ReturnType<typeof prepareAccountCustody>,
    route: CaptureRoute,
    entry: SpoolEntry,
  ) => {
    const bytes = encodeSpoolEntry(entry, route);
    try {
      const before = await owner.carrier.spoolWitness(task);
      const after = await task.wait(() => extendSpoolWitness(before, bytes, subtleFor(task)));
      await owner.carrier.appendSpool(
        task,
        { kind: entry.type === 'envelope' ? 'outbound' : 'heads', bytes },
        {
          before,
          after,
          beforeCommit: () => context.checkPublication(task, owner, route),
        },
      );
    } finally {
      bytes.fill(0);
    }
  };
  return {
    prepareNextEnvelope: async (): Promise<PersistedEnvelope | null> => {
      await context.whenDurable();
      return runCaptureTask(async (task, owner, route) => {
        // Sources are now durable. New journal appends during this operation belong to a later grant.
        let { records, state } = await verified(task, owner, route);
        let wire: Bytes | undefined;
        try {
          // Same just-loaded complete view; every append still obtains a fresh publication census.
          await context.checkPublication(task, owner, route, records);
          let position = state.positions.at(-1);
          if (!position || position.wire) {
            const selected = await task.wait(() =>
              selectEnvelopeSources(state, route, context.batchSources === true, subtleFor(task)),
            );
            if (!selected.length) return null;
            await append(
              task,
              owner,
              route,
              selected.length === 1
                ? {
                    type: 'position',
                    position: state.positions.length + 1,
                    source: selected[0]!,
                  }
                : {
                    type: 'position-batch',
                    position: state.positions.length + 1,
                    sources: selected,
                  },
            );
            for (const r of records) r.bytes.fill(0);
            ({ records, state } = await verified(task, owner, route));
            position = state.positions.at(-1)!;
          }
          if (state.attempts + 1 >= NET_SEAL_LIMIT)
            throw new ContentError('rotation-required', 'Network invocation budget exhausted');
          const attempt = state.attempts + 1;
          await append(task, owner, route, {
            type: 'attempt',
            position: position.position,
            attempt,
          });
          // This acknowledged continuation owns exactly one invocation. No persisted grant is reusable.
          const originals: import('./sourceCapture').SourceUpdate[] = [];
          try {
            for (const ref of positionSources(position)) {
              const capsule = decodeSourceCapsule(state.sources.get(ref.id)!, route);
              try {
                const source = capsule.sources[ref.index]!;
                originals.push({ ...source, bytes: source.bytes.slice() });
              } finally {
                eraseCapsule(capsule);
              }
            }
            const first = originals[0]!;
            wire = await task.wait(() =>
              sealNetworkEnvelope(
                { ...networkRoute(route), seq: position.position },
                {
                  actor_id: first.actor,
                  actor_kind: first.kind,
                  updates: originals.map((s) => s.bytes),
                },
                context.key(),
                context.signer(),
                task.step(() => random(12)),
                subtleFor(task),
              ),
            );
          } finally {
            for (const source of originals) source.bytes.fill(0);
          }
          await append(task, owner, route, {
            type: 'envelope',
            position: position.position,
            attempt,
            wire,
          });
          for (const r of records) r.bytes.fill(0);
          ({ records, state } = await verified(task, owner, route));
          const saved = state.positions.find((p) => p.position === position!.position)?.wire;
          if (!saved) captureError('Persisted envelope missing after commit');
          return task.step(() => ({ position: position!.position, bytes: saved!.slice() }));
        } finally {
          wire?.fill(0);
          for (const r of records) r.bytes.fill(0);
        }
      });
    },
  };
}
