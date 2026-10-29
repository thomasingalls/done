/** Original Page credential effects. The native coordinator supplies a fixed browser RPC port instead. */
import type { CeremonyBrowser } from '../crdt/ceremonyBrowser';
import type { LocalPasskey } from '../crdt/accountAccess';
import { authenticationResponse, registrationResponse } from './passkeyResponse';
export type SetupBrowserFactory = (signal: AbortSignal, guard: () => void) => CeremonyBrowser;
export const createPageSetupBrowser: SetupBrowserFactory = (signal, guard) => {
  const lifetime = { signal };
  const authenticate = async (options: unknown, _scope: AbortSignal) => {
    guard();
    const credential = (await navigator.credentials.get({
      publicKey: PublicKeyCredential.parseRequestOptionsFromJSON(
        options as PublicKeyCredentialRequestOptionsJSON,
      ),
      signal: lifetime.signal,
    })) as PublicKeyCredential | null;
    guard();
    if (!credential) throw Error('Passkey request cancelled');
    return authenticationResponse(credential);
  };
  const assertSlot: LocalPasskey = async ({
    rpId,
    credentialId,
    challenge,
    signal: ceremonySignal,
  }) => {
    const credential = (await navigator.credentials.get({
      publicKey: {
        rpId,
        challenge: new Uint8Array(challenge),
        userVerification: 'required',
        allowCredentials: [
          {
            id: Uint8Array.from(atob(credentialId.replaceAll('-', '+').replaceAll('_', '/')), (c) =>
              c.charCodeAt(0),
            ),
            type: 'public-key',
          },
        ],
      },
      signal: ceremonySignal ? AbortSignal.any([lifetime.signal, ceremonySignal]) : lifetime.signal,
    })) as PublicKeyCredential | null;
    guard();
    if (!credential) throw Error('Passkey request cancelled');
    const response = credential.response as AuthenticatorAssertionResponse;
    return {
      credentialId: credential.id,
      authenticatorData: new Uint8Array(response.authenticatorData),
      clientDataJSON: new Uint8Array(response.clientDataJSON),
      signature: new Uint8Array(response.signature),
      userHandle: response.userHandle ? new Uint8Array(response.userHandle) : null,
    };
  };

  return {
    authenticate,
    assertSlot,
    async register(optionsJson, requestedName, _scope) {
      const options = PublicKeyCredential.parseCreationOptionsFromJSON(
        optionsJson as PublicKeyCredentialCreationOptionsJSON,
      );
      if (requestedName)
        options.user = {
          ...options.user,
          // The generated account ID disambiguates matching personal names in
          // credential details. Never change the service-issued user handle.
          name: (optionsJson as PublicKeyCredentialCreationOptionsJSON).user.id,
          displayName: `${requestedName} · ${(optionsJson as PublicKeyCredentialCreationOptionsJSON).user.id}`,
        };
      const credential = (await navigator.credentials.create({
        publicKey: options,
        signal: lifetime.signal,
      })) as PublicKeyCredential | null;
      guard();
      if (!credential) throw Error('Passkey request cancelled');
      return registrationResponse(credential);
    },
  };
};
