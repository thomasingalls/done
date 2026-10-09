/** Bounded source inventory, captured with membership and rechecked before checkpoint admission. */
import type { DatabaseSync } from 'node:sqlite';
import { membershipProofChain } from './membershipLocator.ts';
import { recoveryCheckpoint } from './recoveryCheckpoints.ts';
import type { Snapshot } from './delivery.ts';
import {
  parseHistorySourceValue,
  parseHistorySources,
  type HistorySourceRef,
} from '../account-protocol/historySources.ts';
import { hash } from './protocol.ts';
export function historySources(
  db: DatabaseSync,
  workspace: string,
  s: Snapshot,
  requested?: string,
) {
  const proofs =
    s.transfer?.artifact || s.recoveries?.length
      ? membershipProofChain(s)
      : { certification: null, continuations: [] };
  const targets = [
    ...(proofs.certification
      ? [{ epoch: 3, head: proofs.certification.head, kind: 'original' as const, id: workspace }]
      : []),
    ...proofs.continuations.flatMap<{
      epoch: number;
      head: string;
      kind: 'replacement' | 'recovery';
      id: string;
    }>((p) =>
      p.kind === 'membership-admission'
        ? [
            {
              epoch: p.epoch.epoch,
              head: p.head,
              kind: 'replacement' as const,
              id: p.epoch.preparation.context.attemptId,
            },
          ]
        : p.kind === 'recovery-successor'
          ? [{ epoch: p.epoch.epoch, head: p.head, kind: 'recovery' as const, id: p.head }]
          : [],
    ),
  ];
  const sources: HistorySourceRef[] = [];
  let selected: {
    ref: HistorySourceRef;
    checkpoint: ReturnType<typeof parseHistorySourceValue>;
  } | null = null;
  for (const target of targets) {
    const raw = recoveryCheckpoint(db, workspace, target.kind, target.id);
    if (raw === null) {
      if (target.kind === 'recovery') throw Error('Committed recovery source is missing');
      continue;
    }
    const checkpoint = parseHistorySourceValue(target.kind, JSON.parse(raw));
    const ref = {
      epoch: target.epoch,
      head: target.head,
      kind: target.kind,
      hash: hash(JSON.stringify(checkpoint)),
    };
    sources.push(ref);
    if (requested === ref.head) selected = { ref, checkpoint };
  }
  return { sources: parseHistorySources(sources), source: selected };
}
