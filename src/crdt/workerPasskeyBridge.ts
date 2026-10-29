/** Scoped credential prompts only. Original Worker owners mint and verify every challenge. */
import type { LocalPasskey, LocalPasskeyRequest } from './accountAccess';
import type { SlotAssertion } from '../account/slotUnlock';
import type { WorkerChannel } from './workerChannel';
import {
  createWorkerCredentialPrompt,
  createWindowCredentialPrompt,
  credentialFields as fields,
  credentialId as id,
  credentialRefused as refused,
} from './ownedCredentialPrompt';
type Prompt = { id: number; rpId: string; credentialId: string; challenge: Uint8Array };
export function capturePasskeyPrompt(input: unknown): Prompt {
  fields(input, ['id', 'rpId', 'credentialId', 'challenge']);
  const p = input as Prompt;
  if (
    !id(p.id) ||
    typeof p.rpId !== 'string' ||
    !p.rpId.length ||
    p.rpId.length > 512 ||
    typeof p.credentialId !== 'string' ||
    !p.credentialId.length ||
    p.credentialId.length > 4096 ||
    !(p.challenge instanceof Uint8Array) ||
    Object.getPrototypeOf(p.challenge) !== Uint8Array.prototype ||
    !(p.challenge.buffer instanceof ArrayBuffer) ||
    p.challenge.buffer.byteLength > 4096 ||
    !p.challenge.length
  )
    throw refused();
  return { id: p.id, rpId: p.rpId, credentialId: p.credentialId, challenge: p.challenge.slice() };
}
/** Original slot format, using the same owned provider lifetime as JSON setup prompts. */
export function createWorkerPasskey(
  channel: Pick<WorkerChannel, 'request' | 'closed'>,
  signal: AbortSignal,
  live: () => void,
  failed: () => void,
): LocalPasskey {
  const prompt = createWorkerCredentialPrompt(channel, signal, live, failed, 'passkeyCancel');
  return async (request: LocalPasskeyRequest) => {
    live();
    signal.throwIfAborted();
    return prompt<Prompt, SlotAssertion>(
      'passkey',
      request.signal,
      (id) =>
        capturePasskeyPrompt({
          id,
          rpId: request.rpId,
          credentialId: request.credentialId,
          challenge: request.challenge,
        }),
      (p) => p.challenge.fill(0),
    );
  };
}
/** Window retains actual provider UI only; result bytes erase after the owned return copy. */
export function createWindowPasskey(assert: LocalPasskey, signal: AbortSignal, live: () => void) {
  const prompts = createWindowCredentialPrompt(signal, live);
  return Object.freeze({
    close: prompts.close,
    cancel: prompts.cancel,
    async prompt(input: unknown) {
      prompts.current();
      const p = capturePasskeyPrompt(input);
      return prompts.run(
        p.id,
        (scope) =>
          assert({
            rpId: p.rpId,
            credentialId: p.credentialId,
            challenge: p.challenge,
            signal: scope,
          }),
        () => p.challenge.fill(0),
      );
    },
  });
}
