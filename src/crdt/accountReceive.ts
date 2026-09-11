/** Private storage-only receiver. No editor, transport route, caller-supplied authority or progress setter. */
import { openAccountCaptureOwner, type CaptureExtension } from './accountCapture';
import { captureAccountOptions, type AccountStartupOptions } from './accountStartup';
import { readPromotion, promotionPayload, withPromotionRoot } from './promotionRecord';
import { claimScope } from './localGenesisRecord';
import { same } from '../../account-protocol/admission';
import {
  encodeInboundRequest,
  inboundRequestMessage,
  decodeInboundRequest,
} from '../../account-protocol/inboundTransport';
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

export async function openOwnedAccountReceiveStore(input: AccountStartupOptions) {
  const options = captureAccountOptions(input);
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
    sourceRecords: (records, route) =>
      inspectInbound(records, route, base).delivery.spool.sourceRecords,
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
    async validate(task, records, route, counter) {
      const census = inspectInbound(records, route, base),
        subtle = subtleFor(task);
      await verifySpoolWitness(census.delivery.spool, counter, subtle);
      await verifySpool(census.delivery.spool, route, base.generationKey, publicKey, subtle);
      await verifyDelivery(census.delivery, route, base.authority, publicKey, subtle);
      await verifyInboundLedger(census, records, base, lifetime(task));
    },
    dispose() {
      base?.generationKey.fill(0);
      signer = undefined;
      outstanding?.fill(0);
      outstanding = undefined;
    },
  };
  // The actor comes from the authenticated marker, not application identity. This read happens under
  // openAccountCaptureOwner's exclusive permit; the source principal is checked by its startup verifier.
  const { account, carrier, runCaptureTask } = await openAccountCaptureOwner(
    options,
    undefined,
    extension,
  );
  const state = async (
    task: SessionTask,
    owner: ReturnType<typeof prepareAccountCustody>,
    route: CaptureRoute,
  ) => {
    await assertCurrent(task);
    const records = await owner.carrier.load(task);
    try {
      return await verifyInboundLedger(
        inspectInbound(records, route, base),
        records,
        base,
        lifetime(task),
      );
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
  return Object.freeze({
    ...account,
    close: () => carrier.close(),
    status: () =>
      runCaptureTask(async (task, owner, route) => describe(await state(task, owner, route))),
    /** A single outstanding owner-signed request; retry old positions only against retained evidence. */
    prepareRead: (after?: number) =>
      runCaptureTask(async (task, owner, route) => {
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
            await task.wait(() =>
              subtleFor(task).sign('Ed25519', signer!, inboundRequestMessage(r)),
            ),
          ),
        );
        await assertCurrent(task);
        return task.step(() => {
          outstanding?.fill(0);
          outstanding = encodeInboundRequest(r);
          return outstanding.slice();
        });
      }),
    receivePage: (input: Bytes) => {
      if (!(input instanceof Uint8Array) || !input.length || input.length > READ_PAGE_LIMIT)
        return Promise.reject(Error('Invalid receive page'));
      const page = input.slice();
      return runCaptureTask(async (task, owner, route) => {
        const s = await state(task, owner, route);
        if (s.conflict) throw Error('Inbound stream is conflicted');
        if (!outstanding) throw Error('No outstanding receive request');
        const request = outstanding.slice();
        let result: Awaited<ReturnType<typeof verifyInboundPage>> | undefined;
        try {
          const r = decodeInboundRequest(request);
          // Own successful plaintext before wait's final lifetime check can reject it.
          await task.wait(async () => {
            result = await verifyInboundPage(
              contextAt(base, s, r.after),
              request,
              page,
              lifetime(task),
            );
          });
          if (!result) throw Error('Missing inbound verification result');
          if (!('record' in result))
            return task.step(() => ({ kind: result!.kind, recorded: false, status: describe(s) }));
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
                if (r.expires <= Date.now()) throw Error('Receive request expired before commit');
                await assertCurrent(task);
                const current = await state(task, owner, route);
                if (JSON.stringify(describe(current)) !== JSON.stringify(describe(s)))
                  captureError('Inbound prefix changed before commit');
              },
            },
          );
          const saved = await state(task, owner, route);
          return task.step(() => ({ kind: result!.kind, recorded: true, status: describe(saved) }));
        } finally {
          request.fill(0);
          if (result && 'record' in result) result.record.fill(0);
          if (result?.kind === 'received') for (const b of result.updates) b.fill(0);
        }
      }).finally(() => page.fill(0));
    },
    compactContent: () => carrier.compactContent(),
  });
}
