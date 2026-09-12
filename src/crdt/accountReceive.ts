import { createVerifiedRecords } from './verifiedRecords';
import { createVerificationMemo } from './verificationMemo';
import { createInboundCoverage } from './inboundLedger';
import type { DeliveryState } from './deliveryRecord';
import type { InboundState } from './inboundLedger';
import { createEnvelopePreparation } from './accountEnvelopePreparation';
import { createDeliveryOperations, describeDelivery } from './accountDelivery';
import { publicationState } from './deliveryRecord';
import { requireSelfEnvelope, verifySyncState } from './accountSyncState';
import { createSyncScheduler, driveOutboundStep } from './accountSyncDriver';
import { createReceiveScheduler, driveReceiveStep } from './accountReceiveDriver';
import type { DriverGate } from './accountDriver';
/** Private receive owners. Authority and original-update promotion stay inside the held lifetime. */
import { openAccountCaptureOwner, type CaptureExtension } from './accountCapture';
import { captureAccountOptions, type AccountStartupOptions } from './accountStartup';
import { readPromotion, promotionPayload, withPromotionRoot } from './promotionRecord';
import { claimScope } from './localGenesisRecord';
import { same } from '../../account-protocol/admission';
import {
  encodeInboundRequest,
  inboundRequestMessage,
  decodeInboundRequest,
  decodeInboundPage,
} from '../../account-protocol/inboundTransport';
import { privateDeliveryPost } from '../account/privateDeliveryHttp';
import { READ_PAGE_LIMIT } from '../../account-protocol/deliveryTransport';
import {
  hex,
  openCredential,
  openEnvelope,
  guardedSubtle,
  random,
  type Bytes,
} from './custodyCrypto';
import { verifyInboundPage, type InboundContext } from './accountInbound';
import {
  heldInboundContext,
  inspectInbound,
  verifyInboundLedger,
  contextAt,
} from './inboundLedger';
import { verifySpoolWitness, verifySpool, extendSpoolWitness } from './spoolRecord';
import { verifyDelivery } from './deliveryRecord';
import { captureError, type CaptureRoute } from './sourceCapture';
import type { SessionTask } from './writeSession';
import type { prepareAccountCustody } from './custody';
import {
  createAdmissionOwner,
  AdmissionError,
  MAX_PENDING_BYTES,
  type OwnedReceiveQueue,
} from './admissionQueue';
import { createAdmittedWorkspace } from './admittedWorkspace';
import type { AccountWorkspaceOptions } from './accountWorkspace';

async function openAccountReceiveOwner(
  input: AccountStartupOptions,
  principalId?: string,
  canReceive: () => boolean = () => true,
  composed = false,
) {
  const options = captureAccountOptions(input);
  const verified = createVerifiedRecords<{
    delivery: DeliveryState;
    inbound: InboundState;
    census: ReturnType<typeof inspectInbound>;
  }>();
  // Keys and authority are fixed for this owner. No memo crosses a close/replacement boundary.
  const memo = createVerificationMemo(),
    coverage = createInboundCoverage();
  const inspectCensus = (records: Parameters<typeof inspectInbound>[0], route: CaptureRoute) =>
    verified.matches(records)
      ? verified.read(records).census
      : inspectInbound(records, route, base);
  let base!: InboundContext, signer: CryptoKey | undefined, publicKey!: CryptoKey;
  let expectedPayload = '',
    expectedRecord: unknown,
    outstanding: Bytes | undefined;
  const subtleFor = (task: SessionTask) => guardedSubtle(() => task.step(() => {}));
  const lifetime = (task: SessionTask) => ({ assertCurrent: () => task.step(() => {}) });
  const assertCurrent = async (task: SessionTask) => {
    const current = await readPromotion(task, options.slotId, options.code);
    if (
      !current.marker ||
      hex(promotionPayload(current.marker)) !== expectedPayload ||
      !same(current.record, expectedRecord)
    )
      captureError('Inbound authority changed before commit');
  };
  const extension: CaptureExtension = {
    version: 9,
    sourceRecords: (records, route) => inspectCensus(records, route).delivery.spool.sourceRecords,
    async initialize(task, v) {
      expectedPayload = hex(promotionPayload({ ...v.marker, v: 9, stage: 'account-receiving' }));
      expectedRecord = v.record;
      await withPromotionRoot(task, v.claim, v.record, options.code, async (root, subtle) => {
        const kg = await openEnvelope(claimScope(v.claim), root, v.record.envelope!, subtle);
        try {
          base = await heldInboundContext(v.marker, kg, subtle);
          signer = await openCredential(
            claimScope(v.claim),
            root,
            v.marker.credentials![1],
            subtle,
          );
          publicKey = await subtle.importKey(
            'raw',
            v.marker.credentials![1].publicKey,
            'Ed25519',
            false,
            ['verify'],
          );
        } catch (e) {
          kg.fill(0);
          throw e;
        }
      });
    },
    activate: (task, owner) => owner.carrier.enableSpool(task),
    async validate(task, records, route, counter, view) {
      try {
        await verified.verify(
          records,
          view ?? {},
          async (records) => {
            const census = inspectInbound(records, route, base),
              subtle = subtleFor(task),
              reuse = { memo, current: () => task.step(() => {}) };
            await verifySpoolWitness(census.delivery.spool, counter, subtle, reuse);
            await verifySpool(
              census.delivery.spool,
              route,
              base.generationKey,
              publicKey,
              subtle,
              reuse,
            );
            const delivery = await verifyDelivery(
              census.delivery,
              route,
              base.authority,
              publicKey,
              subtle,
              reuse,
            );
            const inbound = await verifyInboundLedger(census, records, base, lifetime(task), {
              memo,
              coverage,
            });
            if (composed) verifySyncState(census.delivery, delivery, inbound);
            memo.retain(
              new Set([
                ...census.delivery.spool.positions.flatMap((p) => [
                  'spool:' + p.position,
                  'link:' + p.position,
                ]),
                ...census.delivery.spool.events.map((_, i) => 'witness:' + i),
                ...census.delivery.entries.map((e) => 'delivery:' + e.record.seq),
                ...census.entries.map((e) => 'inbound:' + e.record.seq),
              ]),
            );
            return { delivery, inbound, census };
          },
          () => task.step(() => {}),
        );
      } catch (e) {
        memo.clear();
        coverage.clear();
        throw e;
      }
    },
    dispose() {
      verified.clear();
      memo.clear();
      coverage.clear();
      base?.generationKey.fill(0);
      signer = undefined;
      outstanding?.fill(0);
      outstanding = undefined;
    },
  };
  // The actor comes from the authenticated marker, not application identity. This read happens under
  // openAccountCaptureOwner's exclusive permit; the source principal is checked by its startup verifier.
  const { account, carrier, runCaptureTask, listCaptures } = await openAccountCaptureOwner(
    options,
    principalId,
    extension,
  );
  const state = async (
    task: SessionTask,
    owner: ReturnType<typeof prepareAccountCustody>,
    _route: CaptureRoute,
  ) => {
    await assertCurrent(task);
    const records = await owner.carrier.load(task);
    try {
      return task.step(() => verified.read(records).inbound);
    } finally {
      for (const r of records) r.bytes.fill(0);
    }
  };
  const describe = (s: Awaited<ReturnType<typeof state>>) =>
    Object.freeze({
      state: s.conflict ? ('conflict' as const) : ('ready' as const),
      receivedThrough: s.prefix.position,
      link: s.prefix.link,
      observedThrough: s.prefix.observedThrough,
    });
  const prepareRead = async (
    task: SessionTask,
    owner: ReturnType<typeof prepareAccountCustody>,
    route: CaptureRoute,
    after?: number,
  ) => {
    const s = await state(task, owner, route),
      cursor = after ?? s.prefix.position;
    if (s.conflict) throw Error('Inbound stream is conflicted');
    if (!Number.isSafeInteger(cursor) || cursor < 0 || cursor > s.prefix.position)
      throw Error('Invalid receive cursor');
    const r = {
      serviceId: base.service.id,
      origin: base.service.origin,
      workspace: base.authority.workspace,
      reader: base.reader.id,
      publisher: base.publisher.id,
      lineage: base.authority.lineage,
      head: base.authority.head,
      epoch: 1,
      after: cursor,
      limit: 1,
      nonce: hex(task.step(() => random(32))),
      expires: Date.now() + 30000,
      signature: '00'.repeat(64),
    };
    r.signature = hex(
      new Uint8Array(
        await task.wait(() => subtleFor(task).sign('Ed25519', signer!, inboundRequestMessage(r))),
      ),
    );
    await assertCurrent(task);
    return task.step(() => {
      outstanding?.fill(0);
      outstanding = encodeInboundRequest(r);
      return outstanding.slice();
    });
  };
  // Network work ends its carrier task before entering the admission FIFO. Waiting for receive
  // within this task would deadlock the receive commit behind its own fetch.
  const fetchPage = async (operatorToken: string) => {
    // Keep ownership outside runCaptureTask too: its final lifetime check can reject after the
    // operation produced a response. That rejection still has to erase both captured buffers.
    let request: Bytes | undefined,
      page: Bytes | null = null;
    try {
      return await runCaptureTask(async (task, owner, route) => {
        const query = (request = await prepareRead(task, owner, route));
        await task.wait(async () => {
          page = canReceive()
            ? await privateDeliveryPost(
                options.pin,
                operatorToken,
                'read-v2',
                query,
                MAX_PENDING_BYTES,
                task.signal,
              )
            : null;
        });
        await assertCurrent(task);
        return task.step(() => ({ request: query, page }));
      });
    } catch (cause) {
      request?.fill(0);
      (page as Bytes | null)?.fill(0);
      throw cause;
    }
  };
  const api = Object.freeze({
    ...account,
    close: () => carrier.close(),
    status: () =>
      runCaptureTask(async (task, owner, route) => describe(await state(task, owner, route))),
    /** A single outstanding owner-signed request; retry old positions only against retained evidence. */
    prepareRead: (after?: number) =>
      runCaptureTask((task, owner, route) => prepareRead(task, owner, route, after)),
    receivePage: (
      input: Bytes,
      promote: (updates: readonly Bytes[]) => void = () => {},
      expectedRequest?: Bytes,
    ) => {
      if (!(input instanceof Uint8Array) || !input.length || input.length > READ_PAGE_LIMIT)
        return Promise.reject(new AdmissionError('receive-refused', 'Invalid receive page'));
      const page = input.slice();
      return runCaptureTask(async (task, owner, route) => {
        const s = await state(task, owner, route);
        if (s.conflict) throw new AdmissionError('receive-refused', 'Inbound stream is conflicted');
        if (!outstanding)
          throw new AdmissionError('receive-refused', 'No outstanding receive request');
        if (expectedRequest && hex(expectedRequest) !== hex(outstanding))
          throw new AdmissionError('receive-refused', 'Receive request was superseded');
        const request = outstanding.slice();
        let result: Awaited<ReturnType<typeof verifyInboundPage>> | undefined;
        let committed = false;
        try {
          const r = decodeInboundRequest(request);
          // Own successful plaintext before wait's final lifetime check can reject it.
          try {
            await task.wait(async () => {
              result = await verifyInboundPage(
                contextAt(base, s, r.after),
                request,
                page,
                lifetime(task),
              );
            });
          } catch (cause) {
            task.step(() => {});
            throw new AdmissionError('receive-refused', String(cause), { cause });
          }
          if (!result) throw Error('Missing inbound verification result');
          if (!('record' in result))
            return task.step(() => {
              promote([]);
              return { kind: result!.kind, recorded: false, status: describe(s) };
            });
          if (composed && result.kind === 'received') {
            const rows = await owner.carrier.load(task);
            try {
              const census = inspectInbound(rows, route, base).delivery;
              const delivery = verified.read(rows).delivery;
              try {
                requireSelfEnvelope(
                  census,
                  result.position,
                  decodeInboundPage(page).entries[0]!.envelope,
                );
                verifySyncState(census, delivery, {
                  ...s,
                  prefix: { ...s.prefix, observedThrough: result.through },
                });
              } catch (cause) {
                // The local census already verified. A contradictory network candidate is refused
                // before persistence, not diagnosed as corruption of the existing Local workspace.
                throw new AdmissionError('receive-refused', 'Self-stream history differs', {
                  cause,
                });
              }
            } finally {
              for (const row of rows) row.bytes.fill(0);
            }
          }
          const evidence = result.record;
          const before = await owner.carrier.spoolWitness(task),
            after = await task.wait(() => extendSpoolWitness(before, evidence, subtleFor(task))),
            updates = result.kind === 'received' ? result.updates : [];
          await owner.carrier.appendInbound(
            task,
            [
              ...updates.map((bytes) => ({ kind: 'update' as const, bytes })),
              { kind: 'heads', bytes: result.record },
            ],
            {
              before,
              after,
              beforeCommit: async () => {
                if (r.expires <= Date.now())
                  throw new AdmissionError(
                    'receive-refused',
                    'Receive request expired before commit',
                  );
                await assertCurrent(task);
                const current = await state(task, owner, route);
                if (JSON.stringify(describe(current)) !== JSON.stringify(describe(s)))
                  captureError('Inbound prefix changed before commit');
              },
            },
          );
          committed = true;
          const saved = await state(task, owner, route);
          return task.step(() => {
            // This is the sole content-to-editor handoff: after native commit AND authenticated readback.
            promote(updates);
            return { kind: result!.kind, recorded: true, status: describe(saved) };
          });
        } catch (cause) {
          // If durable receive succeeded but publication/readback did not, only cold replay may resume
          // editing. Never let a discarded pending suffix erase this now-durable dependency.
          if (committed) void carrier.close().catch(() => {});
          throw cause;
        } finally {
          request.fill(0);
          if (result && 'record' in result) result.record.fill(0);
          if (result?.kind === 'received') for (const b of result.updates) b.fill(0);
        }
      }).finally(() => page.fill(0));
    },
    compactContent: () => carrier.compactContent(),
  });
  const createOutbound = (whenDurable: () => Promise<unknown>) => {
    if (!composed) throw Error('Outbound composition was not opened');
    const inspect: NonNullable<Parameters<typeof createDeliveryOperations>[0]['inspect']> = (
      records,
      route,
    ) => inspectCensus(records, route).delivery;
    const checkPublication = async (
      task: SessionTask,
      owner: ReturnType<typeof prepareAccountCustody>,
      _route: CaptureRoute,
    ) => {
      await assertCurrent(task);
      const records = await owner.carrier.load(task);
      try {
        const { inbound, delivery } = verified.read(records);
        if (inbound.conflict || publicationState(delivery) !== 'ready')
          throw Error('Publication is halted by retained evidence');
      } finally {
        for (const r of records) r.bytes.fill(0);
      }
    };
    const delivery = createDeliveryOperations({
      authority: () => base.authority,
      pin: () => options.pin,
      signer: () => signer!,
      publicKey: () => publicKey,
      assertCurrent,
      inspect,
      verified: (records) => verified.read(records).delivery,
      reuse: (task) => ({ memo, current: () => task.step(() => {}) }),
      canSubmit: canReceive,
      run: (operation) =>
        runCaptureTask(async (task, owner, route) => {
          const inbound = await state(task, owner, route);
          if (inbound.conflict) throw Error('Publication halted by inbound conflict');
          return operation(task, owner, route);
        }),
    });
    return {
      ...delivery,
      deliveryStatus: () =>
        runCaptureTask(async (task, owner) => {
          const records = await owner.carrier.load(task);
          try {
            const { inbound, delivery } = verified.read(records);
            return {
              ...describeDelivery(delivery),
              state: inbound.conflict ? ('conflict' as const) : publicationState(delivery),
            };
          } finally {
            for (const row of records) row.bytes.fill(0);
          }
        }),
      ...createEnvelopePreparation({
        key: () => base.generationKey,
        signer: () => signer!,
        whenDurable,
        checkPublication,
        inspect: (records, route) => inspect(records, route, base.authority).spool,
        run: runCaptureTask,
      }),
      spoolStatus: () =>
        runCaptureTask(async (task, owner, route) => {
          const records = await owner.carrier.load(task);
          try {
            const spool = inspect(records, route, base.authority).spool;
            return {
              attempts: spool.attempts,
              positions: spool.positions.map((p) => ({
                position: p.position,
                source: { ...p.source },
                attempts: [...p.attempts],
                persisted: !!p.wire,
              })),
            };
          } finally {
            for (const r of records) r.bytes.fill(0);
          }
        }),
    };
  };
  return { api, account, carrier, listCaptures, fetchPage, createOutbound };
}

/** Storage-only surface retained for independent conformance and preparation. */
export async function openOwnedAccountReceiveStore(input: AccountStartupOptions) {
  const { api } = await openAccountReceiveOwner(input);
  return Object.freeze({ ...api, receivePage: (bytes: Bytes) => api.receivePage(bytes) });
}

async function openReceivingWorkspace(
  input: AccountWorkspaceOptions,
  operatorToken?: string,
  composed = false,
) {
  const driven = operatorToken !== undefined;
  if (driven && !/^[A-Za-z0-9_-]{43}$/.test(operatorToken!))
    throw Error('Invalid private operator token');
  let gate: () => DriverGate = () => 'closed';
  const options = {
    ...captureAccountOptions(input),
    identity: structuredClone(input.identity),
    today: input.today,
  };
  const { api, account, carrier, listCaptures, fetchPage, createOutbound } =
    await openAccountReceiveOwner(
      options,
      options.identity.id,
      () => !driven || gate() === 'ready',
      composed,
    );
  let enqueue!: OwnedReceiveQueue;
  try {
    const workspace = await createAdmittedWorkspace(
      (config) =>
        createAdmissionOwner(carrier, config, (receive) => {
          enqueue = receive;
        }),
      {
        identity: options.identity,
        captureSources: true,
        suppressEmptySources: true,
        validateReceive: () => {
          throw Error('Use the owned signed-page receiver');
        },
        ...(options.today ? { today: options.today } : {}),
        ...(options.signal ? { signal: options.signal } : {}),
      },
    );
    if (options.signal?.aborted || workspace.status.state !== 'active') {
      await workspace.close();
      throw Error('Account opening was cancelled');
    }
    gate = () => {
      if (carrier.signal.aborted || !['active', 'blocked'].includes(workspace.status.state))
        return 'closed';
      if (workspace.status.state !== 'active' || workspace.status.pressure !== null)
        return 'local-storage';
      return globalThis.navigator?.onLine === false ? 'offline' : 'ready';
    };
    const receivePage = (bytes: Bytes, request?: Bytes) => {
      try {
        return enqueue(bytes, (page, promote) => api.receivePage(page, promote, request));
      } catch (cause) {
        return Promise.reject(cause);
      }
    };
    let flight: Promise<unknown> | undefined;
    carrier.beforeRelease?.(async () => {
      await flight?.catch(() => {});
    });
    const receiveNext = (operatorToken: string) => {
      if (carrier.signal.aborted)
        return Promise.reject(new AdmissionError('inactive-session', 'Receive owner is closed'));
      if (flight) return Promise.resolve({ kind: 'busy' as const });
      const work = (async () => {
        const { request, page } = await fetchPage(operatorToken);
        try {
          if (carrier.signal.aborted)
            throw new AdmissionError('inactive-session', 'Receive owner is closed');
          if (!page) return { kind: 'unknown' as const, recorded: false };
          // Only the ordered owner may verify, persist and publish this exact request's page.
          return await receivePage(page, request);
        } finally {
          request.fill(0);
          page?.fill(0);
        }
      })();
      flight = work;
      const settled = () => {
        if (flight === work) flight = undefined;
      };
      void work.then(settled, settled);
      return work;
    };
    const result = Object.freeze({
      ...account,
      kind: 'ready' as const,
      workspace,
      receiveStatus: api.status,
      prepareRead: api.prepareRead,
      receivePage: (bytes: Bytes) => receivePage(bytes),
      receiveNext,
      compactContent: async () => {
        await workspace.whenDurable();
        return carrier.compactContent();
      },
      listCaptures,
    });
    if (composed) {
      const outbound = createOutbound(() => workspace.whenDurable());
      let unsubscribe: (() => void) | undefined;
      const online = () => scheduler.wake('online'),
        offline = () => scheduler.wake('gate');
      const scheduler = createSyncScheduler({
        signal: carrier.signal,
        gate,
        send: () => driveOutboundStep(outbound, operatorToken ?? '', gate),
        receive: () => driveReceiveStep(result, operatorToken ?? '', gate),
        detach() {
          operatorToken = undefined;
          unsubscribe?.();
          globalThis.removeEventListener?.('online', online);
          globalThis.removeEventListener?.('offline', offline);
        },
      });
      try {
        let revision = workspace.status.revision,
          previousGate = gate();
        unsubscribe = workspace.onStatus((status) => {
          const changed = status.revision !== revision,
            current = gate();
          revision = status.revision;
          if (changed) scheduler.wake('local');
          if (current !== previousGate) {
            previousGate = current;
            scheduler.wake('gate');
          }
        });
        globalThis.addEventListener?.('online', online);
        globalThis.addEventListener?.('offline', offline);
        if (!carrier.beforeRelease) throw Error('Missing composed driver cleanup ownership');
        carrier.beforeRelease(scheduler.dispose);
        scheduler.wake('start');
      } catch (cause) {
        await scheduler.dispose();
        throw cause;
      }
      return Object.freeze({ ...result, outbound, sync: scheduler.runtime, receiver: undefined });
    }
    if (!driven)
      return Object.freeze({
        ...result,
        receiver: undefined,
        sync: undefined,
        outbound: undefined,
      });
    let unsubscribe: (() => void) | undefined;
    const online = () => scheduler.wake('online'),
      offline = () => scheduler.wake('gate');
    const scheduler = createReceiveScheduler({
      signal: carrier.signal,
      gate,
      step: () => driveReceiveStep(result, operatorToken ?? '', gate),
      detach() {
        operatorToken = undefined;
        unsubscribe?.();
        globalThis.removeEventListener?.('online', online);
        globalThis.removeEventListener?.('offline', offline);
      },
    });
    try {
      let previousGate = gate();
      unsubscribe = workspace.onStatus(() => {
        const current = gate();
        if (current !== previousGate) {
          previousGate = current;
          scheduler.wake('gate');
        }
      });
      globalThis.addEventListener?.('online', online);
      globalThis.addEventListener?.('offline', offline);
      if (!carrier.beforeRelease) throw Error('Missing receive driver cleanup ownership');
      carrier.beforeRelease(scheduler.dispose);
      scheduler.wake('start');
    } catch (cause) {
      await scheduler.dispose();
      throw cause;
    }
    return {
      ...result,
      sync: undefined,
      outbound: undefined,
      receiver: Object.freeze({
        get status() {
          return scheduler.status();
        },
        retry: () => scheduler.wake('retry'),
        onStatus: scheduler.onStatus,
      }),
    };
  } catch (cause) {
    await carrier.close();
    throw cause;
  }
}

/** Private manual v9 editor/receive surface, without automatic network work. */
export const openOwnedReceivingAccountWorkspace = (input: AccountWorkspaceOptions) =>
  openReceivingWorkspace(input);
/** Private polling receiver. Raw request/page operations remain internal to this composition. */
export async function openOwnedPollingAccountWorkspace(
  input: AccountWorkspaceOptions,
  operatorToken: string,
) {
  if (typeof operatorToken !== 'string') throw Error('Private operator token required');
  const result = await openReceivingWorkspace(input, operatorToken);
  if (!result.receiver) throw Error('Missing receive polling ownership');
  const { prepareRead: _prepare, receivePage: _receive, receiveNext: _next, ...owned } = result;
  return Object.freeze({ ...owned, receiver: result.receiver });
}

/** Explicit private single-owner round trip. It cannot enroll or clone another writer. */
export async function openOwnedSyncingAccountWorkspace(
  input: AccountWorkspaceOptions,
  operatorToken: string,
) {
  if (typeof operatorToken !== 'string') throw Error('Private operator token required');
  const result = await openReceivingWorkspace(input, operatorToken, true);
  if (!result.sync || !result.outbound) throw Error('Missing outbound composition');
  const {
    prepareRead: _prepare,
    receivePage: _receive,
    receiveNext: _next,
    outbound,
    receiver: _receiver,
    ...owned
  } = result;
  return Object.freeze({
    ...owned,
    deliveryStatus: outbound.deliveryStatus,
    spoolStatus: outbound.spoolStatus,
  });
}
