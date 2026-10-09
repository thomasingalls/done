import type { DecisionEvidence } from '../../account-protocol/positionDecision';
import type { ProofEvent } from './oracle';
/** Deliberately starts after verification. Placeholder signatures grant no production capability. */
export const evidence = (e: ProofEvent): Exclude<DecisionEvidence, { kind: 'unknown' }> => {
  const subject = {
    workspace: 'w',
    credential: 'c',
    position: e.position,
    epoch: 1,
    digest: '00'.repeat(32),
  };
  if (e.kind === 'refused')
    return {
      kind: 'refused',
      refusalId: e.id,
      refusal: {
        ...subject,
        parent: '00'.repeat(32),
        reason: 'stale-epoch',
        signature: '00'.repeat(64),
      },
    };
  return {
    kind: e.kind,
    head: {
      workspace: 'w',
      credential: 'c',
      position: e.position,
      link: '00'.repeat(32),
      epoch: 1,
      final: e.final,
      signature: '00'.repeat(64),
    },
    leaf: subject,
  };
};
