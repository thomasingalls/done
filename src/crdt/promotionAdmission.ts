/** Private admission owner. The Local index stays retained and excluded until a later handoff. */
import {
  parseAdmissionRequest,
  requestDigest,
  certificationMessage,
  originMessage,
  verifyAdmissionRequest,
  verifyOffer,
  completionBodies,
  manifestMessage,
  semanticMessage,
  verifyCompletion,
  verifyReceipt,
  same,
  type AdmissionRequest,
  type AdmissionCompletion,
  type AdmissionReceipt,
} from '../../account-protocol/admission';
import { pendingBytes, verifyPendingProof } from '../../account-protocol/preparation';
import { withPromotionSlot } from './writeSession';
import {
  ownGenesisOptions,
  withVerifiedGenesis,
  type PrepareGenesisOptions,
} from './promotionGenesis';
import { signPromotion, writePromotion, type PromotionRecord } from './promotionRecord';
import { hex, random } from './custodyCrypto';
export interface AdmissionTransport {
  begin(input: { retryKey: string; request: AdmissionRequest }): Promise<unknown>;
  finish(input: {
    retryKey: string;
    requestDigest: string;
    completion: AdmissionCompletion;
  }): Promise<unknown>;
}
export interface PromotionAdmissionOptions extends PrepareGenesisOptions {
  admissionTransport: AdmissionTransport;
}
export async function admitLocalPromotion(
  input: PromotionAdmissionOptions,
): Promise<AdmissionReceipt> {
  const options = {
    ...ownGenesisOptions(input),
    admissionTransport: { ...input.admissionTransport },
  };
  return withPromotionSlot(
    options.slotId,
    options.code,
    (task) =>
      withVerifiedGenesis(
        task,
        options,
        async (verified) => {
          const { claim, record, candidate, root, signer, bootstrapSigner, subtle, parts } =
            verified;
          let marker = verified.marker;
          const sign = async (message: Uint8Array<ArrayBuffer>) =>
            hex(new Uint8Array(await subtle.sign('Ed25519', signer, message)));
          let request: AdmissionRequest = {
            v: 1,
            candidate,
            recovery: options.draft,
            originSignature: '00'.repeat(64),
            certification: {
              members: [
                {
                  id: marker.credentialIds[1],
                  wPub: hex(marker.credentials![0].publicKey),
                  sPub: hex(marker.credentials![1].publicKey),
                },
              ],
              recoveryStateDigest: marker.account.confirmation!.recoveryStateDigest,
              approver: marker.credentialIds[1],
              signature: '00'.repeat(64),
            },
          };
          request.certification.signature = await sign(await certificationMessage(request));
          request.originSignature = hex(
            new Uint8Array(
              await subtle.sign('Ed25519', bootstrapSigner, await originMessage(request)),
            ),
          );
          // Use the same closed, ordered representation in memory and in the retained carrier.
          request = parseAdmissionRequest(request);
          await verifyAdmissionRequest(request, marker.account);
          // Validate row-7 LP bounds before writing a request that cannot be completed.
          if (parts.sv.length > 65534 || parts.ds.length > 65534)
            throw Error('Admission coverage exceeds LP bound');
          const save = async (
            stage: PromotionRecord['stage'],
            admission: NonNullable<PromotionRecord['admission']>,
          ) => {
            const next = await signPromotion(root, { ...marker, v: 3, stage, admission }, subtle);
            await writePromotion(task, claim, record, record, marker, next);
            marker = next;
          };
          if (marker.v === 2)
            await save('admission-requested', {
              request: parseAdmissionRequest(request),
              offer: null,
              completion: null,
              receipt: null,
            });
          if (!same(marker.admission!.request, request))
            throw Error('Retained admission request changed');
          if (marker.stage === 'admission-receipted')
            return verifyReceipt(marker.admission!.receipt, request, options.pin, parts);
          const response = await task.wait(() =>
            options.admissionTransport.begin({
              retryKey: options.retryKey,
              request: structuredClone(request),
            }),
          );
          if ((response as { kind?: unknown })?.kind === 'promotion-receipt') {
            // A final reply was lost. Only an already retained completion may recover an admitted result.
            const receipt = await task.wait(() =>
              verifyReceipt(response, request, options.pin, parts),
            );
            if (
              !marker.admission!.offer ||
              !marker.admission!.completion ||
              !same(receipt.offer, marker.admission!.offer) ||
              !same(receipt.completion, marker.admission!.completion)
            )
              throw Error('Unowned committed admission');
            await save('admission-receipted', { ...marker.admission!, receipt });
            return receipt;
          }
          const offer = await task.wait(() => verifyOffer(response, request, options.pin));
          if (marker.admission!.offer && !same(offer, marker.admission!.offer))
            throw Error('Retained offer changed');
          const completion = await completionBodies(request, offer, parts);
          completion.manifest.signature = await sign(manifestMessage(completion.manifest));
          completion.admission.signature = await sign(semanticMessage(completion.admission));
          await verifyCompletion(completion, request, offer, parts);
          if (marker.stage === 'admission-requested')
            await save('admission-offered', { request, offer, completion, receipt: null });
          if (!same(marker.admission!.completion, completion))
            throw Error('Retained completion changed');
          const answer = await task.wait(async () =>
            options.admissionTransport.finish({
              retryKey: options.retryKey,
              requestDigest: await requestDigest(request),
              completion: structuredClone(completion),
            }),
          );
          const receipt = await task.wait(() => verifyReceipt(answer, request, options.pin, parts));
          if (!same(receipt.offer, offer) || !same(receipt.completion, completion))
            throw Error('Admission receipt changed');
          await save('admission-receipted', { request, offer, completion, receipt });
          return receipt;
        },
        async (marker) => {
          if (marker.v === 2) {
            const nonce = hex(random(32));
            const proof = await task.wait(() =>
              options.transport.inspect({
                retryKey: options.retryKey,
                accountId: options.accountId,
                nonce,
              }),
            );
            const state = await task.wait(() => verifyPendingProof(options.pin, nonce, proof));
            if (pendingBytes(state) !== pendingBytes(marker.account))
              throw Error('Admission eligibility changed');
          }
        },
      ),
    options.signal,
  );
}
