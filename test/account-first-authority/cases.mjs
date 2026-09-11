import { genesisMessage } from '../../account-protocol/genesis.ts';
import { authorityMessage, pinBytes, parseAuthorityPin } from '../../account-protocol/authority.ts';
import { pendingMessage } from '../../account-protocol/preparation.ts';
import { bindingMessage, parseBindingProof } from '../../account-protocol/slot.ts';
import { slotBindingMessage, slotUnlockChallenge } from './node-slot.mjs';
import { activationMessage, activationNonce } from '../../account-protocol/activation.ts';
import {
  originMessage,
  epochMessage,
  offerMessage,
  receiptMessage,
  certificationMessage,
  manifestMessage,
  semanticMessage,
  requestDigest,
  activationTarget,
  parseCompletion,
} from '../../account-protocol/admission.ts';
import {
  hash,
  lp,
  schema,
  jsonBody,
  traceJson,
  traceFields,
  pinFields,
  certFields,
  memberFields,
  manifestFields,
  semanticFields,
  bindingFields,
  pendingBody,
  ordered,
  leafPaths,
} from './oracle.mjs';
export function cases(f) {
  const json = [
    ['candidate', 'candidate', f.candidate, genesisMessage, 'device'],
    ['origin', 'request', f.request, originMessage, 'bootstrap'],
    ['epoch', 'epoch', f.epoch, epochMessage, 'authority'],
    ['offer', 'offer', f.offer, offerMessage, 'authority'],
    ['receipt', 'receipt', f.receipt, receiptMessage, 'authority'],
    ['activation', 'activationContext', f.challenge.context, activationMessage, 'authority'],
  ].map(([id, type, input, runtime, signer]) => ({
    id,
    kind: 'signature',
    signer,
    input,
    paths: leafPaths(jsonBody(type, input)),
    trace: (x) =>
      traceJson(schema.messages.find((m) => m.object === type).label, jsonBody(type, x)),
    runtime,
    codec: 'json-domain',
    body: (x) => jsonBody(type, x),
  }));
  const fields = (id, input, encode, runtime, signer, paths = leafPaths(input)) => ({
    id,
    kind: signer ? 'signature' : 'digest',
    signer,
    input,
    paths,
    trace: (x) => traceFields(encode(x)),
    runtime,
    codec: 'lp',
  });
  return [
    ...json,
    fields(
      'pin',
      { pin: f.pin },
      (x) => pinFields(x.pin),
      (x) => pinBytes(parseAuthorityPin(x.pin)),
    ),
    fields(
      'bootstrap',
      { pin: f.pin, nonce: f.nonce },
      (x) => [
        'done/service-authority-bootstrap/v1',
        String(x.pin.v),
        x.pin.serviceId,
        x.pin.origin,
        x.pin.rpId,
        x.pin.authRoot,
        x.nonce,
      ],
      (x) => authorityMessage(parseAuthorityPin(x.pin), x.nonce),
      'authority',
    ),
    fields(
      'pending',
      { pin: f.pin, nonce: f.nonce, state: f.pending },
      (x) => [
        'done/pending-account-observation/v1',
        lp(...pinFields(x.pin)).toString('hex'),
        x.nonce,
        JSON.stringify(pendingBody(x.state)),
      ],
      (x) => pendingMessage(parseAuthorityPin(x.pin), x.nonce, x.state),
      'authority',
    ),
    {
      ...fields(
        'certification',
        f.request,
        certFields,
        certificationMessage,
        'device',
        [
          'candidate.workspaceId',
          'candidate.lineageId',
          'certification.approver',
          'certification.members.0.id',
          'certification.members.0.wPub',
          'certification.members.0.sPub',
          'certification.recoveryStateDigest',
        ].map((p) => p.split('.')),
      ),
      trace: (x) => ({
        ...traceFields(certFields(x)),
        memberFields: memberFields(x.certification.members[0]),
        memberDigest: hash(lp(...memberFields(x.certification.members[0]))),
      }),
    },
    fields(
      'manifest',
      f.completion.manifest,
      manifestFields,
      (x) => manifestMessage(parseCompletion({ ...f.completion, manifest: x }).manifest),
      'device',
      leafPaths(jsonBody('manifest', f.completion.manifest)).filter(
        (p) => p.join('.') !== 'signature',
      ),
    ),
    fields(
      'semantic',
      f.completion.admission,
      semanticFields,
      (x) => semanticMessage(parseCompletion({ ...f.completion, admission: x }).admission),
      'device',
      leafPaths(jsonBody('semantic', f.completion.admission)).filter(
        (p) => p.join('.') !== 'signature',
      ),
    ),
    fields(
      'binding',
      f.binding,
      bindingFields,
      (x) =>
        bindingMessage(
          parseBindingProof({
            v: 1,
            kind: 'promotion-slot-binding',
            requestDigest: f.epoch.requestDigest,
            epochHead: f.offer.head,
            stored: { binding: x, bindingSignature: '00'.repeat(64) },
          }).stored.binding,
        ),
      'authority',
    ),
    {
      ...fields(
        'unlock',
        { v: 1, principalId: f.binding.principalId, credId: f.binding.credId, nonce: f.nonce },
        (x) => ['done/slotunlock/v1', String(x.v), x.principalId, x.credId, x.nonce],
        slotUnlockChallenge,
      ),
      returnsHash: true,
    },
    {
      ...fields(
        'activation-nonce',
        f.challenge.context,
        (x) => [
          'done/promotion-activation/v1',
          hash(JSON.stringify(ordered('activationContext', x))),
        ],
        async (x) => Buffer.from(await activationNonce(x), 'base64url'),
      ),
      returnsHash: true,
    },
    {
      id: 'request-digest',
      kind: 'digest',
      input: f.request,
      paths: leafPaths(f.request),
      trace: (x) => ({
        json: JSON.stringify(ordered('request', x)),
        messageHex: Buffer.from(JSON.stringify(ordered('request', x))).toString('hex'),
      }),
      runtime: async (x) => Buffer.from(await requestDigest(x), 'hex'),
      returnsHash: true,
    },
    {
      id: 'completion-digest',
      kind: 'digest',
      input: f.completion,
      paths: leafPaths(f.completion),
      trace: (x) => ({
        json: JSON.stringify(ordered('completion', x)),
        messageHex: Buffer.from(JSON.stringify(ordered('completion', x))).toString('hex'),
      }),
      runtime: async (x) =>
        Buffer.from((await activationTarget(f.request, f.offer, x)).completionDigest, 'hex'),
      returnsHash: true,
    },
  ];
}
export const runtimeBytes = async (c, input) => Buffer.from(await c.runtime(input));
export const expectedBytes = (c, input) => {
  const b = Buffer.from(c.trace(input).messageHex, 'hex');
  return c.returnsHash ? Buffer.from(hash(b), 'hex') : b;
};
export async function assertSlotInterop(assert, f) {
  assert.deepEqual(Buffer.from(slotBindingMessage(f.binding)), lp(...bindingFields(f.binding)));
}
