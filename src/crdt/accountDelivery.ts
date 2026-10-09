import { historyMinimumGeneration } from '../../account-protocol/admissionHistory';
import { type AccountAccess } from '../account/accountHttp';
import type { VerificationMemo } from './verificationMemo';
import type { OpenedRecord } from './contentRecord';
import {
  encodeSubmit,
  encodeReadRequest,
  readRequestMessage,
  verifyReadPage,
  READ_PAGE_LIMIT,
  type ReadRequest,
} from '../../account-protocol/deliveryTransport';
import {
  verifyNetworkEnvelope,
  decodeNetworkEnvelope,
  assertAdmittedEnvelopeWireSize,
  EnvelopeSizeError,
} from '../../account-protocol/envelope';
import type { AuthorityPin } from '../../account-protocol/authority';
import {
  privateDeliveryPost,
  recordPrivateTransportDiagnostic,
} from '../account/privateDeliveryHttp';
import { networkRoute, encodeSpoolEntry, type SpoolEntry } from './spoolRecord';
/** Internal persistence operations attached to the spool's existing exclusive task queue. */
import { signSubmission } from '../../account-protocol/submission';
import {
  RESPONSE_LIMIT,
  decodePositionResponse,
  refusalId,
  type DecisionAuthority,
} from '../../account-protocol/positionDecision';
import { guardedSubtle, hex, type Bytes } from './custodyCrypto';
import {
  inspectDelivery,
  verifyDelivery,
  verifyDeliveryDecision,
  expectedPosition,
  encodeDeliveryEntry,
  publicationState,
  type DeliveryEntry,
  type DeliveryState,
} from './deliveryRecord';
import { extendSpoolWitness } from './spoolRecord';
import { sameSpoolWitness } from './contentRecord';
import { captureError, type CaptureRoute } from './sourceCapture';
import type { SessionTask } from './writeSession';
import type { prepareAccountCustody } from './custody';
type Owner = ReturnType<typeof prepareAccountCustody>;
export interface DeliveryContext {
  access?: AccountAccess;
  authority(): DecisionAuthority;
  /** Internal owner census; v8 stays strict, v9 accounts for the complete receive union. */
  inspect?: typeof inspectDelivery;
  /** Detached result from the just-validated complete v9 view; never used for proposed transitions. */
  verified?(records: readonly OpenedRecord[]): DeliveryState;
  reuse?(task: SessionTask): { memo: VerificationMemo; current(): void };
  pin(): AuthorityPin;
  canSubmit?(): boolean;
  network?<T>(operation: (task: SessionTask) => Promise<T>): Promise<T>;
  signer(): CryptoKey;
  publicKey(): CryptoKey;
  assertCurrent(task: SessionTask): Promise<void>;
  run<T>(
    operation: (task: SessionTask, owner: Owner, route: CaptureRoute) => Promise<T>,
  ): Promise<T>;
}
const subtleFor = (task: SessionTask) => guardedSubtle(() => task.step(() => {}));
async function postSubmission(
  pin: AuthorityPin,
  token: AccountAccess,
  body: Bytes,
  signal: AbortSignal,
) {
  let oversized = false;
  const response = await privateDeliveryPost(
    pin,
    token,
    'submit',
    body,
    RESPONSE_LIMIT,
    signal,
    (event) => {
      recordPrivateTransportDiagnostic(event);
      if (event.code === 'envelope-size') oversized = true;
    },
  );
  // Unsigned observation halts automatic retry only; it cannot close, replace or skip a position.
  if (oversized) throw new EnvelopeSizeError();
  return response;
}
export function describeDelivery(s: DeliveryState) {
  return {
    state: publicationState(s),
    acceptedThrough: s.acceptedThrough,
    finalThrough: s.finalThrough,
    closed: [...s.refusals.keys()].sort((a, b) => a - b),
    submissions: [...s.submissions.keys()],
    responses: [...s.responses].map(([position, values]) => ({ position, count: values.length })),
  };
}
export function createDeliveryOperations(context: DeliveryContext) {
  const inspect = context.inspect ?? inspectDelivery;
  const submissionPaused = () => context.canSubmit?.() === false;
  const validated = (
    records: readonly OpenedRecord[],
    c: ReturnType<typeof inspectDelivery>,
    route: CaptureRoute,
    task: SessionTask,
  ) =>
    context.verified
      ? Promise.resolve(context.verified(records))
      : verifyDelivery(c, route, context.authority(), context.publicKey(), subtleFor(task));
  const withState = <T>(
    operation: (
      task: SessionTask,
      owner: Owner,
      route: CaptureRoute,
      c: ReturnType<typeof inspectDelivery>,
      s: DeliveryState,
    ) => Promise<T>,
  ) =>
    context.run(async (task, owner, route) => {
      const records = await owner.carrier.load(task);
      try {
        const c = inspect(records, route, context.authority()),
          s = await task.wait(() => validated(records, c, route, task));
        await context.assertCurrent(task);
        return await operation(task, owner, route, c, s);
      } finally {
        for (const r of records) r.bytes.fill(0);
      }
    });
  const persist = async (
    task: SessionTask,
    owner: Owner,
    route: CaptureRoute,
    entry: DeliveryEntry | Extract<SpoolEntry, { type: 'retry' }>,
  ) => {
    const bytes =
      entry.type === 'retry'
        ? encodeSpoolEntry(entry, route)
        : encodeDeliveryEntry(entry, route, context.authority());
    try {
      const before = await owner.carrier.spoolWitness(task),
        after = await task.wait(() => extendSpoolWitness(before, bytes, subtleFor(task)));
      await owner.carrier.appendSpool(
        task,
        { kind: entry.type === 'submission' ? 'outbound' : 'heads', bytes },
        {
          before,
          after,
          beforeCommit: async (sealed) => {
            await context.assertCurrent(task);
            const rows = await owner.carrier.load(task);
            try {
              // Validate the transition against a fresh census at its actual reserved sequence.
              const proposed = [
                ...rows,
                {
                  kind: entry.type === 'submission' ? ('outbound' as const) : ('heads' as const),
                  bytes,
                  seq: sealed[0]!.seq,
                  gen: sealed[0]!.gen,
                },
              ];
              await task.wait(() =>
                verifyDelivery(
                  inspect(proposed, route, context.authority()),
                  route,
                  context.authority(),
                  context.publicKey(),
                  subtleFor(task),
                  context.reuse?.(task),
                ),
              );
            } finally {
              for (const r of rows) r.bytes.fill(0);
            }
            if (!sameSpoolWitness(before, await owner.carrier.spoolWitness(task)))
              captureError('Delivery state changed before commit');
          },
        },
      );
    } finally {
      bytes.fill(0);
    }
  };
  const record = async (
    task: SessionTask,
    owner: Owner,
    route: CaptureRoute,
    c: ReturnType<typeof inspectDelivery>,
    s: DeliveryState,
    position: number,
    bytes: Bytes,
  ) => {
    const expected = await task.wait(() => expectedPosition(c.spool, position, subtleFor(task)));
    if (!expected) return { kind: 'unknown' as const, recorded: false };
    const evidence = await task.wait(() =>
      verifyDeliveryDecision(bytes, expected, context.authority(), route, subtleFor(task)),
    );
    task.step(() => {});
    if (evidence.kind === 'unknown') return { kind: 'unknown' as const, recorded: false };
    if (s.responses.get(position)?.some((b) => hex(b) === hex(bytes)))
      return { kind: evidence.kind, recorded: false, status: describeDelivery(s) };
    if (s.conflict)
      return { kind: 'blocked' as const, recorded: false, status: describeDelivery(s) };
    await persist(task, owner, route, { type: 'response', position, wire: bytes });
    const rows = await owner.carrier.load(task);
    try {
      const checked = await task.wait(() =>
        validated(rows, inspect(rows, route, context.authority()), route, task),
      );
      return task.step(() => ({
        kind: evidence.kind,
        recorded: true,
        status: describeDelivery(checked),
      }));
    } finally {
      for (const r of rows) r.bytes.fill(0);
    }
  };
  const submitOwned = (operatorToken: AccountAccess) =>
    context.network!(async (network) => {
      const prepared = await withState(async (task, _owner, _route, _c, s) => {
        if (publicationState(s) !== 'ready')
          return { kind: 'blocked' as const, state: publicationState(s) };
        const position = s.acceptedThrough + 1,
          bytes = s.submissions.get(position);
        if (!bytes) return { kind: 'idle' as const };
        await context.assertCurrent(task);
        return { kind: 'ready' as const, position, bytes: bytes.slice() };
      });
      if (prepared.kind !== 'ready') return prepared;
      const payload = encodeSubmit(context.authority().workspace, prepared.bytes);
      let answer: Bytes | null = null;
      try {
        await network.wait(async () => {
          answer = submissionPaused()
            ? null
            : await postSubmission(
                context.pin(),
                context.access ?? operatorToken,
                payload,
                network.signal,
              );
        });
        if (!answer) return { kind: 'unknown' as const, recorded: false };
        const response = answer;
        return await withState(async (task, owner, route, c, s) => {
          if (publicationState(s) !== 'ready')
            return { kind: 'blocked' as const, state: publicationState(s) };
          if (prepared.position <= s.acceptedThrough)
            return { kind: 'accepted' as const, recorded: false };
          const retained = s.submissions.get(prepared.position);
          if (
            prepared.position !== s.acceptedThrough + 1 ||
            !retained ||
            hex(retained) !== hex(prepared.bytes)
          )
            captureError('Pending submission changed during transport');
          return record(task, owner, route, c, s, prepared.position, response);
        });
      } finally {
        prepared.bytes.fill(0);
        payload.fill(0);
        (answer as Bytes | null)?.fill(0);
      }
    });
  return {
    retryRetiredGeneration: () =>
      withState(async (task, owner, route, c, s) => {
        if (!route.history || s.conflict || s.finalThrough !== null || s.refusals.size !== 1)
          return false;
        const position = s.acceptedThrough + 1,
          id = s.refusals.get(position);
        const p = c.spool.positions.find((p) => p.position === position);
        if (!id || !p?.wire) return false;
        const envelope = decodeNetworkEnvelope(p.wire);
        if (
          envelope.gen >= route.generation ||
          envelope.gen >= historyMinimumGeneration(route.history, route.epoch)
        )
          return false;
        for (const wire of s.responses.get(position) ?? []) {
          const response = decodePositionResponse(wire);
          if (
            response.kind !== 'refused' ||
            response.refusal.reason !== 'retired-generation' ||
            (await refusalId(response.refusal, subtleFor(task))) !== id
          )
            continue;
          await persist(task, owner, route, { type: 'retry', position, refusal: wire });
          return true;
        }
        return false;
      }),
    deliveryStatus: () => withState(async (_task, _owner, _route, _c, s) => describeDelivery(s)),
    pendingSubmissions: () =>
      withState(async (_task, _owner, _route, _c, s) => {
        if (publicationState(s) !== 'ready') return [];
        const position = s.acceptedThrough + 1,
          bytes = s.submissions.get(position);
        return bytes ? [{ position, bytes: bytes.slice() }] : [];
      }),
    prepareSubmission: (position: number) =>
      withState(async (task, owner, route, c, s) => {
        if (!Number.isSafeInteger(position) || position < 1)
          throw Error('Invalid submission position');
        if (publicationState(s) !== 'ready')
          return { kind: 'blocked' as const, state: publicationState(s) };
        if (position <= s.acceptedThrough) return { kind: 'accepted' as const };
        if (position !== s.acceptedThrough + 1)
          throw Error('Resolve the earliest pending position first');
        const found = s.submissions.get(position);
        if (found) return { kind: 'ready' as const, position, bytes: found.slice() };
        const p = c.spool.positions.find((p) => p.position === position);
        const envelope = p?.wire;
        if (!envelope) throw Error('Submission requires a persisted envelope');
        // A wire without a persisted submission has never been exposed by this owner.
        // Existing submissions above retain exact retry/readback under historical policy.
        assertAdmittedEnvelopeWireSize(envelope.length);
        await context.assertCurrent(task);
        const closed = p?.retries?.at(-1)?.refusal;
        const proof = closed ? decodePositionResponse(closed) : null;
        const wire = await task.wait(() =>
          signSubmission(
            {
              lineage: context.authority().lineage,
              envelope,
              parent: proof?.kind === 'refused' ? proof.refusal : null,
            },
            context.signer(),
            subtleFor(task),
          ),
        );
        try {
          await persist(task, owner, route, { type: 'submission', position, wire });
          const rows = await owner.carrier.load(task);
          try {
            const checked = await task.wait(() =>
                validated(rows, inspect(rows, route, context.authority()), route, task),
              ),
              saved = checked.submissions.get(position);
            if (!saved) captureError('Persisted submission missing');
            return task.step(() => ({ kind: 'ready' as const, position, bytes: saved!.slice() }));
          } finally {
            for (const r of rows) r.bytes.fill(0);
          }
        } finally {
          wire.fill(0);
        }
      }),
    submitPending: (operatorToken: AccountAccess) =>
      context.network
        ? submitOwned(operatorToken)
        : withState(async (task, owner, route, c, s) => {
            if (publicationState(s) !== 'ready')
              return { kind: 'blocked' as const, state: publicationState(s) };
            const position = s.acceptedThrough + 1,
              bytes = s.submissions.get(position);
            if (!bytes) return { kind: 'idle' as const };
            await context.assertCurrent(task);
            const answer = await task.wait(() =>
              submissionPaused()
                ? null
                : postSubmission(
                    context.pin(),
                    context.access ?? operatorToken,
                    encodeSubmit(context.authority().workspace, bytes),
                    task.signal,
                  ),
            );
            await context.assertCurrent(task);
            if (!answer) return { kind: 'unknown' as const, recorded: false };
            return record(task, owner, route, c, s, position, answer);
          }),
    readAcceptedPage: async (operatorToken: AccountAccess, after = 0, limit = 8) => {
      const { a, pin, request, query } = await withState(async (task, _owner, route, _c, s) => {
        if (!Number.isSafeInteger(after) || after < 0 || after > s.acceptedThrough)
          throw Error('Read cursor requires retained accepted prefix');
        const a = context.authority(),
          pin = context.pin();
        const request: ReadRequest = {
          serviceId: pin.serviceId,
          origin: pin.origin,
          workspace: a.workspace,
          credential: route.credential,
          lineage: a.lineage,
          head: a.head,
          epoch: a.tip,
          after,
          limit,
          nonce: hex(crypto.getRandomValues(new Uint8Array(32))),
          expires: Date.now() + 30000,
          signature: '00'.repeat(64),
        };
        const message = readRequestMessage(request);
        await context.assertCurrent(task);
        request.signature = hex(
          new Uint8Array(
            await task.wait(() => subtleFor(task).sign('Ed25519', context.signer(), message)),
          ),
        );
        const query = encodeReadRequest(request);
        await context.assertCurrent(task);
        return { a, pin, request, query };
      });
      let answer: Bytes | null = null;
      try {
        const network =
          context.network ??
          (<T>(work: (task: SessionTask) => Promise<T>) => context.run((task) => work(task)));
        answer = await network((task) =>
          task.wait(() =>
            privateDeliveryPost(
              pin,
              context.access ?? operatorToken,
              'read',
              query,
              READ_PAGE_LIMIT,
              task.signal,
            ),
          ),
        );
        return await withState(async (task, _owner, route, c, s) => {
          if (JSON.stringify(context.authority()) !== JSON.stringify(a))
            return { kind: 'unknown' as const };
          if (!answer) return { kind: 'unknown' as const };
          try {
            const page = await task.wait(() =>
              verifyReadPage(answer!, query, a.acceptanceKey, subtleFor(task)),
            );
            if (page.through < s.acceptedThrough || request.expires <= Date.now())
              throw Error('Read prefix regressed');
            for (let i = 0; i < page.entries.length; i++) {
              const entry = page.entries[i]!,
                position = after + i + 1;
              const expected = await task.wait(() =>
                expectedPosition(c.spool, position, subtleFor(task)),
              );
              const own = c.spool.positions.find((p) => p.position === position)?.wire;
              if (!expected || !own || hex(own) !== hex(entry.envelope))
                throw Error('Read differs from retained spool');
              const envelope = await task.wait(() =>
                verifyNetworkEnvelope(
                  entry.envelope,
                  networkRoute(route, decodeNetworkEnvelope(entry.envelope).epoch),
                  context.publicKey(),
                  subtleFor(task),
                ),
              );
              if (envelope.seq !== position) throw Error('Read sequence');
              const proof = await task.wait(() =>
                verifyDeliveryDecision(entry.proof, expected, a, route, subtleFor(task)),
              );
              if (proof.kind !== 'accepted' || proof.head.final) throw Error('Read acceptance');
            }
            await context.assertCurrent(task);
            return task.step(() => ({
              kind: 'page' as const,
              through: page.through,
              next: page.next,
              more: page.next < page.through,
              entries: page.entries,
            }));
          } catch {
            task.step(() => {});
            return { kind: 'unknown' as const };
          }
        });
      } finally {
        query.fill(0);
        answer?.fill(0);
      }
    },
    recordResponse: async (position: number, answer: Bytes) => {
      if (
        !Number.isSafeInteger(position) ||
        position < 1 ||
        !(answer instanceof Uint8Array) ||
        answer.length > RESPONSE_LIMIT
      )
        throw Error('Invalid response input');
      const bytes = new Uint8Array(answer);
      try {
        return await withState((task, owner, route, c, s) =>
          record(task, owner, route, c, s, position, bytes),
        );
      } finally {
        bytes.fill(0);
      }
    },
  };
}
