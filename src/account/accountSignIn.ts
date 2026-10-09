import { isPrivateAccess } from './privateAccess';
import { bootstrapFetch } from './bootstrapHttp';
/** Discoverable account verification only. A service receipt never opens local content. */
import { parseAuthorityPin } from '../../account-protocol/authority';
import type { SetupConfig } from './firstDeviceSetup';
import { isAccountId } from './accountIdentity';

type SignInState =
  | { kind: 'choose'; error?: string; retryProof?: boolean }
  | { kind: 'working' }
  | { kind: 'verified'; accountId: string };
type Proof = {
  retryKey: string;
  ceremonyId: string;
  operation: 'authenticate';
  response: AuthenticationResponseJSON;
};
class SignInNotice extends Error {}
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const fresh = () =>
  btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');

export function createAccountSignIn(input: SetupConfig) {
  const pin = parseAuthorityPin(input.pin);
  if (pin.origin !== location.origin || (!input.networkSessions && !isPrivateAccess(input.token)))
    throw Error('Sign-in service differs from this page');
  const lifetime = new AbortController();
  const listeners = new Set<() => void>();
  let state: SignInState = { kind: 'choose' };
  let running = false;
  let retryKey = fresh();
  let proof: Proof | undefined;
  const publish = (next: SignInState) => {
    if (lifetime.signal.aborted) return;
    state = next;
    for (const listener of listeners) listener();
  };
  const request = async (route: string, body: unknown): Promise<Record<string, unknown>> => {
    let response: Response;
    try {
      response = await bootstrapFetch(input, route, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: lifetime.signal,
      });
    } catch {
      throw new SignInNotice(
        'Account verification needs a connection. The saved account is still locked.',
      );
    }
    const result: unknown = await response.json();
    if (!object(result)) throw Error('Invalid sign-in response');
    if (!response.ok || result['ok'] !== true) {
      if (['expired', 'cancelled', 'unknown-attempt'].includes(String(result['refusal']))) {
        retryKey = fresh();
        proof = undefined;
        throw new SignInNotice('That sign-in attempt expired. Choose your passkey again.');
      }
      if (['invalid-proof', 'account-not-active'].includes(String(result['refusal']))) {
        retryKey = fresh();
        proof = undefined;
        throw new SignInNotice(
          'That passkey could not be verified for an active account. Choose another passkey.',
        );
      }
      throw new SignInNotice(
        'Account verification could not finish. You can retry without changing the saved account.',
      );
    }
    return result;
  };
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    choose: async () => {
      if (running || lifetime.signal.aborted) return;
      running = true;
      publish({ kind: 'working' });
      try {
        if (!proof) {
          const result = await request('begin', { operation: 'authenticate', retryKey });
          const options = result['options'];
          if (
            result['stage'] !== 'ceremony' ||
            result['operation'] !== 'authenticate' ||
            !isAccountId(result['ceremonyId']) ||
            !object(options) ||
            options['rpId'] !== pin.rpId ||
            !isAccountId(options['challenge']) ||
            options['userVerification'] !== 'required' ||
            ('allowCredentials' in options &&
              (!Array.isArray(options['allowCredentials']) || options['allowCredentials'].length))
          )
            throw Error('Invalid discoverable sign-in challenge');
          lifetime.signal.throwIfAborted();
          const credential = (await navigator.credentials.get({
            publicKey: PublicKeyCredential.parseRequestOptionsFromJSON(
              options as unknown as PublicKeyCredentialRequestOptionsJSON,
            ),
            signal: lifetime.signal,
          })) as PublicKeyCredential | null;
          lifetime.signal.throwIfAborted();
          if (!credential) throw new DOMException('Cancelled', 'NotAllowedError');
          proof = {
            retryKey,
            ceremonyId: result['ceremonyId'],
            operation: 'authenticate',
            response: credential.toJSON() as AuthenticationResponseJSON,
          };
        }
        // Retain the exact proof in this owner when a reply is lost. No second
        // ceremony or historical receipt is used as local content authority.
        const result = await request('finish', proof);
        lifetime.signal.throwIfAborted();
        if (
          result['stage'] !== 'account-proof' ||
          !isAccountId(result['accountId']) ||
          !isAccountId(result['receiptId']) ||
          result['credentialId'] !== proof.response.id ||
          result['accountId'] !== proof.response.response.userHandle
        )
          throw Error('Sign-in result differs from the selected credential');
        publish({ kind: 'verified', accountId: result['accountId'] });
        proof = undefined;
        retryKey = fresh();
      } catch (cause) {
        if (lifetime.signal.aborted) return;
        publish({
          kind: 'choose',
          retryProof: proof !== undefined,
          error:
            cause instanceof DOMException && ['NotAllowedError', 'AbortError'].includes(cause.name)
              ? 'Passkey selection cancelled. Choose again or return to the saved account.'
              : cause instanceof SignInNotice
                ? cause.message
                : 'Account verification could not finish. The saved account is still locked.',
        });
      } finally {
        running = false;
      }
    },
    reset: () => {
      if (running || lifetime.signal.aborted) return;
      proof = undefined;
      retryKey = fresh();
      publish({ kind: 'choose' });
    },
    close: () => {
      lifetime.abort();
      proof = undefined;
      listeners.clear();
    },
  };
}
