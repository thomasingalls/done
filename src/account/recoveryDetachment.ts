/** Terminal recovery observation. Retains old openers, never a recovered generation key. */
import { closed } from '../../account-protocol/preparation';
import { unhex } from '../../account-protocol/recovery';
import {
  parseMembershipChain,
  verifyMembershipChain,
} from '../../account-protocol/membershipLocator';
import { historyPublisher } from '../../account-protocol/admissionHistory';
import { parseNativeRemoval, type NativeRemoval } from './deviceRemovalVault';
export const isRecoveryDetachment = (input: unknown) =>
  (input as { kind?: unknown } | null)?.kind === 'native-recovery-detachment';
export function parseRecoveryDetachment(input: unknown) {
  const r = closed(input, ['v', 'kind', 'credential', 'proofs', 'prior']);
  if (r['v'] !== 1 || r['kind'] !== 'native-recovery-detachment')
    throw Error('Invalid recovery detachment');
  unhex(r['credential'], 16);
  const proofs = parseMembershipChain(r['proofs']);
  if (proofs.continuations.at(-1)?.kind !== 'recovery-successor')
    throw Error('Recovery detachment lacks its terminal successor');
  return {
    v: 1 as const,
    kind: 'native-recovery-detachment' as const,
    credential: r['credential'] as string,
    proofs,
    prior: r['prior'] === null ? null : parseNativeRemoval(r['prior']),
  };
}
export type RecoveryDetachment = ReturnType<typeof parseRecoveryDetachment>;
export async function verifyRecoveryDetachment(
  input: unknown,
  base: Parameters<typeof verifyMembershipChain>[1],
  credential: string,
) {
  const value = parseRecoveryDetachment(input);
  if (value.credential !== credential) throw Error('Recovery detachment belongs to another device');
  const { history } = await verifyMembershipChain(value.proofs, base);
  const publisher = historyPublisher(history, credential);
  if (!publisher.finalization || publisher.finalization.epoch !== history.current.tip)
    throw Error('Recovery did not finalize this device');
  return { value, history, publisher };
}
export function priorRecoveryRotation(input: unknown): NativeRemoval | null {
  return parseRecoveryDetachment(input).prior;
}
