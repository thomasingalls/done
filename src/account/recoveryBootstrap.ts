/** Code-opened recovery proof construction; no network, persistence or membership activation. */
import {
  prepareRecoveryBootstrap,
  recoveryBootstrapMessage,
  verifyRecoveryBootstrap,
  type RecoveryBootstrapContext,
} from '../../account-protocol/recoveryBootstrap.ts';
import { hex } from '../../account-protocol/recovery.ts';
import { verifySignature } from '../../account-protocol/admission.ts';
import { withRecoveryKeys } from './recovery.ts';

export async function createRecoveryBootstrap(
  context: RecoveryBootstrapContext,
  code: string,
  newSigner: CryptoKey,
) {
  const prepared = await prepareRecoveryBootstrap(context),
    message = recoveryBootstrapMessage(prepared.request);
  const countersignature = hex(
    new Uint8Array(await crypto.subtle.sign('Ed25519', newSigner, message)),
  );
  await verifySignature(prepared.request.newSPub, countersignature, message);
  return withRecoveryKeys(
    prepared.context.recovery,
    code,
    crypto.subtle,
    async (_wrapping, signing) => {
      const signature = hex(new Uint8Array(await crypto.subtle.sign('Ed25519', signing, message)));
      return verifyRecoveryBootstrap(
        { ...prepared.request, signature, countersignature },
        prepared.context,
      );
    },
  );
}
