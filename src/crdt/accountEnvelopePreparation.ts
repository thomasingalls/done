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
            const used = new Set(state.positions.map((p) => p.source.id + ':' + p.source.index));
            let selected;
            for (const [id, bytes] of state.sources) {
              const c = decodeSourceCapsule(bytes, route);
              try {
                const index = c.sources.findIndex((_, i) => !used.has(id + ':' + i));
                if (index >= 0) {
                  selected = {
                    id,
                    index,
                    hash: hex(
                      new Uint8Array(
                        await task.wait(() => subtleFor(task).digest('SHA-256', bytes)),
                      ),
                    ),
                  };
                  break;
                }
              } finally {
                eraseCapsule(c);
              }
            }
            if (!selected) return null;
            await append(task, owner, route, {
              type: 'position',
              position: state.positions.length + 1,
              source: selected,
            });
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
          const capsule = decodeSourceCapsule(state.sources.get(position.source.id)!, route);
          try {
            const source = capsule.sources[position.source.index]!;
            wire = await task.wait(() =>
              sealNetworkEnvelope(
                { ...networkRoute(route), seq: position.position },
                { actor_id: source.actor, actor_kind: source.kind, updates: [source.bytes] },
                context.key(),
                context.signer(),
                task.step(() => random(12)),
                subtleFor(task),
              ),
            );
          } finally {
            eraseCapsule(capsule);
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
