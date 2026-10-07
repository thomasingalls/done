import type { LocalPasskey } from '../crdt/accountAccess';
/** Offline account-bound assertion; never substitutes a service sign-in response. */
export const assertSlotPasskey =
  (signal: AbortSignal): LocalPasskey =>
  async ({ rpId, credentialId, challenge }) => {
    const credential = (await navigator.credentials.get({
      publicKey: {
        rpId,
        challenge: new Uint8Array(challenge),
        userVerification: 'required',
        allowCredentials: [
          {
            type: 'public-key',
            id: Uint8Array.from(atob(credentialId.replaceAll('-', '+').replaceAll('_', '/')), (c) =>
              c.charCodeAt(0),
            ),
          },
        ],
      },
      signal,
    })) as PublicKeyCredential | null;
    signal.throwIfAborted();
    if (!credential) throw Error('Passkey request cancelled');
    const response = credential.response as AuthenticatorAssertionResponse;
    return {
      credentialId: credential.id,
      authenticatorData: new Uint8Array(response.authenticatorData),
      clientDataJSON: new Uint8Array(response.clientDataJSON),
      signature: new Uint8Array(response.signature),
    };
  };
