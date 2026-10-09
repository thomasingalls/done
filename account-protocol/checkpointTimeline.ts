/** Historical checkpoint eligibility derived from the actual verified membership chain. */
import { parseMembershipChain } from './membershipLocator.ts';
import { parseSuccessor, type SuccessorBase } from './successor.ts';
import {
  verifyEarlyHistory,
  verifyCertificationHistory,
  extendMembershipHistory,
  type AdmissionHistory,
} from './admissionHistory.ts';
export async function verifyCheckpointTimeline(
  baseInput: SuccessorBase,
  input: ReturnType<typeof parseMembershipChain> | null,
  earlyInput: unknown | null = null,
) {
  const base = structuredClone(baseInput),
    proofs = input === null ? null : parseMembershipChain(input),
    successor = proofs?.successor ?? (earlyInput === null ? null : parseSuccessor(earlyInput));
  let history = await verifyEarlyHistory(base);
  const states = new Map<number, AdmissionHistory>([[1, history]]);
  if (successor) {
    history = await verifyEarlyHistory(base, successor);
    states.set(2, history);
  }
  if (proofs?.certification) {
    history = await verifyCertificationHistory(proofs.certification, successor, base, {
      epoch: 3,
      head: proofs.certification.head,
    });
    states.set(3, history);
  }
  for (const proof of proofs?.continuations ?? []) {
    history = await extendMembershipHistory(proof, history);
    states.set(history.current.tip, history);
  }
  return { base, proofs, history, states };
}
