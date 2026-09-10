/** Private v7 owner: durable allocation, distinct invocation grants, exact persisted v2 wire. No sender. */
import { openAccountCaptureOwner, type CaptureExtension } from './accountCapture';
import { captureAccountOptions } from './accountStartup';
import type { AccountWorkspaceOptions } from './accountWorkspace';
import { withPromotionRoot } from './promotionRecord';
import { claimScope } from './localGenesisRecord';
import {
  openEnvelope,
  openCredential,
  guardedSubtle,
  random,
  hex,
  type Bytes,
} from './custodyCrypto';
import {
  captureError,
  decodeSourceCapsule,
  eraseCapsule,
  type CaptureRoute,
} from './sourceCapture';
import {
  inspectSpool,
  verifySpool,
  verifySpoolWitness,
  extendSpoolWitness,
  encodeSpoolEntry,
  networkRoute,
  NET_SEAL_LIMIT,
  type SpoolEntry,
  type SpoolState,
} from './spoolRecord';
import { sealNetworkEnvelope } from '../../account-protocol/envelope';
import { createAdmissionOwner } from './admissionQueue';
import { createAdmittedWorkspace } from './admittedWorkspace';
import { ContentError } from './contentRecord';
import type { SessionTask } from './writeSession';
import type { prepareAccountCustody } from './custody';
export interface PersistedEnvelope {
  position: number;
  bytes: Bytes;
}
export async function openOwnedAccountSpoolWorkspace(input: AccountWorkspaceOptions) {
  const options = {
    ...captureAccountOptions(input),
    identity: structuredClone(input.identity),
    today: input.today,
  };
  let kg: Bytes | undefined, signer: CryptoKey | undefined, publicKey: CryptoKey | undefined;
  const subtleFor = (task: SessionTask) => guardedSubtle(() => task.step(() => {}));
  const verified = async (
    task: SessionTask,
    owner: ReturnType<typeof prepareAccountCustody>,
    route: CaptureRoute,
  ) => {
    const records = await owner.carrier.load(task);
    try {
      const state = inspectSpool(records, route);
      return { records, state };
    } catch (e) {
      for (const r of records) r.bytes.fill(0);
      throw e;
    }
  };
  const extension: CaptureExtension = {
    sourceRecords: (records, route) => inspectSpool(records, route).sourceRecords,
    async initialize(task, v) {
      await withPromotionRoot(task, v.claim, v.record, options.code, async (root, subtle) => {
        kg = await openEnvelope(claimScope(v.claim), root, v.record.envelope!, subtle);
        signer = await openCredential(claimScope(v.claim), root, v.marker.credentials![1], subtle);
        publicKey = await subtle.importKey(
          'raw',
          v.marker.credentials![1].publicKey,
          'Ed25519',
          false,
          ['verify'],
        );
      });
    },
    activate: (task, owner) => owner.carrier.enableSpool(task),
    async validate(task, records, route, counter) {
      const state = inspectSpool(records, route);
      await verifySpoolWitness(state, counter, subtleFor(task));
      await verifySpool(state, route, kg!, publicKey!, subtleFor(task));
    },
    dispose() {
      kg?.fill(0);
      kg = undefined;
      signer = publicKey = undefined;
    },
  };
  const { account, carrier, listCaptures, runCaptureTask } = await openAccountCaptureOwner(
    options,
    options.identity.id,
    extension,
  );
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
        { before, after },
      );
    } finally {
      bytes.fill(0);
    }
  };
  const useState = <T>(operation: (state: SpoolState) => T) =>
    runCaptureTask(async (task, owner, route) => {
      const { records, state } = await verified(task, owner, route);
      try {
        task.step(() => {});
        return operation(state);
      } finally {
        for (const r of records) r.bytes.fill(0);
      }
    });
  try {
    const workspace = await createAdmittedWorkspace(
      (config) => createAdmissionOwner(carrier, config),
      {
        identity: options.identity,
        captureSources: true,
        validateReceive: () => {
          throw Error('Account relay receiver is not configured');
        },
        ...(options.today ? { today: options.today } : {}),
        ...(options.signal ? { signal: options.signal } : {}),
      },
    );
    if (options.signal?.aborted || workspace.status.state !== 'active') {
      await workspace.close();
      throw Error('Account opening was cancelled');
    }
    return Object.freeze({
      ...account,
      kind: 'ready' as const,
      workspace,
      listCaptures,
      compactContent: async () => {
        await workspace.whenDurable();
        await useState(() => {});
        return carrier.compactContent();
      },
      listEnvelopes: () =>
        useState((state) =>
          state.positions
            .filter((p) => p.wire)
            .map((p) => ({ position: p.position, bytes: p.wire!.slice() })),
        ),
      spoolStatus: () =>
        useState((state) => ({
          attempts: state.attempts,
          positions: state.positions.map((p) => ({
            position: p.position,
            source: { ...p.source },
            attempts: [...p.attempts],
            persisted: !!p.wire,
          })),
        })),
      prepareNextEnvelope: async (): Promise<PersistedEnvelope | null> => {
        await workspace.whenDurable();
        return runCaptureTask(async (task, owner, route) => {
          // Sources are now durable. New journal appends during this operation belong to a later grant.
          let { records, state } = await verified(task, owner, route);
          let wire: Bytes | undefined;
          try {
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
                  kg!,
                  signer!,
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
    });
  } catch (e) {
    await carrier.close();
    throw e;
  }
}
