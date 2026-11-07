/** Fixed browser-credential effects only; original native/service verifiers grant authority. */
import { parseAuthorityPin, type AuthorityPin } from '../../account-protocol/authority';
import { authenticationResponse, registrationResponse } from '../account/passkeyResponse';
import { assertSlotPasskey } from '../account/assertSlotPasskey';
import type { LocalPasskey, LocalPasskeyRequest } from './accountAccess';
import type { SlotAssertion } from '../account/slotUnlock';
import { capturePasskeyPrompt } from './workerPasskeyBridge';
import {
  createWorkerCredentialPrompt,
  createWindowCredentialPrompt,
  credentialFields,
  credentialId,
  credentialRefused,
} from './ownedCredentialPrompt';
import { workerMessageBytes, eraseWorkerMessage, type WorkerChannel } from './workerChannel';
type JsonPrompt = {
  id: number;
  kind: 'get' | 'create';
  options: unknown;
  requestedName: string | null;
};
function captureJson(input: unknown): JsonPrompt {
  workerMessageBytes(input);
  credentialFields(input, ['id', 'kind', 'options', 'requestedName']);
  const p = input as JsonPrompt;
  if (
    !credentialId(p.id) ||
    !['get', 'create'].includes(p.kind) ||
    (p.requestedName !== null &&
      (typeof p.requestedName !== 'string' ||
        p.requestedName.length < 1 ||
        p.requestedName.length > 80 ||
        /\p{Cc}/u.test(p.requestedName))) ||
    (p.kind === 'get' && p.requestedName !== null)
  )
    throw credentialRefused();
  return structuredClone(p);
}
export interface CeremonyBrowser {
  authenticate(options: unknown, signal: AbortSignal): Promise<AuthenticationResponseJSON>;
  register(
    options: unknown,
    requestedName: string | undefined,
    signal: AbortSignal,
  ): Promise<ReturnType<typeof registrationResponse>>;
  assertSlot: LocalPasskey;
}
export function createWorkerCeremonyBrowser(
  channel: Pick<WorkerChannel, 'request' | 'closed'>,
  signal: AbortSignal,
  live: () => void,
  failed: () => void,
): CeremonyBrowser {
  const prompt = createWorkerCredentialPrompt(channel, signal, live, failed, 'credentialCancel');
  return Object.freeze({
    authenticate: (options: unknown, scope: AbortSignal) =>
      prompt<JsonPrompt, AuthenticationResponseJSON>(
        'credential',
        scope,
        (id) => captureJson({ id, kind: 'get', options, requestedName: null }),
        eraseWorkerMessage,
      ),
    register: (options: unknown, requestedName: string | undefined, scope: AbortSignal) =>
      prompt<JsonPrompt, ReturnType<typeof registrationResponse>>(
        'credential',
        scope,
        (id) => captureJson({ id, kind: 'create', options, requestedName: requestedName ?? null }),
        eraseWorkerMessage,
      ),
    assertSlot: async (request: LocalPasskeyRequest) => {
      live();
      signal.throwIfAborted();
      return prompt<ReturnType<typeof capturePasskeyPrompt> & { kind: 'slot' }, SlotAssertion>(
        'credential',
        request.signal,
        (id) => ({
          ...capturePasskeyPrompt({
            id,
            rpId: request.rpId,
            credentialId: request.credentialId,
            challenge: request.challenge,
          }),
          kind: 'slot',
        }),
        eraseWorkerMessage,
      );
    },
  });
}
export function createWindowCeremonyBrowser(
  input: AuthorityPin,
  signal: AbortSignal,
  live: () => void,
) {
  const pin = parseAuthorityPin(input);
  if (typeof window === 'undefined' || location.origin !== pin.origin) throw credentialRefused();
  const prompts = createWindowCredentialPrompt(signal, live);
  return Object.freeze({
    close: prompts.close,
    cancel: prompts.cancel,
    async prompt(input: unknown) {
      prompts.current();
      workerMessageBytes(input);
      const value = input as { kind?: unknown };
      if (value?.kind === 'slot') {
        credentialFields(value, ['id', 'kind', 'rpId', 'credentialId', 'challenge']);
        const { kind: _kind, ...raw } = value as ReturnType<typeof capturePasskeyPrompt> & {
            kind: 'slot';
          },
          p = capturePasskeyPrompt(raw);
        return prompts.run(
          p.id,
          async (scope) => {
            if (p.rpId !== pin.rpId) throw credentialRefused();
            return assertSlotPasskey(scope)({ ...p, signal: scope });
          },
          () => p.challenge.fill(0),
        );
      }
      const p = captureJson(input);
      return prompts.run(
        p.id,
        async (scope) => {
          let credential: PublicKeyCredential | null;
          if (p.kind === 'get') {
            const options = PublicKeyCredential.parseRequestOptionsFromJSON(
              p.options as PublicKeyCredentialRequestOptionsJSON,
            );
            if (options.rpId !== undefined && options.rpId !== pin.rpId) throw credentialRefused();
            credential = (await navigator.credentials.get({
              publicKey: options,
              signal: scope,
            })) as PublicKeyCredential | null;
            scope.throwIfAborted();
            prompts.current();
            if (!credential) throw Error('Passkey request cancelled');
            return authenticationResponse(credential);
          }
          const options = PublicKeyCredential.parseCreationOptionsFromJSON(
            p.options as PublicKeyCredentialCreationOptionsJSON,
          );
          if (options.rp.id !== undefined && options.rp.id !== pin.rpId) throw credentialRefused();
          if (p.requestedName !== null) {
            const user = (p.options as PublicKeyCredentialCreationOptionsJSON).user;
            options.user = {
              ...options.user,
              name: user.id,
              displayName: `${p.requestedName} · ${user.id}`,
            };
          }
          credential = (await navigator.credentials.create({
            publicKey: options,
            signal: scope,
          })) as PublicKeyCredential | null;
          scope.throwIfAborted();
          prompts.current();
          if (!credential) throw Error('Passkey request cancelled');
          return registrationResponse(credential);
        },
        () => eraseWorkerMessage(p),
      );
    },
  });
}
