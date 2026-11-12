/** Serial native composition. Source keys, local originals and progress remain slot-owned. */
import { withNativeHistorySource } from './membershipSource';
import { withHistoryCustody } from './historyCustody';
import { readHistorySource, historyReplayStart } from './historySource';
import { createHistoryCheckpoint, admitHistoryCheckpoint } from './historyCheckpoint';
import { createHistoryTransport } from '../account/historyHttp';
import {
  privateDeliveryPost,
  recordPrivateTransportDiagnostic,
} from '../account/privateDeliveryHttp';
import { READ_PAGE_LIMIT } from '../../account-protocol/deliveryTransport';
import { verifyCheckpointTimeline } from '../../account-protocol/checkpointTimeline';
import { historyMembership } from '../../account-protocol/admissionHistory';
import { membershipState } from '../../account-protocol/membership';
import { same } from '../../account-protocol/admission';
import {
  historyCheckpointHash,
  EMPTY_HISTORY_CHECKPOINT,
  verifyHistoryCheckpointAdmission,
  type HistoryCheckpoint,
} from '../../account-protocol/historyCheckpoint';
import {
  historyExchangeMessage,
  HISTORY_EXCHANGE_REQUEST_LIFETIME_MS,
  parseHistoryExchange,
} from '../../account-protocol/historyExchange';
import {
  runHistoryMaintenance,
  type HistoryMaintenanceCommand,
} from '../account/historyMaintenance';
import { hex, random } from './custodyCrypto';
import type { ScopedAccess } from '../account/scopedTransport';
import { HistoryRefusal, type HistoryFailureCode } from '../account/historyFailure';
import type { Diagnostic } from '../../account-protocol/diagnostics';

/** Why a read of accepted writing returned nothing, from the transport's own closed diagnostic
 * vocabulary (phase 551). A named service hint is unsigned and only chooses the sentence. */
function readFailure(code: Diagnostic['code'] | undefined): HistoryFailureCode {
  switch (code) {
    case 'timeout':
      return 'history-timeout';
    case 'aborted':
      return 'history-stopped';
    case 'ledger-integrity':
      return 'history-ledger-integrity';
    case 'storage-unavailable':
      return 'history-storage-unavailable';
    case 'invalid-request':
    case 'envelope-size':
      return 'history-malformed';
    case 'unavailable':
    case 'state-changed':
    case 'unsupported-epoch':
    case 'out-of-order':
    case 'parent-required':
    case 'unissued-parent':
    case 'removal-pending':
      return 'history-refused';
    default:
      return 'history-unreachable';
  }
}

export async function runNativeHistoryMaintenance(
  input: Parameters<typeof withNativeHistorySource>[0],
  command: HistoryMaintenanceCommand,
  access: ScopedAccess,
) {
  const { task, kind, slotId, code } = input;
  return withNativeHistorySource(input, async (source) => {
    const timeline = await verifyCheckpointTimeline(
        source.base,
        source.proofs,
        source.earlySuccessor,
      ),
      authority = historyMembership(timeline.history),
      p = membershipState(authority),
      guard = () => task.step(() => {});
    if (!same(timeline.history.current, source.history.current))
      throw new HistoryRefusal('history-authority-changed', 'History source authority changed');
    const authorityAt = async (epoch: number, head: string) => {
      const state = timeline.states.get(epoch);
      if (!state || state.current.head !== head)
        throw new HistoryRefusal(
          'history-authority-changed',
          'Unknown history checkpoint authority',
        );
      return historyMembership(state);
    };
    const exchange = createHistoryTransport(authority, access, task.signal);
    const read = async (request: Uint8Array<ArrayBuffer>) => {
      let seen: Diagnostic['code'] | undefined;
      const page = await privateDeliveryPost(
        p.pin,
        access,
        'read-v2',
        request,
        READ_PAGE_LIMIT,
        task.signal,
        (d) => {
          seen = d.code;
          recordPrivateTransportDiagnostic(d);
        },
        true,
      );
      guard();
      if (!page)
        throw new HistoryRefusal(
          readFailure(seen),
          'Accepted writing is unavailable. Retry history maintenance when connected.',
        );
      return page;
    };
    // A proposal alone never establishes the baseline: independently retrieve its admission.
    const previous = async (expected: HistoryCheckpoint | string | null) => {
      const hash =
        expected === null
          ? EMPTY_HISTORY_CHECKPOINT
          : typeof expected === 'string'
            ? expected
            : await historyCheckpointHash(expected);
      const request = parseHistoryExchange({
        v: 1,
        kind: 'history-checkpoint-request',
        workspaceId: p.workspaceId,
        lineageId: p.lineageId,
        epoch: p.epoch,
        head: p.head,
        credentialId: source.producer,
        nonce: hex(random(32)),
        expiresAt: Date.now() + HISTORY_EXCHANGE_REQUEST_LIFETIME_MS,
        action: 'read',
        payload: 'latest',
        signature: '00'.repeat(64),
      });
      request.signature = await source.sign(await historyExchangeMessage(request));
      const page = await exchange(request);
      guard();
      if (
        page.catalog.latest !== hash ||
        (page.checkpoint === null) !== (hash === EMPTY_HISTORY_CHECKPOINT)
      )
        throw new HistoryRefusal(
          'history-advanced',
          'History advanced during preparation. Retry against its new baseline.',
        );
      if (!page.checkpoint) return null;
      if (!page.admission)
        throw new HistoryRefusal('history-reply-unverified', 'History baseline has no admission');
      const cp = page.checkpoint;
      await verifyHistoryCheckpointAdmission(
        page.admission,
        cp,
        await authorityAt(cp.manifest.epoch, cp.manifest.epochHead),
      );
      return { checkpoint: cp, admission: page.admission };
    };
    const replay = async (
      prior: Awaited<ReturnType<typeof previous>>,
      heads: HistoryCheckpoint['heads'],
      sources: HistoryCheckpoint['sources'],
    ) =>
      readHistorySource({
        base: source.base,
        proofs: source.proofs,
        earlySuccessor: source.earlySuccessor,
        binding: source.binding,
        producer: source.producer,
        keys: source.keys,
        heads,
        sources,
        previous: prior,
        ...(source.snapshot?.kind === 'recovery-reading' ? { recovery: source.snapshot } : {}),
        ...(source.snapshot?.kind === 'replacement-checkpoint' && source.installed
          ? { replacement: { checkpoint: source.snapshot, admission: source.installed.admission } }
          : {}),
        lifetime: { assertCurrent: guard },
        sign: source.sign,
        read,
        exchange,
      });
    return withHistoryCustody(task, kind, slotId, code, async (custody) => {
      if (custody.credentialId !== source.producer || !same(membershipState(custody.authority), p))
        throw new HistoryRefusal('history-authority-changed', 'History custody and source differ');
      return runHistoryMaintenance(
        {
          authority,
          credentialId: source.producer,
          authorityAt,
          sign: custody.sign,
          prepare: async (prior, heads, sources) => {
            const accepted = await replay(await previous(prior), heads, sources);
            try {
              const local = await source.local();
              try {
                guard();
                return await createHistoryCheckpoint(
                  accepted,
                  local,
                  source.keys.get(p.generation)!,
                  authority,
                  source.producer,
                  heads,
                  prior,
                  source.sign,
                  sources,
                );
              } finally {
                local.destroy();
              }
            } finally {
              accepted.destroy();
            }
          },
          admit: async (checkpoint) => {
            const accepted = await replay(
              await previous(checkpoint.manifest.parent),
              checkpoint.heads,
              checkpoint.sources,
            );
            try {
              guard();
              return await admitHistoryCheckpoint(
                checkpoint,
                source.keys.get(p.generation)!,
                authority,
                source.producer,
                accepted,
                source.sign,
              );
            } finally {
              accepted.destroy();
            }
          },
          // The same start the replay above chooses, so the bound is checked before it runs.
          replayStart: (prior) =>
            historyReplayStart({
              previous: prior,
              keys: source.keys,
              ...(source.snapshot?.kind === 'recovery-reading'
                ? { recovery: source.snapshot }
                : {}),
              ...(source.snapshot?.kind === 'replacement-checkpoint' && source.installed
                ? { replacement: { checkpoint: source.snapshot } }
                : {}),
            }),
        },
        command,
        { signal: task.signal, load: custody.load, replace: custody.replace, exchange },
      );
    });
  });
}
