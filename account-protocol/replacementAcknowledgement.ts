/** Small recipient acknowledgement; independent of the membership graph. */
import { closed } from './preparation.ts';
import { domainMessage, json } from './admission.ts';
import { unhex } from './recovery.ts';
const h = (value: unknown, length = 32) => {
  unhex(value, length);
  return value as string;
};
export interface ReplacementCheckpointAdmission {
  v: 1;
  kind: 'replacement-checkpoint-admission';
  checkpointHash: string;
  candidate: string;
  parent: string;
  signature: string;
}
export function parseReplacementCheckpointAdmission(
  input: unknown,
): ReplacementCheckpointAdmission {
  if (json(input).length > 1024) throw Error('Replacement checkpoint admission too large');
  const a = closed(input, ['v', 'kind', 'checkpointHash', 'candidate', 'parent', 'signature']);
  if (a['v'] !== 1 || a['kind'] !== 'replacement-checkpoint-admission')
    throw Error('Invalid replacement checkpoint admission');
  return {
    v: 1,
    kind: 'replacement-checkpoint-admission',
    checkpointHash: h(a['checkpointHash']),
    candidate: h(a['candidate'], 16),
    parent: h(a['parent']),
    signature: h(a['signature'], 64),
  };
}
export const replacementCheckpointAdmissionMessage = (input: unknown) => {
  const { signature: _, ...body } = parseReplacementCheckpointAdmission(input);
  return domainMessage('done/replacement-checkpoint-admission/v1', body);
};
